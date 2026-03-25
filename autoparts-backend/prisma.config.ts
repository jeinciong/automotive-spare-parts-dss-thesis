import "dotenv/config"; // Important: Loads your .env variables
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // This uses the Prisma helper instead of process.env
    url: env("DATABASE_URL"), 
  },
});