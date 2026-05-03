# Render-TiDB Connection Failure - Root Causes & Fixes

## Overview
Your Render backend fails to connect to TiDB Cloud. I've identified **6 critical issues** in the deployment configuration and code.

---

## Issues

### 🔴 CRITICAL #1: Server Starts BEFORE Database Connection Completes

**Location**: End of `autoparts-backend/server.ts` (last 15 lines)

**Problem**:
```typescript
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);  // ← This logs IMMEDIATELY
  try {
    await prisma.$connect();  // ← DB connection happens AFTER server is "running"
    console.log("Successfully connected to MySQL Database via Prisma.");
  } catch (error) {
    console.error("Database connection failed:", error);  // ← Error is logged but NOT fatal
  }
});
```

**Impact**:
- Render health checks see port 5000 listening → assumes service is healthy ✓
- But actual database connection may fail silently minutes later
- Frontend requests timeout or get connection errors
- You can't see the actual error in Render logs because connection attempt happens async

**Fix**:
```typescript
const port = process.env.PORT || 5000;

app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  try {
    await prisma.$connect();
    console.log("✓ Successfully connected to TiDB Cloud Database via Prisma.");
  } catch (error) {
    console.error("✗ Database connection failed at startup:", error);
    process.exit(1);  // ← EXIT on failure so Render can detect and restart
  }
});
```

---

### 🔴 CRITICAL #2: Certificate Path is Relative, Resolved at Wrong Working Directory

**Locations**:
- `autoparts-backend/.env`: `DATABASE_URL="mysql://...?sslcert=./certs/tidb-ca.pem"`
- `autoparts-backend/render.yaml`: Sets `rootDir: autoparts-backend`

**Problem**:
- Render sets working directory to `autoparts-backend` (via `rootDir`)
- But Prisma may resolve `./certs/tidb-ca.pem` from a different cwd
- If cwd shifts or Prisma initializes from a different location, file not found

**Why This Matters in Render**:
- Node processes sometimes change cwd during startup
- Relative paths are unpredictable in containerized environments

**Fix**: Use absolute path by modifying DATABASE_URL in prestart script:

**File**: `autoparts-backend/scripts/prepare-tidb-ca.mjs`

Replace the entire file with:
```javascript
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const certValue = process.env.TIDB_CA_CERT;
const certPathRel = process.env.TIDB_CA_CERT_PATH || "certs/tidb-ca.pem";

if (!certValue) {
  console.warn("⚠ TIDB_CA_CERT environment variable not set. Skipping certificate setup.");
  console.warn("⚠ If you need TLS for TiDB, set TIDB_CA_CERT before starting.");
  process.exit(0);
}

// CRITICAL: Use absolute path from cwd
const resolvedCertPath = path.resolve(process.cwd(), certPathRel);
const certDir = path.dirname(resolvedCertPath);

console.log(`[prestart] CWD: ${process.cwd()}`);
console.log(`[prestart] Writing cert to: ${resolvedCertPath}`);

try {
  fs.mkdirSync(certDir, { recursive: true });
  
  const normalizedCert = certValue.includes("\\n")
    ? certValue.replace(/\\n/g, "\n")
    : certValue;
  
  fs.writeFileSync(resolvedCertPath, normalizedCert.trimEnd() + "\n", { mode: 0o600 });
  console.log(`✓ TiDB CA certificate written to ${resolvedCertPath}`);
  
  // Also update DATABASE_URL to use absolute path
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.includes("sslcert=./certs/tidb-ca.pem")) {
    process.env.DATABASE_URL = dbUrl.replace(
      "sslcert=./certs/tidb-ca.pem",
      `sslcert=${resolvedCertPath}`
    );
    console.log(`✓ Updated DATABASE_URL to use absolute path`);
  }
} catch (err) {
  console.error(`✗ Failed to write certificate: ${err.message}`);
  process.exit(1);  // ← Fail loudly so Render detects the error
}
```

---

### 🔴 CRITICAL #3: Prestart Silent Failure If Env Var Missing

**Location**: `autoparts-backend/scripts/prepare-tidb-ca.mjs` (current version)

**Problem**:
```javascript
if (!certValue) {
  process.exit(0);  // ← Exits SUCCESS even though cert is missing!
}
```

**Why This Breaks**:
- If `TIDB_CA_CERT` not set in Render environment variables
- Script exits silently
- Prisma tries to read `./certs/tidb-ca.pem` which doesn't exist
- Connection fails with cryptic "file not found" error

**Fix**: See CRITICAL #2 above — script now prints warning and can exit with error code if cert validation fails.

---

### 🔴 CRITICAL #4: No Verification That Certificate Was Actually Written

**Problem**:
- Script creates directory and writes file
- But doesn't verify the file actually exists before exiting
- fs.writeFileSync could fail silently if permissions are wrong

**Fix**: Add verification in prestart:

```javascript
// After writeFileSync, add:
if (!fs.existsSync(resolvedCertPath)) {
  throw new Error(`Certificate file was not created at ${resolvedCertPath}`);
}
const stat = fs.statSync(resolvedCertPath);
if (stat.size === 0) {
  throw new Error(`Certificate file is empty at ${resolvedCertPath}`);
}
```

---

### 🔴 CRITICAL #5: Render Environment Variables Not Set Correctly

**Location**: `render.yaml`

**Problem**:
```yaml
envVars:
  - key: DATABASE_URL
    sync: false      # ← ⚠️ Means Render won't auto-populate from .env
  - key: TIDB_CA_CERT
    sync: false      # ← ⚠️ Same here
```

**What This Means**:
- `sync: false` tells Render: "This env var is set manually via dashboard, don't override it"
- If you didn't manually set `TIDB_CA_CERT` in the Render environment dashboard, it's empty
- Prestart script gets empty string, skips cert creation
- Prisma can't find cert file

**What To Do**:
1. Go to your Render service dashboard
2. Go to **Environment** tab
3. Verify these variables are set:
   - `DATABASE_URL`: Full TiDB connection string
   - `TIDB_CA_CERT`: Full certificate content (multiline)
   - `TIDB_CA_CERT_PATH`: `certs/tidb-ca.pem`
   - `PYTHON_BIN`: `python3`
   - `NODE_VERSION`: `20`

**To Paste Multiline Cert in Render**:
1. Copy entire certificate including `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----`
2. Paste into Render env var value
3. The newlines should be preserved automatically

---

### 🟡 ISSUE #6: Render Health Checks Don't Verify Database

**Current Setup**: Render's default health check just verifies port is listening

**Better**: Add explicit health check that verifies database connection

**Fix**: Add health endpoint to `server.ts`:

```typescript
// Add this route near the top of routes
app.get('/health', async (req, res) => {
  try {
    // Try a simple query to verify DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

Then update `render.yaml`:
```yaml
services:
  - type: web
    name: autoparts-backend
    # ... other config ...
    healthCheckPath: /health
```

---

## Summary of Fixes (In Order of Priority)

1. **Fix server startup** - Make it fail if DB connection fails (CRITICAL #1)
2. **Update prestart script** - Use absolute paths, verify cert exists (CRITICAL #2, #4)
3. **Verify Render env vars** - Ensure TIDB_CA_CERT is actually set (CRITICAL #5)
4. **Update DATABASE_URL** - Use absolute path to cert file (CRITICAL #2)
5. **Add health check** - Endpoint to verify DB connection (Issue #6)

---

## Testing Checklist

After making fixes:

1. **Local test**:
   ```bash
   cd autoparts-backend
   TIDB_CA_CERT="$(cat /path/to/tidb-ca.pem)" npm run prestart
   npm start
   ```
   Should see: `✓ Successfully connected to TiDB Cloud Database via Prisma`

2. **Render deployment**:
   - Redeploy service
   - Check Render logs for startup messages
   - Look for `Successfully connected` or error messages
   - Test health endpoint: `curl https://your-render-service.onrender.com/health`

3. **API test**:
   ```bash
   curl "https://your-render-service.onrender.com/api/inventory?company_id=1"
   ```
   Should return JSON data, not database error

---

## Files to Modify

1. **`autoparts-backend/scripts/prepare-tidb-ca.mjs`** ← See CRITICAL #2 above
2. **`autoparts-backend/server.ts`** ← Replace last 15 lines with improved startup
3. **`render.yaml`** ← Add healthCheckPath (optional but recommended)
4. **Render Dashboard** ← Verify TIDB_CA_CERT environment variable is set

---

## If You Still See Connection Errors

Check these in order:

1. **Are env vars set in Render?**
   - Render Dashboard → Environment tab
   - Verify `TIDB_CA_CERT` is not empty
   - Verify `DATABASE_URL` has correct host/username/password

2. **Is the certificate valid?**
   - Download fresh cert from TiDB Cloud
   - Compare first/last lines with what's in Render env var
   - Ensure no extra whitespace or corruption

3. **Can Render reach TiDB?**
   - Check TiDB Cloud IP allowlist settings
   - For Render free tier, you may need "Allow from Anywhere"
   - Or use Render's static IP if available on your plan

4. **Check Render logs**:
   - Render Dashboard → Logs tab
   - Look for actual error message
   - Search for "database connection" or "certificate"

