import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { randomToken, sha256Base64Url } from "./crypto.js";

const COOKIE_NAME = String(process.env.SESSION_COOKIE_NAME || "kifekoi_session");

export function cookieName() {
  return COOKIE_NAME;
}

export function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  };
}

export async function createSession({ userId, ip, userAgent }) {
  const id = randomToken(32);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
  await prisma.session.create({
    data: { id, userId, expiresAt, ip: ip || null, userAgent: userAgent || null },
  });
  return { id, expiresAt };
}

export async function revokeSession(sessionId) {
  if (!sessionId) return;
  await prisma.session.updateMany({
    where: { id: String(sessionId), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getSession(sessionId) {
  if (!sessionId) return null;
  const s = await prisma.session.findUnique({ where: { id: String(sessionId) } });
  if (!s) return null;
  if (s.revokedAt) return null;
  if (new Date(s.expiresAt).getTime() <= Date.now()) return null;
  return s;
}

export async function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "Non connecte." });
  return next();
}

export const SignupSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(24).optional(),
});

export const LoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const ResetRequestSchema = z.object({
  email: z.string().trim().email().max(200),
});

export const ResetConfirmSchema = z.object({
  token: z.string().min(20).max(300),
  newPassword: z.string().min(8).max(200),
});

export async function hashPassword(password) {
  return argon2.hash(String(password), { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(String(hash), String(password));
  } catch {
    return false;
  }
}

export async function createPasswordResetToken(userId) {
  const token = randomToken(32);
  const tokenHash = sha256Base64Url(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  return token;
}

export async function consumePasswordResetToken(token) {
  const tokenHash = sha256Base64Url(token);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!rec) return null;
  if (rec.usedAt) return null;
  if (new Date(rec.expiresAt).getTime() <= Date.now()) return null;

  await prisma.passwordResetToken.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });

  return rec;
}

