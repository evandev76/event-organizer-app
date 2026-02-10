import express from "express";
import { z } from "zod";

import { prisma } from "../prisma.js";
import { bad, ok } from "../http.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { randomToken } from "../crypto.js";
import { createGroupCode, findGroupByCode, normalizeGroupCode } from "../lib/groups.js";

const CreateGroupSchema = z.object({ name: z.string().trim().min(1).max(40) });
const CreateEventSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(800).default(""),
  start: z.string().min(10),
  end: z.string().min(10),
  reminderMinutes: z.number().int().min(0).max(24 * 60).default(0),
});

const ALLOWED_REACTIONS = new Set(["👍", "👎", "😂", "❤️", "🔥", "🎉", "😮"]);

function toDate(s) {
  const d = new Date(String(s));
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function ended(ev) {
  return new Date(ev.endAt).getTime() <= Date.now();
}

export function groupsRouter() {
  const r = express.Router();

  async function membershipFor(groupId, userId) {
    return prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, role: true },
    });
  }

  // List groups for me
  r.get("/", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const rows = await prisma.groupMembership.findMany({
      where: { userId },
      select: { role: true, group: { select: { id: true, code: true, name: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    });
    return ok(res, { groups: rows.map((x) => ({ ...x.group, role: x.role })) });
  });

  // Create group
  r.post("/", requireAuth, async (req, res) => {
    const parsed = CreateGroupSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Nom de groupe invalide.");
    const code = await createGroupCode();
    const userId = req.user.id;

    const group = await prisma.group.create({
      data: {
        code,
        name: parsed.data.name,
        ownerId: userId,
        memberships: { create: { userId, role: "owner" } },
      },
      select: { id: true, code: true, name: true, createdAt: true },
    });
    return ok(res, { group });
  });

  // Resolve group by code (public: exists)
  r.get("/:code", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    // Only members can fetch details (after join).
    const m = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.user.id } },
      select: { role: true },
    });
    if (!m) return bad(res, 403, "Tu dois rejoindre ce groupe.");
    return ok(res, { group: { code: group.code, name: group.name, createdAt: group.createdAt, role: m.role } });
  });

  // Join a group by code (this is the "invite link" behavior)
  r.post("/:code/join", requireAuth, async (req, res) => {
    const code = normalizeGroupCode(req.params.code);
    const group = await findGroupByCode(code);
    if (!group) return bad(res, 404, "Groupe introuvable.");

    const userId = req.user.id;
    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      update: {},
      create: { groupId: group.id, userId, role: "member" },
    });
    return ok(res, { group: { code: group.code, name: group.name, createdAt: group.createdAt } });
  });

  // Leave a group (remove membership)
  r.post("/:code/leave", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 400, "Tu n'es pas membre de ce groupe.");
    await prisma.groupMembership.delete({ where: { groupId_userId: { groupId: group.id, userId: req.user.id } } });
    return ok(res, {});
  });

  // Delete a group (owner only)
  r.delete("/:code", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    if ((mem.role || "") !== "owner") return bad(res, 403, "Seul le owner peut supprimer le groupe.");
    await prisma.group.delete({ where: { id: group.id } });
    return ok(res, {});
  });

  // Members list (for "amis du groupe" style UI)
  r.get("/:code/members", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const members = await prisma.groupMembership.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, user: { select: { id: true, displayName: true, email: true } } },
    });
    return ok(res, { members: members.map((m) => ({ ...m.user, role: m.role })) });
  });

  // Create an invite token (owner/admin)
  r.post("/:code/invites", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const m = await membershipFor(group.id, req.user.id);
    if (!m) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const role = m.role || "";
    if (role !== "owner" && role !== "admin") return bad(res, 403, "Acces refuse.");

    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await prisma.groupInvite.create({
      data: { token, groupId: group.id, createdByUserId: req.user.id, expiresAt },
    });
    const base = String(process.env.PUBLIC_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
    return ok(res, { invite: { token, url: `${base}/invite/${encodeURIComponent(token)}`, expiresAt } });
  });

  // Accept an invite token
  r.post("/invites/:token/accept", requireAuth, async (req, res) => {
    const token = String(req.params.token || "");
    const inv = await prisma.groupInvite.findUnique({ where: { token } });
    if (!inv) return bad(res, 404, "Invitation introuvable.");
    if (new Date(inv.expiresAt).getTime() <= Date.now()) return bad(res, 400, "Invitation expiree.");
    if (inv.maxUses != null && inv.usedCount >= inv.maxUses) return bad(res, 400, "Invitation epuisee.");

    const userId = req.user.id;
    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: inv.groupId, userId } },
      update: {},
      create: { groupId: inv.groupId, userId, role: "member" },
    });
    await prisma.groupInvite.update({ where: { token }, data: { usedCount: { increment: 1 } } });
    const group = await prisma.group.findUnique({ where: { id: inv.groupId }, select: { code: true, name: true, createdAt: true } });
    return ok(res, { group });
  });

  // Events
  r.get("/:code/events", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const userId = req.user.id;

    const events = await prisma.event.findMany({
      where: { groupId: group.id },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        reminderMinutes: true,
        createdAt: true,
        updatedAt: true,
        createdByUserId: true,
      },
    });

    return ok(res, {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        start: e.startAt.toISOString(),
        end: e.endAt.toISOString(),
        reminderMinutes: e.reminderMinutes,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        canEdit: e.createdByUserId === userId,
        ended: ended(e),
      })),
    });
  });

  r.post("/:code/events", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");

    const parsed = CreateEventSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Champs invalides.");
    const startAt = toDate(parsed.data.start);
    const endAt = toDate(parsed.data.end);
    if (!startAt || !endAt || endAt <= startAt) return bad(res, 400, "Dates invalides.");

    const ev = await prisma.event.create({
      data: {
        groupId: group.id,
        title: parsed.data.title,
        description: parsed.data.description || "",
        startAt,
        endAt,
        reminderMinutes: parsed.data.reminderMinutes || 0,
        createdByUserId: req.user.id,
      },
      select: { id: true, title: true, description: true, startAt: true, endAt: true, reminderMinutes: true, createdAt: true, updatedAt: true, createdByUserId: true },
    });

    // Pin + system message in group chat
    await prisma.groupPinnedEvent.create({ data: { groupId: group.id, eventId: ev.id } }).catch(() => {});
    await prisma.groupChatMessage.create({
      data: { groupId: group.id, kind: "event", text: `Nouvel evenement: ${ev.title}`, eventId: ev.id, userId: null },
    });

    return ok(res, {
      event: {
        id: ev.id,
        title: ev.title,
        description: ev.description,
        start: ev.startAt.toISOString(),
        end: ev.endAt.toISOString(),
        reminderMinutes: ev.reminderMinutes,
        createdAt: ev.createdAt.toISOString(),
        updatedAt: ev.updatedAt.toISOString(),
        canEdit: true,
        ended: false,
      },
    });
  });

  r.put("/:code/events/:eventId", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");

    const parsed = CreateEventSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, 400, "Champs invalides.");
    const startAt = toDate(parsed.data.start);
    const endAt = toDate(parsed.data.end);
    if (!startAt || !endAt || endAt <= startAt) return bad(res, 400, "Dates invalides.");

    const prev = await prisma.event.findUnique({ where: { id: String(req.params.eventId) } });
    if (!prev || prev.groupId !== group.id) return bad(res, 404, "Evenement introuvable.");
    if (prev.createdByUserId !== req.user.id) return bad(res, 403, "Seul le createur peut modifier.");

    const ev = await prisma.event.update({
      where: { id: prev.id },
      data: { title: parsed.data.title, description: parsed.data.description || "", startAt, endAt, reminderMinutes: parsed.data.reminderMinutes || 0 },
      select: { id: true, title: true, description: true, startAt: true, endAt: true, reminderMinutes: true, createdAt: true, updatedAt: true, createdByUserId: true },
    });

    return ok(res, {
      event: {
        id: ev.id,
        title: ev.title,
        description: ev.description,
        start: ev.startAt.toISOString(),
        end: ev.endAt.toISOString(),
        reminderMinutes: ev.reminderMinutes,
        createdAt: ev.createdAt.toISOString(),
        updatedAt: ev.updatedAt.toISOString(),
        canEdit: true,
        ended: ended(ev),
      },
    });
  });

  r.delete("/:code/events/:eventId", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");

    const prev = await prisma.event.findUnique({ where: { id: String(req.params.eventId) } });
    if (!prev || prev.groupId !== group.id) return bad(res, 404, "Evenement introuvable.");
    if (prev.createdByUserId !== req.user.id) return bad(res, 403, "Seul le createur peut supprimer.");

    await prisma.groupPinnedEvent.deleteMany({ where: { groupId: group.id, eventId: prev.id } });
    // Also remove the announcement message(s) in group chat for this event.
    await prisma.groupChatMessage.deleteMany({ where: { groupId: group.id, kind: "event", eventId: prev.id } }).catch(() => {});
    await prisma.event.delete({ where: { id: prev.id } });
    return ok(res, {});
  });

  // Group chat (cursor/pagination comes later)
  r.get("/:code/chat", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const role = String(mem.role || "");

    const pins = await prisma.groupPinnedEvent.findMany({
      where: { groupId: group.id },
      orderBy: { pinnedAt: "desc" },
      take: 25,
      select: { eventId: true },
    });

    const pinnedMessages = await prisma.groupChatMessage.findMany({
      where: { groupId: group.id, pinnedAt: { not: null } },
      orderBy: { pinnedAt: "desc" },
      take: 15,
      select: {
        id: true,
        text: true,
        kind: true,
        createdAt: true,
        pinnedAt: true,
        userId: true,
        pinnedByUserId: true,
        author: { select: { displayName: true } },
        pinnedBy: { select: { displayName: true } },
      },
    });

    const msgs = await prisma.groupChatMessage.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, kind: true, text: true, eventId: true, createdAt: true, updatedAt: true, userId: true, pinnedAt: true, author: { select: { displayName: true } } },
    });

    // For "event" messages, allow deletion by the event creator (or owner/admin).
    const eventIds = Array.from(new Set(msgs.filter((m) => m.kind === "event" && m.eventId).map((m) => String(m.eventId || "")).filter(Boolean)));
    const creatorsByEventId = new Map();
    if (eventIds.length) {
      const evs = await prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, createdByUserId: true } });
      for (const e of evs) creatorsByEventId.set(e.id, e.createdByUserId);
    }

    // Reactions summary (simple approach: query and merge)
    const ids = msgs.map((m) => m.id);
    const reacts = await prisma.groupMessageReaction.findMany({
      where: { messageId: { in: ids } },
      select: { messageId: true, emoji: true, userId: true },
    });
    const summaryByMsg = new Map();
    const mineByMsg = new Map();
    for (const rct of reacts) {
      const k = rct.messageId;
      const s = summaryByMsg.get(k) || {};
      s[rct.emoji] = (s[rct.emoji] || 0) + 1;
      summaryByMsg.set(k, s);
      if (rct.userId === req.user.id) {
        const m = mineByMsg.get(k) || {};
        m[rct.emoji] = true;
        mineByMsg.set(k, m);
      }
    }

    return ok(res, {
      chat: {
        pins: pins.map((p) => p.eventId),
        pinnedMessages: pinnedMessages.map((m) => ({
          id: m.id,
          kind: m.kind,
          author: m.author?.displayName || "Anonyme",
          text: m.text,
          createdAt: m.createdAt.toISOString(),
          pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : "",
          pinnedBy: m.pinnedBy?.displayName || "",
          canUnpin: m.kind === "text" && (m.userId === req.user.id || role === "owner" || role === "admin"),
        })),
        messages: msgs.map((m) => ({
          id: m.id,
          kind: m.kind,
          author: m.author?.displayName || (m.kind === "system" ? "Systeme" : "Anonyme"),
          text: m.text,
          eventId: m.eventId || "",
          createdAt: m.createdAt.toISOString(),
          updatedAt: m.updatedAt ? m.updatedAt.toISOString() : "",
          reactions: summaryByMsg.get(m.id) || {},
          myReactions: mineByMsg.get(m.id) || {},
          pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : "",
          canPin: m.kind === "text" && (m.userId === req.user.id || role === "owner" || role === "admin"),
          canEdit: m.kind === "text" && m.userId === req.user.id,
          canDelete:
            (m.kind === "text" && m.userId === req.user.id) ||
            (m.kind === "event" &&
              ((m.eventId && creatorsByEventId.get(String(m.eventId)) === req.user.id) || role === "owner" || role === "admin")) ||
            (m.kind === "system" && (role === "owner" || role === "admin")),
        })),
      },
    });
  });

  r.post("/:code/chat", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const text = String(req.body?.text || "").trim().slice(0, 500);
    if (!text) return bad(res, 400, "Message vide.");

    const msg = await prisma.groupChatMessage.create({
      data: { groupId: group.id, kind: "text", text, eventId: null, userId: req.user.id },
      select: { id: true, kind: true, text: true, eventId: true, createdAt: true, updatedAt: true, userId: true, author: { select: { displayName: true } } },
    });

    return ok(res, {
      message: {
        id: msg.id,
        kind: msg.kind,
        author: msg.author?.displayName || "Anonyme",
        text: msg.text,
        eventId: "",
        createdAt: msg.createdAt.toISOString(),
        updatedAt: "",
        reactions: {},
        myReactions: {},
        pinnedAt: "",
        canPin: true,
        canEdit: true,
        canDelete: true,
      },
    });
  });

  // Pin/unpin a group chat message (author or owner/admin)
  r.post("/:code/chat/:msgId/pin", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const role = String(mem.role || "");

    const msg = await prisma.groupChatMessage.findUnique({
      where: { id: String(req.params.msgId) },
      select: { id: true, groupId: true, kind: true, userId: true, pinnedAt: true },
    });
    if (!msg || msg.groupId !== group.id) return bad(res, 404, "Message introuvable.");
    if (msg.kind !== "text") return bad(res, 400, "Message non epinglable.");
    const can = msg.userId === req.user.id || role === "owner" || role === "admin";
    if (!can) return bad(res, 403, "Acces refuse.");

    const nextPinned = msg.pinnedAt ? null : new Date();
    const up = await prisma.groupChatMessage.update({
      where: { id: msg.id },
      data: { pinnedAt: nextPinned, pinnedByUserId: nextPinned ? req.user.id : null },
      select: { pinnedAt: true },
    });
    return ok(res, { pinnedAt: up.pinnedAt ? up.pinnedAt.toISOString() : "" });
  });

  // Edit a group chat message (author only)
  r.put("/:code/chat/:msgId", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");

    const msg = await prisma.groupChatMessage.findUnique({ where: { id: String(req.params.msgId) } });
    if (!msg || msg.groupId !== group.id) return bad(res, 404, "Message introuvable.");
    if (msg.kind !== "text") return bad(res, 400, "Message non modifiable.");
    if (msg.userId !== req.user.id) return bad(res, 403, "Seul l'auteur peut modifier.");

    const text = String(req.body?.text || "").trim().slice(0, 500);
    if (!text) return bad(res, 400, "Message vide.");

    const up = await prisma.groupChatMessage.update({
      where: { id: msg.id },
      data: { text, updatedAt: new Date() },
      select: { id: true, kind: true, text: true, eventId: true, createdAt: true, updatedAt: true, userId: true, author: { select: { displayName: true } } },
    });
    return ok(res, {
      message: {
        id: up.id,
        kind: up.kind,
        author: up.author?.displayName || "Anonyme",
        text: up.text,
        eventId: up.eventId || "",
        createdAt: up.createdAt.toISOString(),
        updatedAt: up.updatedAt ? up.updatedAt.toISOString() : "",
        canEdit: true,
        canDelete: true,
      },
    });
  });

  // Delete a group chat message (author only)
  r.delete("/:code/chat/:msgId", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const role = String(mem.role || "");

    const msg = await prisma.groupChatMessage.findUnique({ where: { id: String(req.params.msgId) } });
    if (!msg || msg.groupId !== group.id) return bad(res, 404, "Message introuvable.");
    if (msg.kind === "text") {
      if (msg.userId !== req.user.id) return bad(res, 403, "Seul l'auteur peut supprimer.");
    } else if (msg.kind === "event") {
      if (!msg.eventId) return bad(res, 400, "Message evenement invalide.");
      const ev = await prisma.event.findUnique({ where: { id: msg.eventId }, select: { createdByUserId: true } });
      const can = ev?.createdByUserId === req.user.id || role === "owner" || role === "admin";
      if (!can) return bad(res, 403, "Acces refuse.");
    } else if (msg.kind === "system") {
      const can = role === "owner" || role === "admin";
      if (!can) return bad(res, 403, "Acces refuse.");
    } else {
      return bad(res, 400, "Message non supprimable.");
    }

    await prisma.groupChatMessage.delete({ where: { id: msg.id } });
    return ok(res, {});
  });

  r.post("/:code/chat/:msgId/react", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const emoji = String(req.body?.emoji || "").trim();
    if (!ALLOWED_REACTIONS.has(emoji)) return bad(res, 400, "Emoji invalide.");

    const msg = await prisma.groupChatMessage.findUnique({ where: { id: String(req.params.msgId) } });
    if (!msg || msg.groupId !== group.id) return bad(res, 404, "Message introuvable.");

    const where = { messageId_userId_emoji: { messageId: msg.id, userId: req.user.id, emoji } };
    const existing = await prisma.groupMessageReaction.findUnique({ where }).catch(() => null);
    if (existing) await prisma.groupMessageReaction.delete({ where });
    else await prisma.groupMessageReaction.create({ data: { messageId: msg.id, userId: req.user.id, emoji } });

    // Return updated summary for this message (simple)
    const all = await prisma.groupMessageReaction.findMany({ where: { messageId: msg.id }, select: { emoji: true, userId: true } });
    const summary = {};
    const mine = {};
    for (const x of all) {
      summary[x.emoji] = (summary[x.emoji] || 0) + 1;
      if (x.userId === req.user.id) mine[x.emoji] = true;
    }
    return ok(res, { reactions: summary, myReactions: mine });
  });

  // Event comments
  r.get("/:code/events/:eventId/comments", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const event = await prisma.event.findUnique({ where: { id: String(req.params.eventId) } });
    if (!event || event.groupId !== group.id) return bad(res, 404, "Evenement introuvable.");
    const isCreator = event.createdByUserId === req.user.id;

    const comments = await prisma.eventComment.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: { id: true, text: true, createdAt: true, updatedAt: true, userId: true, author: { select: { displayName: true } } },
    });
    const ids = comments.map((c) => c.id);
    const reacts = await prisma.eventCommentReaction.findMany({ where: { commentId: { in: ids } }, select: { commentId: true, emoji: true, userId: true } });
    const summaryBy = new Map();
    const mineBy = new Map();
    for (const rct of reacts) {
      const s = summaryBy.get(rct.commentId) || {};
      s[rct.emoji] = (s[rct.emoji] || 0) + 1;
      summaryBy.set(rct.commentId, s);
      if (rct.userId === req.user.id) {
        const m = mineBy.get(rct.commentId) || {};
        m[rct.emoji] = true;
        mineBy.set(rct.commentId, m);
      }
    }

    return ok(res, {
      comments: comments.map((c) => ({
        id: c.id,
        author: c.author?.displayName || "Anonyme",
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt ? c.updatedAt.toISOString() : "",
        reactions: summaryBy.get(c.id) || {},
        myReactions: mineBy.get(c.id) || {},
        canEdit: c.userId === req.user.id,
        canDelete: c.userId === req.user.id || isCreator,
      })),
      // Let client show creator badge.
      creatorName: null, // will be computed client-side from event creator displayName (later: include here)
    });
  });

  r.post("/:code/events/:eventId/comments", requireAuth, async (req, res) => {
    const group = await findGroupByCode(req.params.code);
    if (!group) return bad(res, 404, "Groupe introuvable.");
    const mem = await membershipFor(group.id, req.user.id);
    if (!mem) return bad(res, 403, "Tu n'es pas membre de ce groupe.");
    const event = await prisma.event.findUnique({ where: { id: String(req.params.eventId) } });
    if (!event || event.groupId !== group.id) return bad(res, 404, "Evenement introuvable.");
    const text = String(req.body?.text || "").trim().slice(0, 500);
    if (!text) return bad(res, 400, "Message vide.");

    const c = await prisma.eventComment.create({
      data: { eventId: event.id, userId: req.user.id, text },
      select: { id: true, text: true, createdAt: true, updatedAt: true, userId: true, author: { select: { displayName: true } } },
    });
    return ok(res, {
      comment: {
        id: c.id,
        author: c.author?.displayName || "Anonyme",
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        updatedAt: "",
        reactions: {},
        myReactions: {},
        canEdit: true,
        canDelete: true,
      },
    });
  });

  // More endpoints (poll/rating/edit/delete messages) will be added in next commit to keep this change manageable.
  return r;
}
