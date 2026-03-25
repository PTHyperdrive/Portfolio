// Prisma CLI configuration for migrations and schema management.
// Load .env.local first (where real credentials live), fall back to .env
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local (Next.js convention for real credentials)
config({ path: ".env.local" });
// Fall back to .env for any missing vars (no override)
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
