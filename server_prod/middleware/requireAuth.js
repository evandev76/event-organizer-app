export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "Non connecte." });
  return next();
}

