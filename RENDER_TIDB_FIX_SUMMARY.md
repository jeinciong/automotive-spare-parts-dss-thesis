# Render-TiDB Connection Fix - Quick Reference

## Problem Summary
Your Render backend fails to connect to TiDB Cloud because:
1. **Server starts before confirming DB connection** - Port appears healthy even if DB fails
2. **Certificate path issues** - Relative paths don't resolve correctly in Render
3. **Silent failures** - Errors aren't propagated loudly enough for detection

## Solution Implemented ✅

### 3 Files Modified

#### 1. `autoparts-backend/scripts/prepare-tidb-ca.mjs`
```javascript
// Added:
- Absolute path resolution for cert file
- File validation (exists + not empty)
- Explicit error exit if cert setup fails
- Debug logging with full paths
```

#### 2. `autoparts-backend/server.ts`
```typescript
// Changed server startup from:
catch (error) {
  console.error("Database connection failed:", error);  // Silent failure!
}

// To:
catch (error: any) {
  console.error("✗ [Server] FATAL: Database connection failed at startup");
  console.error("✗ [Server] Error:", error?.message);
  process.exit(1);  // Exit so Render can restart
}

// Also added:
app.get('/health', async (req, res) => {
  // Verify DB connection with each request
  // Used by Render health checks
});
```

#### 3. `render.yaml`
```yaml
# Added:
healthCheckPath: /health
```

---

## Deployment Instructions

### Step 1: Verify Render Environment Variables
Go to your Render service dashboard:
1. **Settings** tab → **Environment**
2. Check these are set (NOT empty):
   - ✅ `DATABASE_URL` - Full TiDB connection string
   - ✅ `TIDB_CA_CERT` - **Full certificate content** (multiline is OK)
   - ✅ `TIDB_CA_CERT_PATH` - `certs/tidb-ca.pem`
   - ✅ `PYTHON_BIN` - `python3`
   - ✅ `NODE_VERSION` - `20`

### Step 2: Redeploy
```
Render Dashboard → Services → autoparts-backend → Logs tab → Manual Deploy
```

### Step 3: Watch Startup Logs
Look for these messages (in order):
```
[prestart] Current working directory: /opt/render/project/src/autoparts-backend
[prestart] Writing TiDB CA certificate to: /opt/render/project/src/autoparts-backend/certs/tidb-ca.pem
✓ TiDB CA certificate successfully written (1234 bytes)
✓ Updated DATABASE_URL to use absolute certificate path
[Server] Listening on port 5000
✓ [Server] Successfully connected to TiDB Cloud Database via Prisma.
[Server] Ready to accept requests at http://localhost:5000
```

### Step 4: Test Health Endpoint
```bash
curl https://your-render-service.onrender.com/health
```
Should return:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-05-03T...",
  "uptime": 45.123
}
```

### Step 5: Test API Endpoint
```bash
curl "https://your-render-service.onrender.com/api/inventory?business_id=1"
```
Should return JSON data (even if empty array for new DB)

---

## Troubleshooting

### If Deployment Still Fails

**Check logs for these error messages:**

1. **"TIDB_CA_CERT environment variable not set"**
   - Action: Set `TIDB_CA_CERT` in Render Environment variables
   - Make sure to paste the ENTIRE certificate (BEGIN to END)

2. **"Certificate file was not created"**
   - Action: Check cert content for invalid characters
   - Try copy/pasting certificate again from TiDB Cloud

3. **"Can't reach database server"** or **"Access denied"**
   - Action: Check TiDB Cloud IP allowlist
   - Make sure Render IP is allowed (or use "Allow Anywhere" for testing)
   - Verify DATABASE_URL has correct username/password

4. **"Cannot find module 'prisma'"** or **"Cannot connect to database"**
   - Action: Full rebuild on Render
   - Render Dashboard → redeploy with build cache cleared

### If Health Check Returns "unhealthy"

```
curl https://your-render-service.onrender.com/health
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "..."
}
```

**Causes:**
1. TiDB Cloud cluster is paused → Unpause it
2. TiDB Cloud IP allowlist doesn't include Render
3. Certificate expired or invalid
4. Render instance restarted and lost connection → Wait 30 seconds

---

## Files Modified
- ✅ `autoparts-backend/scripts/prepare-tidb-ca.mjs` - Cert setup with validation
- ✅ `autoparts-backend/server.ts` - Startup error handling + health check
- ✅ `render.yaml` - Added health check path
- 📄 `RENDER_TIDB_FIXES.md` - Detailed explanation of all issues and fixes
- 📄 `TIDB_CLOUD_SETUP.md` - Updated with new improvements section

---

## Key Changes Summary

| Before | After |
|--------|-------|
| Port listening = service healthy ✗ | Port + DB connection verified ✓ |
| Cert path: relative (fragile) | Cert path: absolute (reliable) |
| DB error silently logged | DB error causes exit + restart |
| No health monitoring | `/health` endpoint for monitoring |
| Render can't detect failures | Render detects + auto-restarts |

---

## Next Steps

1. Verify all Render env vars are set
2. Redeploy the service
3. Check logs for startup messages
4. Test health endpoint
5. Test API endpoints

If you still see issues, check the detailed troubleshooting in `RENDER_TIDB_FIXES.md` or review your Render logs.

