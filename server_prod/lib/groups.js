import { nanoid } from "nanoid";
import { prisma } from "../prisma.js";

export function normalizeGroupCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "");
}

export async function findGroupByCode(codeRaw) {
  const code = normalizeGroupCode(codeRaw);
  if (!code) return null;
  return prisma.group.findUnique({ where: { code } });
}

export async function createGroupCode() {
  // Human friendly code: 8 chars, uppercase.
  for (let i = 0; i < 8; i++) {
    const code = nanoid(10).toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 8);
    const exists = await prisma.group.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Impossible de generer un code.");
}

