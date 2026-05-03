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

// CRITICAL: Use absolute path from cwd to ensure consistent resolution
const resolvedCertPath = path.resolve(process.cwd(), certPathRel);
const certDir = path.dirname(resolvedCertPath);

console.log(`[prestart] Current working directory: ${process.cwd()}`);
console.log(`[prestart] Writing TiDB CA certificate to: ${resolvedCertPath}`);

try {
  fs.mkdirSync(certDir, { recursive: true });
  
  const normalizedCert = certValue.includes("\\n")
    ? certValue.replace(/\\n/g, "\n")
    : certValue;
  
  fs.writeFileSync(resolvedCertPath, normalizedCert.trimEnd() + "\n", { mode: 0o600 });
  
  // Verify the file was actually created
  if (!fs.existsSync(resolvedCertPath)) {
    throw new Error(`Certificate file was not created at ${resolvedCertPath}`);
  }
  
  const stat = fs.statSync(resolvedCertPath);
  if (stat.size === 0) {
    throw new Error(`Certificate file is empty at ${resolvedCertPath}`);
  }
  
  console.log(`✓ TiDB CA certificate successfully written (${stat.size} bytes)`);
  
  // Update DATABASE_URL to use absolute path if needed
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("sslcert=./certs/tidb-ca.pem")) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
      "sslcert=./certs/tidb-ca.pem",
      `sslcert=${resolvedCertPath}`
    );
    console.log(`✓ Updated DATABASE_URL to use absolute certificate path`);
  }
} catch (err) {
  console.error(`✗ FATAL: Failed to set up TiDB CA certificate: ${err.message}`);
  process.exit(1);
}
