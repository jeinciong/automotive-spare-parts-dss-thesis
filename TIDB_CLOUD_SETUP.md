# TiDB Cloud Setup Guide

This guide moves the backend database from the local MySQL database in `autoparts-backend/.env` to TiDB Cloud while keeping the current Prisma schema and migrations.

Do not commit real database passwords or private connection strings.

## 1. Create The TiDB Cloud Database

1. Sign in to TiDB Cloud.
2. Create a TiDB Cloud cluster. Starter or Serverless is fine for thesis/demo use.
3. Open the cluster, then click `Connect`.
4. Choose the public connection option.
5. Create or copy the database password. Save it somewhere secure because TiDB Cloud might not show it again.
6. If TiDB Cloud asks for an IP access list, allow your deployment host:
   - For local setup, allow your current IP.
   - For Render, use Render's outbound IPs if your plan provides static outbound IPs.
   - For simple testing only, TiDB Cloud may offer an `Allow Access from Anywhere` option.

## 2. Create A Database Name

This project expects one MySQL-compatible database. Use a database name like:

```sql
autoparts_dss
```

You can create it from TiDB Cloud SQL Shell or from a MySQL client:

```sql
CREATE DATABASE IF NOT EXISTS autoparts_dss;
```

## 3. Build The `DATABASE_URL`

Your local backend currently uses these environment variables:

```env
PORT=5000
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DATABASE_URL=...
PYTHON_BIN=...
```

For TiDB Cloud, Prisma only needs `DATABASE_URL`.

Use this shape:

```env
DATABASE_URL="mysql://USERNAME:PASSWORD@HOST:4000/autoparts_dss?sslaccept=strict&sslcert=./certs/tidb-ca.pem"
```

Replace:

- `USERNAME` with the TiDB Cloud username from the connection dialog.
- `PASSWORD` with the generated TiDB Cloud password.
- `HOST` with the TiDB Cloud host.
- `autoparts_dss` with the database name you created.

If your username or password contains special characters, URL-encode them. For example, `@` becomes `%40`.

## 4. Add The TiDB CA Certificate

For public TiDB Cloud connections, use TLS.

1. In the TiDB Cloud connection dialog, download the CA certificate.
2. For local development, create this folder:

```powershell
mkdir autoparts-backend\certs
```

3. Save the certificate as:

```text
autoparts-backend/certs/tidb-ca.pem
```

The `.gitignore` excludes `autoparts-backend/certs/*.pem`, so the downloaded certificate is not committed by default.

For Render, do not upload a `.pem` file manually. Instead, paste the certificate contents into the `TIDB_CA_CERT` environment variable. The backend `prestart` script writes it to `certs/tidb-ca.pem` before the API starts.

## 5. Update Local Backend `.env`

In `autoparts-backend/.env`, set:

```env
PORT=5000
PYTHON_BIN=python
DATABASE_URL="mysql://USERNAME:PASSWORD@HOST:4000/autoparts_dss?sslaccept=strict&sslcert=./certs/tidb-ca.pem"
```

The older `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` values can stay for reference, but the current Prisma backend reads `DATABASE_URL`.

## 6. Apply This Project's Schema

From the backend folder:

```powershell
cd autoparts-backend
npm install
npx prisma generate
npx prisma migrate deploy
```

This applies the existing migrations:

- `20260325012808_init`
- `20260426000000_recommendation_action_history`

If you are setting up a temporary demo database and migrations fail because the database is not empty, inspect the existing tables first before running destructive commands.

## 7. Test The Backend Locally

From `autoparts-backend`:

```powershell
npm run dev
```

Then test a simple endpoint:

```powershell
Invoke-WebRequest "http://localhost:5000/api/inventory?company_id=1"
```

An empty JSON array is fine for a new database. A database connection error means the `DATABASE_URL`, CA certificate path, password, IP allowlist, or database name is wrong.

## 8. Configure Render

In Render, set backend environment variables:

```env
DATABASE_URL=mysql://USERNAME:PASSWORD@HOST:4000/autoparts_dss?sslaccept=strict&sslcert=./certs/tidb-ca.pem
TIDB_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
TIDB_CA_CERT_PATH=certs/tidb-ca.pem
PYTHON_BIN=python3
NODE_VERSION=20
```

If Render's UI supports multiline secret values, you can paste the certificate normally. If it does not, replace each newline with `\n`; the backend script supports both formats.

Render build/start settings are already in `render.yaml`:

```yaml
buildCommand: npm install --include=dev && npm run build && python3 -m pip install -r python/requirements.txt
startCommand: npm start
```

`npm run build` uses `scripts/generate-prisma.mjs`, which can generate Prisma Client even if Render has not loaded `DATABASE_URL` yet. Runtime still requires the real TiDB `DATABASE_URL`.

After Render deploys, copy the Render backend URL.

## 9. Configure Vercel Frontend

In the Vercel frontend project, set:

```env
VITE_API_URL=https://your-render-backend.onrender.com
```

Redeploy the frontend after setting the variable.

## 10. Optional: Import Existing Local Data

If your local MySQL database already has data, export it with MySQL tools, then import it into TiDB Cloud.

Example export:

```powershell
mysqldump -h LOCAL_HOST -u LOCAL_USER -p LOCAL_DB_NAME > autoparts-local-backup.sql
```

Example import:

```powershell
mysql -h TIDB_HOST -P 4000 -u TIDB_USER -p --ssl-ca=autoparts-backend/certs/tidb-ca.pem autoparts_dss < autoparts-local-backup.sql
```

For a new demo setup, you can skip this and register a company from the app UI.

## Troubleshooting

- `Missing required environment variable: DATABASE_URL`: set `DATABASE_URL` in Render or in `autoparts-backend/.env`.
- `Access denied`: check username, password, URL encoding, and TiDB Cloud password generation.
- `Can't connect to MySQL server`: check the TiDB host, port `4000`, and IP access list.
- TLS or certificate errors: confirm `sslaccept=strict` and that `./certs/tidb-ca.pem` exists relative to `autoparts-backend`.
- On Render, TLS errors usually mean `TIDB_CA_CERT` is empty, malformed, or has missing newline characters.
- Prisma migration errors: run `npx prisma migrate status` from `autoparts-backend`.
