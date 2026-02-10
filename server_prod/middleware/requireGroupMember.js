import { prisma } from "../prisma.js";

export async function requireGroupMember(req, res, next) {
  const userId = req.user?.id;
  const groupId = req.group?.id;
  if (!userId || !groupId) return res.status(403).json({ ok: false, error: "Acces refuse." });
  const m = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true, role: true },
  });
  if (!m) return res.status(403).json({ ok: false, error: "Tu n'es pas membre de ce groupe." });
  req.membership = m;
  return next();
}

