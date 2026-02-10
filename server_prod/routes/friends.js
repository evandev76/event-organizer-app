import express from "express";
import { z } from "zod";

import { prisma } from "../prisma.js";
import { bad, ok } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";

const AddFriendSchema = z.object({ email: z.string().trim().email().max(200) });

function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function friendsRouter() {
  const r = express.Router();

  // List my friends
  r.get("/", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const rows = await prisma.friend.findMany({
      where: { OR: [{ userIdA: userId }, { userIdB: userId }] },
      select: { userIdA: true, userIdB: true, createdAt: true, userA: { select: { id: true, email: true, displayName: true } }, userB: { select: { id: true, email: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    const friends = rows.map((f) => {
      const other = f.userIdA === userId ? f.userB : f.userA;
      return { id: other.id, email: other.email, displayName: other.displayName, since: f.createdAt.toISOString() };
    });
    return ok(res, { friends });
  });

  // Friend requests (incoming/outgoing)
  r.get("/requests", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const incoming = await prisma.friendRequest.findMany({
      where: { toUserId: userId, status: "pending" },
      select: { id: true, from: { select: { id: true, email: true, displayName: true } }, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const outgoing = await prisma.friendRequest.findMany({
      where: { fromUserId: userId, status: "pending" },
      select: { id: true, to: { select: { id: true, email: true, displayName: true } }, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, {
      incoming: incoming.map((r) => ({ id: r.id, from: r.from, createdAt: r.createdAt.toISOString() })),
      outgoing: outgoing.map((r) => ({ id: r.id, to: r.to, createdAt: r.createdAt.toISOString() })),
    });
  });

  // Send friend request by email (exact match)
  r.post("/requests", requireAuth, async (req, res) => {
    const parsed = AddFriendSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Email invalide.");
    const fromUserId = req.user.id;
    const email = parsed.data.email.toLowerCase();
    const to = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, displayName: true } });
    if (!to) return bad(res, 404, "Utilisateur introuvable.");
    if (to.id === fromUserId) return bad(res, 400, "Impossible de t'ajouter toi-meme.");

    // Blocks (if enabled) should prevent this (we enforce if Block table is used)
    const blocked = await prisma.block.findFirst({
      where: { OR: [{ blockerUserId: to.id, blockedUserId: fromUserId }, { blockerUserId: fromUserId, blockedUserId: to.id }] },
      select: { id: true },
    });
    if (blocked) return bad(res, 403, "Acces refuse.");

    const [a, b] = orderPair(fromUserId, to.id);
    const alreadyFriends = await prisma.friend.findUnique({ where: { userIdA_userIdB: { userIdA: a, userIdB: b } } }).catch(() => null);
    if (alreadyFriends) return ok(res, { request: null });

    // If there is an inverse pending request, accept directly
    const inverse = await prisma.friendRequest.findUnique({
      where: { fromUserId_toUserId: { fromUserId: to.id, toUserId: fromUserId } },
    });
    if (inverse && inverse.status === "pending") {
      await prisma.friendRequest.update({ where: { id: inverse.id }, data: { status: "accepted" } });
      await prisma.friend.create({ data: { userIdA: a, userIdB: b } }).catch(() => {});
      return ok(res, { request: null });
    }

    const fr = await prisma.friendRequest.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId: to.id } },
      update: { status: "pending" },
      create: { fromUserId, toUserId: to.id, status: "pending" },
      select: { id: true, to: { select: { id: true, email: true, displayName: true } }, createdAt: true },
    });
    return ok(res, { request: { id: fr.id, to: fr.to, createdAt: fr.createdAt.toISOString() } });
  });

  // Accept request
  r.post("/requests/:id/accept", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const id = String(req.params.id || "");
    const fr = await prisma.friendRequest.findUnique({ where: { id } });
    if (!fr || fr.toUserId !== userId) return bad(res, 404, "Demande introuvable.");
    if (fr.status !== "pending") return bad(res, 400, "Demande invalide.");
    await prisma.friendRequest.update({ where: { id }, data: { status: "accepted" } });
    const [a, b] = orderPair(fr.fromUserId, fr.toUserId);
    await prisma.friend.create({ data: { userIdA: a, userIdB: b } }).catch(() => {});
    return ok(res, {});
  });

  // Decline request
  r.post("/requests/:id/decline", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const id = String(req.params.id || "");
    const fr = await prisma.friendRequest.findUnique({ where: { id } });
    if (!fr || fr.toUserId !== userId) return bad(res, 404, "Demande introuvable.");
    if (fr.status !== "pending") return bad(res, 400, "Demande invalide.");
    await prisma.friendRequest.update({ where: { id }, data: { status: "declined" } });
    return ok(res, {});
  });

  // Cancel outgoing request
  r.post("/requests/:id/cancel", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const id = String(req.params.id || "");
    const fr = await prisma.friendRequest.findUnique({ where: { id } });
    if (!fr || fr.fromUserId !== userId) return bad(res, 404, "Demande introuvable.");
    if (fr.status !== "pending") return bad(res, 400, "Demande invalide.");
    await prisma.friendRequest.update({ where: { id }, data: { status: "cancelled" } });
    return ok(res, {});
  });

  // Unfriend
  r.delete("/:otherUserId", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const other = String(req.params.otherUserId || "");
    if (!other) return bad(res, 400, "Id invalide.");
    const [a, b] = orderPair(userId, other);
    await prisma.friend.deleteMany({ where: { userIdA: a, userIdB: b } });
    return ok(res, {});
  });

  return r;
}

