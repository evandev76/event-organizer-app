import express from "express";
import rateLimit from "express-rate-limit";

import { prisma } from "../prisma.js";
import { bad, ok } from "../http.js";
import {
  cookieName,
  sessionCookieOptions,
  createSession,
  revokeSession,
  SignupSchema,
  LoginSchema,
  ResetRequestSchema,
  ResetConfirmSchema,
  hashPassword,
  verifyPassword,
  createPasswordResetToken,
  consumePasswordResetToken,
} from "../auth.js";
import { sendPasswordResetEmail } from "../mailer.js";
import { requireAuth } from "../middleware/requireAuth.js";

export function authRouter() {
  const r = express.Router();

  const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
  const resetLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  r.get("/me", requireAuth, (req, res) => {
    const u = req.user;
    return ok(res, { user: { id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt } });
  });

  r.post("/signup", authLimiter, async (req, res) => {
    const parsed = SignupSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Champs invalides.");
    const { email, password, displayName } = parsed.data;
    const dn = displayName || email.split("@")[0].slice(0, 24) || "Utilisateur";
    const passwordHash = await hashPassword(password);

    try {
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash, displayName: dn },
      });
      const s = await createSession({ userId: user.id, ip: req.ip, userAgent: req.get("user-agent") });
      res.cookie(cookieName(), s.id, sessionCookieOptions());
      return ok(res, { user: { id: user.id, email: user.email, displayName: user.displayName } });
    } catch {
      return bad(res, 409, "Email deja utilise.");
    }
  });

  r.post("/login", authLimiter, async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Champs invalides.");
    const { email, password } = parsed.data;
    const rememberMe = Boolean(req.body?.rememberMe);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return bad(res, 401, "Identifiants invalides.");
    const okPwd = await verifyPassword(user.passwordHash, password);
    if (!okPwd) return bad(res, 401, "Identifiants invalides.");

    const s = await createSession({ userId: user.id, ip: req.ip, userAgent: req.get("user-agent") });
    res.cookie(cookieName(), s.id, sessionCookieOptions({ persistent: rememberMe }));
    return ok(res, { user: { id: user.id, email: user.email, displayName: user.displayName } });
  });

  r.post("/logout", async (req, res) => {
    const sid = req.cookies?.[cookieName()] || "";
    await revokeSession(sid);
    res.clearCookie(cookieName(), sessionCookieOptions());
    return ok(res, {});
  });

  // Password reset (V1): request + confirm.
  r.post("/password/reset/request", resetLimiter, async (req, res) => {
    const parsed = ResetRequestSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Champs invalides.");
    const { email } = parsed.data;

    // Always return ok (avoid email enumeration).
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const token = await createPasswordResetToken(user.id);
      const base = String(process.env.PUBLIC_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
      const resetUrl = `${base}/reset-password/${encodeURIComponent(token)}`;
      try {
        await sendPasswordResetEmail({ toEmail: user.email, resetUrl });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("mailer error:", e?.message || e);
      }
    }

    return ok(res, {});
  });

  r.post("/password/reset/confirm", resetLimiter, async (req, res) => {
    const parsed = ResetConfirmSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Champs invalides.");
    const { token, newPassword } = parsed.data;

    const rec = await consumePasswordResetToken(token);
    if (!rec) return bad(res, 400, "Token invalide ou expire.");

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } });

    // Revoke all sessions for this user.
    await prisma.session.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } });

    // Create a fresh session.
    const s = await createSession({ userId: rec.userId, ip: req.ip, userAgent: req.get("user-agent") });
    res.cookie(cookieName(), s.id, sessionCookieOptions());
    return ok(res, {});
  });

  return r;
}
