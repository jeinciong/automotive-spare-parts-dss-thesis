import "dotenv/config"; // Important: Loads your .env variables
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
});
