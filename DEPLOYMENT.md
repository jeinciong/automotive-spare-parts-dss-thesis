# Deployment Notes

## Frontend on Vercel

Deploy `autoparts-frontend` as a Vercel project.

- Framework preset: Vite
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
  - `PYTHON_BIN=python3`

The backend runs as a long-lived Express service with `tsx server.ts`, uses Prisma for MySQL, and installs the Python packages needed by the forecasting scripts.
