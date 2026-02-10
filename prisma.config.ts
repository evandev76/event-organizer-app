import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma v7: datasource URLs are configured here (not in schema.prisma).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

