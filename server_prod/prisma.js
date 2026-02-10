import * as prismaPkg from "@prisma/client";
import * as pgPkg from "pg";
import * as adapterPkg from "@prisma/adapter-pg";

// Support both CJS and ESM shapes.
const PrismaClient = prismaPkg?.PrismaClient || prismaPkg?.default?.PrismaClient;
const Pool = pgPkg?.Pool || pgPkg?.default?.Pool;
const PrismaPg = adapterPkg?.PrismaPg || adapterPkg?.default?.PrismaPg;

// In dev we want a singleton to avoid exhausting connections on hot reload.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__kifekoi_prisma ||
  (() => {
    const connectionString = String(process.env.DATABASE_URL || "").trim();
    if (!connectionString) throw new Error("DATABASE_URL manquant (voir .env).");
    if (!PrismaClient) throw new Error("@prisma/client: PrismaClient introuvable. Lance `npx prisma generate` puis relance le serveur.");
    if (!Pool) throw new Error("pg: Pool introuvable (package pg manquant).");
    if (!PrismaPg) throw new Error("@prisma/adapter-pg: PrismaPg introuvable (adapter manquant).");
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  })();

if (process.env.NODE_ENV !== "production") globalForPrisma.__kifekoi_prisma = prisma;
