# Deployment Notes

## Frontend on Vercel

Deploy `autoparts-frontend` as a Vercel project.

- Framework preset: Vite
- If the Vercel project root is the repository root:
  - Install command: `npm --prefix autoparts-frontend install`
  - Build command: `npm --prefix autoparts-frontend run build`
  - Output directory: `autoparts-frontend/build`
- If the Vercel project root is `autoparts-frontend`:
  - Build command: `npm run build`
  - Output directory: `build`
- Environment variable:
  - `VITE_API_URL`: the deployed Render backend origin, for example `https://autoparts-backend.onrender.com`

For local development, requests to `/api` are proxied to `http://localhost:5000` by `vite.config.ts`.

## Backend on Render

Deploy `autoparts-backend` as a Render web service. The repo includes `render.yaml` at the repository root for Blueprint deployment.

- Root directory: `autoparts-backend`
- Runtime: Node
- Build command: `npm install --include=dev && npm run build && python3 -m pip install -r python/requirements.txt`
- Start command: `npm start`
- Required environment variables:
  - `DATABASE_URL`
  - `TIDB_CA_CERT` if the database is TiDB Cloud with `sslcert=./certs/tidb-ca.pem`
  - `TIDB_CA_CERT_PATH=certs/tidb-ca.pem`
  - `PYTHON_BIN=python3`

The backend runs as a long-lived Express service with `tsx server.ts`, uses Prisma for MySQL, and installs the Python packages needed by the forecasting scripts.

For TiDB Cloud database setup, see `TIDB_CLOUD_SETUP.md`.

## Common Vercel/TiDB Mistake

The Vercel deployment should only host the frontend. It should not run Prisma, MySQL, TiDB, Python forecasting, or the Express backend.

If the app shows a database connection error while opened from Vercel, check these in order:

1. In Vercel, set `VITE_API_URL` to the Render backend URL, not the TiDB URL.

```env
VITE_API_URL=https://your-render-backend.onrender.com
```

2. Redeploy Vercel after setting `VITE_API_URL`. Vite environment variables are baked into the frontend build.

3. Open this in the browser:

```text
https://your-render-backend.onrender.com/api/inventory?company_id=1
```

If this endpoint shows a database error, fix Render/Aiven settings. If it works, fix the Vercel `VITE_API_URL`.

4. Do not put `DATABASE_URL` in the Vercel frontend project. `DATABASE_URL` belongs only in Render.
