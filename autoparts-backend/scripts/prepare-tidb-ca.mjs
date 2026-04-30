import fs from "node:fs";
import path from "node:path";

const certValue = process.env.TIDB_CA_CERT;
const certPath = process.env.TIDB_CA_CERT_PATH || "certs/tidb-ca.pem";

if (!certValue) {
  process.exit(0);
}

const resolvedCertPath = path.resolve(process.cwd(), certPath);
fs.mkdirSync(path.dirname(resolvedCertPath), { recursive: true });

const normalizedCert = certValue.includes("\\n")
  ? certValue.replace(/\\n/g, "\n")
  : certValue;

fs.writeFileSync(resolvedCertPath, normalizedCert.trimEnd() + "\n", { mode: 0o600 });
console.log(`TiDB CA certificate written to ${certPath}`);
