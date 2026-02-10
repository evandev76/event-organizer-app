import { prisma } from "../prisma.js";
import { cookieName, getSession } from "../auth.js";

export async function attachUserFromSession(req, _res, next) {
  try {
    const sid = req.cookies?.[cookieName()] || "";
    const s = await getSession(sid);
    if (!s) {
      req.session = null;
      req.user = null;
      return next();
    }
    req.session = s;
    req.user = await prisma.user.findUnique({ where: { id: s.userId } });
    return next();
  } catch {
    req.session = null;
    req.user = null;
    return next();
  }
}

