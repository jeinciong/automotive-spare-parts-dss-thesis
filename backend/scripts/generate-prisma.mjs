import { spawnSync } from "node:child_process";

// `prisma generate` does not connect to the database, but Prisma still
// validates that DATABASE_URL exists while loading the schema.
process.env.DATABASE_URL ||= "mysql://user:password@localhost:3306/autoparts_dss";

const isWindows = process.platform === "win32";
const prismaBin = isWindows ? "node_modules\\.bin\\prisma.cmd" : "node_modules/.bin/prisma";

const result = spawnSync(prismaBin, ["generate"], {
  stdio: "inherit",
  shell: isWindows,
  env: process.env,
});

process.exit(result.status ?? 1);
