import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { readDb, writeDb } from "./store.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

function nowIso() {
  return new Date().toISOString();
}

function isIsoDateTime(s) {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) && typeof s === "string";
}

function bad(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "");
}

function newGroupCode() {
  // Human friendly code: 8 chars, uppercase.
  return nanoid(10).toUpperCase().replaceAll(/[^A-Z0-9]/g, "").slice(0, 8);
}

function newEventId() {
  return `ev_${nanoid(12)}`;
}

async function getGroupOr404(res, codeRaw) {
  const code = normalizeCode(codeRaw);
  if (!code) return { code: null, group: null, db: null, res: bad(res, 400, "Code invalide.") };
  const db = await readDb();
  const group = db.groups.find((g) => g.code === code);
  if (!group) return { code, group: null, db, res: bad(res, 404, "Groupe introuvable.") };
  return { code, group, db, res: null };
}

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

function clientIdFromReq(req) {
  const v = String(req.get("x-kifekoi-client") || "").trim();
  if (!v) return null;
  if (v.length > 80) return null;
  return v;
}

const ALLOWED_REACTIONS = new Set(["👍", "👎", "😂", "❤️", "🔥", "🎉", "😮"]);

function normalizeEmoji(s) {
  const e = String(s || "").trim();
  if (!e) return "";
  if (e.length > 8) return "";
  return e;
}

function toggleReaction(reactObj, emoji, clientId) {
  if (!reactObj || typeof reactObj !== "object") return;
  const list = Array.isArray(reactObj[emoji]) ? reactObj[emoji] : [];
  const has = list.includes(clientId);
  const next = has ? list.filter((x) => x !== clientId) : [...list, clientId];
  if (next.length === 0) delete reactObj[emoji];
  else reactObj[emoji] = next;
}

function reactionSummary(reactObj, clientId) {
  const r = reactObj && typeof reactObj === "object" ? reactObj : {};
  const summary = {};
  const mine = {};
  for (const [emoji, list] of Object.entries(r)) {
    if (!Array.isArray(list)) continue;
    const cnt = list.length;
    if (cnt <= 0) continue;
    summary[emoji] = cnt;
    if (clientId) mine[emoji] = list.includes(clientId);
  }
  return { summary, mine };
}

// Create group
app.post("/api/groups", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return bad(res, 400, "Nom de groupe obligatoire.");
  if (name.length > 40) return bad(res, 400, "Nom de groupe trop long.");

  const db = await readDb();
  let code = newGroupCode();
  // Avoid collisions
  for (let i = 0; i < 5 && db.groups.some((g) => g.code === code); i++) {
    code = newGroupCode();
  }
  if (db.groups.some((g) => g.code === code)) return bad(res, 500, "Impossible de generer un code.");

  const group = { code, name, createdAt: nowIso() };
  db.groups.push(group);
  await writeDb(db);
  return res.json({ ok: true, group });
});

// Get group by code
app.get("/api/groups/:code", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  return res.json({ ok: true, group: got.group });
});

// List events
app.get("/api/groups/:code/events", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  const events = got.db.events
    .filter((e) => e.groupCode === got.code)
    .map((e) => ({
      ...e,
      comments: undefined, // don't send comments in list
      ratings: undefined,
      poll: undefined, // don't leak poll votes / client ids
      canEdit: Boolean(clientId && e.createdBy && e.createdBy === clientId) || !e.createdBy,
      ended: eventEnded(e),
      ...(clientId
        ? (() => {
            const ended = eventEnded(e);
            const canVote = ended && hasParticipated(e, clientId);
            const { up, down } = ratingSummary(e);
            const myVote = (e.ratings && typeof e.ratings === "object" && e.ratings[clientId]) || 0;
            return { canVote, ratingUp: up, ratingDown: down, myVote };
          })()
        : { canVote: false, ratingUp: 0, ratingDown: 0, myVote: 0 }),
      createdBy: undefined,
    }))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  return res.json({ ok: true, events });
});

// Create event
app.post("/api/groups/:code/events", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const start = req.body?.start;
  const end = req.body?.end;
  const reminderMinutes = Number(req.body?.reminderMinutes || 0);
  const createdByName = sanitizeAuthor(req.body?.createdByName || "");

  if (!title) return bad(res, 400, "Titre obligatoire.");
  if (title.length > 60) return bad(res, 400, "Titre trop long.");
  if (description.length > 800) return bad(res, 400, "Description trop longue.");
  if (!isIsoDateTime(start) || !isIsoDateTime(end)) return bad(res, 400, "Dates invalides.");
  if (new Date(end) <= new Date(start)) return bad(res, 400, "Fin doit etre apres debut.");
  if (!Number.isFinite(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 24 * 60) {
    return bad(res, 400, "Rappel invalide.");
  }

  const db = got.db;
  const ev = {
    id: newEventId(),
    groupCode: got.code,
    title,
    description,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    reminderMinutes,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    comments: [],
    ratings: {},
    poll: null,
    createdBy: clientId,
    createdByName,
  };
  db.events.push(ev);
  // Announce in group chat and pin.
  addSystemEventCreatedMessage(db, got.code, ev);
  await writeDb(db);
  return res.json({
    ok: true,
    event: {
      ...ev,
      comments: undefined,
      ratings: undefined,
      poll: undefined,
      canEdit: true,
      ended: false,
      canVote: false,
      ratingUp: 0,
      ratingDown: 0,
      myVote: 0,
    },
  });
});

// Update event
app.put("/api/groups/:code/events/:id", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const id = String(req.params.id || "");
  if (!id) return bad(res, 400, "Id invalide.");

  const db = got.db;
  const idx = db.events.findIndex((e) => e.groupCode === got.code && e.id === id);
  if (idx === -1) return bad(res, 404, "Evenement introuvable.");

  const title = String(req.body?.title || "").trim();
  const description = String(req.body?.description || "").trim();
  const start = req.body?.start;
  const end = req.body?.end;
  const reminderMinutes = Number(req.body?.reminderMinutes || 0);
  const createdByName = sanitizeAuthor(req.body?.createdByName || "");

  if (!title) return bad(res, 400, "Titre obligatoire.");
  if (title.length > 60) return bad(res, 400, "Titre trop long.");
  if (description.length > 800) return bad(res, 400, "Description trop longue.");
  if (!isIsoDateTime(start) || !isIsoDateTime(end)) return bad(res, 400, "Dates invalides.");
  if (new Date(end) <= new Date(start)) return bad(res, 400, "Fin doit etre apres debut.");
  if (!Number.isFinite(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 24 * 60) {
    return bad(res, 400, "Rappel invalide.");
  }

  const prev = db.events[idx];
  if (prev.createdBy && prev.createdBy !== clientId) return bad(res, 403, "Seul le createur peut modifier.");
  // Back-compat: old events didn't have createdBy.
  const createdBy = prev.createdBy || clientId;
  const next = {
    ...prev,
    title,
    description,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    reminderMinutes,
    updatedAt: nowIso(),
    createdBy,
    // If we didn't have a stored name yet, allow setting it. Otherwise keep existing unless explicitly provided.
    createdByName: createdByName || prev.createdByName || "",
  };
  db.events[idx] = next;
  await writeDb(db);
  {
    const ended = eventEnded(next);
    const canVote = ended && hasParticipated(next, clientId);
    const { up, down } = ratingSummary(next);
    const myVote = (next.ratings && typeof next.ratings === "object" && next.ratings[clientId]) || 0;
    return res.json({
      ok: true,
      event: {
        ...next,
        comments: undefined,
        ratings: undefined,
        poll: undefined,
        canEdit: true,
        ended,
        canVote,
        ratingUp: up,
        ratingDown: down,
        myVote,
      },
    });
  }
});

// Delete event
app.delete("/api/groups/:code/events/:id", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const id = String(req.params.id || "");
  const db = got.db;
  const idx = db.events.findIndex((e) => e.groupCode === got.code && e.id === id);
  if (idx === -1) return bad(res, 404, "Evenement introuvable.");
  const ev = db.events[idx];
  if (ev.createdBy && ev.createdBy !== clientId) return bad(res, 403, "Seul le createur peut supprimer.");
  unpinEvent(db, got.code, ev.id);
  db.events.splice(idx, 1);
  await writeDb(db);
  return res.json({ ok: true });
});

function newCommentId() {
  return `c_${nanoid(10)}`;
}

function newChatId() {
  return `m_${nanoid(10)}`;
}

function sanitizeAuthor(s) {
  const a = String(s || "").trim();
  return a.slice(0, 24);
}

function sanitizeText(s) {
  const t = String(s || "").trim();
  return t.slice(0, 500);
}

function findEvent(db, groupCode, eventId) {
  const idx = db.events.findIndex((e) => e.groupCode === groupCode && e.id === eventId);
  return { idx, ev: idx === -1 ? null : db.events[idx] };
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "kifekoi/1.0" } });
    if (!r.ok) {
      let snippet = "";
      try {
        const text = await r.text();
        snippet = String(text || "").slice(0, 160);
      } catch {
        // ignore
      }
      throw new Error(`Upstream ${r.status}${snippet ? `: ${snippet}` : ""}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function ymdOk(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function isRainy({ precipSum, precipProbMax, weatherCode }) {
  if (Number.isFinite(precipSum) && precipSum >= 0.2) return true;
  if (Number.isFinite(precipProbMax) && precipProbMax >= 50) return true;
  if (Number.isFinite(weatherCode) && weatherCode >= 50) return true;
  return false;
}

function eventEnded(ev) {
  return new Date(ev.end).getTime() <= Date.now();
}

function hasParticipated(ev, clientId) {
  if (!clientId) return false;
  if (ev.createdBy && ev.createdBy === clientId) return true;
  if (!Array.isArray(ev.comments)) return false;
  return ev.comments.some((c) => c && typeof c === "object" && c.by && c.by === clientId);
}

function ratingSummary(ev) {
  const ratings = ev.ratings && typeof ev.ratings === "object" ? ev.ratings : {};
  let up = 0;
  let down = 0;
  for (const v of Object.values(ratings)) {
    if (v === 1) up++;
    else if (v === -1) down++;
  }
  return { up, down };
}

function pollSummary(poll, clientId) {
  if (!poll || typeof poll !== "object") return { poll: null, myVote: "" };
  const options = Array.isArray(poll.options) ? poll.options : [];
  const votes = poll.votes && typeof poll.votes === "object" ? poll.votes : {};
  const counts = {};
  for (const opt of options) {
    const id = String(opt?.id || "");
    if (!id) continue;
    counts[id] = 0;
  }
  for (const v of Object.values(votes)) {
    const optId = String(v || "");
    if (!optId || counts[optId] == null) continue;
    counts[optId] += 1;
  }
  const mapped = options
    .map((o) => ({ id: String(o?.id || ""), text: String(o?.text || "") }))
    .filter((o) => o.id && o.text)
    .map((o) => ({ ...o, count: Number(counts[o.id] || 0) }));
  const myVote = clientId ? String(votes[clientId] || "") : "";
  return {
    poll: {
      id: String(poll.id || ""),
      question: String(poll.question || ""),
      options: mapped,
      createdAt: String(poll.createdAt || ""),
    },
    myVote,
  };
}

// List comments for event
app.get("/api/groups/:code/events/:id/comments", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  const id = String(req.params.id || "");
  const { ev } = findEvent(got.db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!Array.isArray(ev.comments)) ev.comments = [];
  const isEventCreator = Boolean(clientId && ev.createdBy && ev.createdBy === clientId);
  const comments = ev.comments
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((c) => {
      const { summary, mine } = reactionSummary(c.reactions, clientId);
      const canEdit = Boolean(clientId && c.by && c.by === clientId);
      const canDelete = Boolean(canEdit || isEventCreator);
      return { ...c, by: undefined, reactions: summary, myReactions: mine, canEdit, canDelete };
    });
  return res.json({ ok: true, comments });
});

// Event poll (single poll per event)
app.get("/api/groups/:code/events/:id/poll", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const id = String(req.params.id || "");
  const { ev } = findEvent(got.db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  const canEdit = Boolean(!ev.createdBy || ev.createdBy === clientId);
  const { poll, myVote } = pollSummary(ev.poll, clientId);
  return res.json({ ok: true, poll: poll || null, myVote, canEdit });
});

app.post("/api/groups/:code/events/:id/poll", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const id = String(req.params.id || "");
  const db = got.db;
  const { idx, ev } = findEvent(db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");

  if (ev.createdBy && ev.createdBy !== clientId) return bad(res, 403, "Seul le createur peut gerer le sondage.");
  if (!ev.createdBy) ev.createdBy = clientId; // back-compat

  const action = String(req.body?.action || "").trim();
  if (action === "clear") {
    ev.poll = null;
    db.events[idx] = ev;
    await writeDb(db);
    return res.json({ ok: true, poll: null, myVote: "", canEdit: true });
  }

  const question = String(req.body?.question || "").trim();
  const optionsRaw = Array.isArray(req.body?.options) ? req.body.options : [];
  const optionsText = optionsRaw.map((x) => String(x || "").trim()).filter(Boolean);
  if (!question) return bad(res, 400, "Question obligatoire.");
  if (question.length > 120) return bad(res, 400, "Question trop longue.");
  if (optionsText.length < 2) return bad(res, 400, "Il faut au moins 2 choix.");
  if (optionsText.length > 8) return bad(res, 400, "Trop de choix (max 8).");

  const options = optionsText.map((t) => ({ id: `o_${nanoid(8)}`, text: t.slice(0, 60) }));
  ev.poll = {
    id: `p_${nanoid(10)}`,
    question,
    options,
    votes: {},
    createdAt: nowIso(),
    createdBy: clientId,
  };
  db.events[idx] = ev;
  await writeDb(db);
  const { poll, myVote } = pollSummary(ev.poll, clientId);
  return res.json({ ok: true, poll, myVote, canEdit: true });
});

app.post("/api/groups/:code/events/:id/poll/vote", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const id = String(req.params.id || "");
  const db = got.db;
  const { idx, ev } = findEvent(db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!ev.poll || typeof ev.poll !== "object") return bad(res, 404, "Aucun sondage.");
  if (!ev.poll.votes || typeof ev.poll.votes !== "object") ev.poll.votes = {};

  const optionId = String(req.body?.optionId || "").trim();
  const clear = String(req.body?.vote || "").trim() === "clear" || optionId === "";
  if (clear) {
    delete ev.poll.votes[clientId];
  } else {
    const opts = Array.isArray(ev.poll.options) ? ev.poll.options : [];
    const ok = opts.some((o) => o && typeof o === "object" && String(o.id || "") === optionId);
    if (!ok) return bad(res, 400, "Choix invalide.");
    ev.poll.votes[clientId] = optionId;
  }

  db.events[idx] = ev;
  await writeDb(db);
  const canEdit = Boolean(!ev.createdBy || ev.createdBy === clientId);
  const { poll, myVote } = pollSummary(ev.poll, clientId);
  return res.json({ ok: true, poll, myVote, canEdit });
});

// Add comment
app.post("/api/groups/:code/events/:id/comments", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const id = String(req.params.id || "");
  const db = got.db;
  const { idx, ev } = findEvent(db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!Array.isArray(ev.comments)) ev.comments = [];

  const author = sanitizeAuthor(req.body?.author || "");
  const text = sanitizeText(req.body?.text || "");
  if (!author) return bad(res, 400, "Pseudo obligatoire.");
  if (!text) return bad(res, 400, "Message vide.");

  const c = { id: newCommentId(), author, text, createdAt: nowIso(), by: clientId, reactions: {} };
  ev.comments.push(c);
  db.events[idx] = ev;
  await writeDb(db);
  const isEventCreator = Boolean(ev.createdBy && ev.createdBy === clientId);
  return res.json({
    ok: true,
    comment: {
      ...c,
      by: undefined,
      reactions: {},
      myReactions: {},
      canEdit: true,
      canDelete: true,
    },
  });
});

app.post("/api/groups/:code/events/:eventId/comments/:commentId/react", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const eventId = String(req.params.eventId || "");
  const commentId = String(req.params.commentId || "");
  const { idx, ev } = findEvent(got.db, got.code, eventId);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!Array.isArray(ev.comments)) ev.comments = [];
  const cIdx = ev.comments.findIndex((c) => c && typeof c === "object" && c.id === commentId);
  if (cIdx === -1) return bad(res, 404, "Message introuvable.");

  const emoji = normalizeEmoji(req.body?.emoji || "");
  if (!ALLOWED_REACTIONS.has(emoji)) return bad(res, 400, "Emoji invalide.");

  const c = ev.comments[cIdx];
  if (!c.reactions || typeof c.reactions !== "object") c.reactions = {};
  toggleReaction(c.reactions, emoji, clientId);
  ev.comments[cIdx] = c;
  got.db.events[idx] = ev;
  await writeDb(got.db);

  const { summary, mine } = reactionSummary(c.reactions, clientId);
  return res.json({ ok: true, reactions: summary, myReactions: mine });
});

function pinsForGroup(db, groupCode) {
  const code = normalizeCode(groupCode);
  if (!db.pins || typeof db.pins !== "object") db.pins = {};
  const cur = db.pins[code];
  if (!Array.isArray(cur)) db.pins[code] = [];
  return db.pins[code];
}

function pinEvent(db, groupCode, eventId) {
  const list = pinsForGroup(db, groupCode);
  const id = String(eventId || "");
  if (!id) return;
  const next = [id, ...list.filter((x) => x !== id)].slice(0, 25);
  db.pins[normalizeCode(groupCode)] = next;
}

function unpinEvent(db, groupCode, eventId) {
  const list = pinsForGroup(db, groupCode);
  const id = String(eventId || "");
  db.pins[normalizeCode(groupCode)] = list.filter((x) => x !== id);
}

function addSystemEventCreatedMessage(db, groupCode, ev) {
  db.groupChat.push({
    id: newChatId(),
    groupCode: normalizeCode(groupCode),
    kind: "event",
    author: "Systeme",
    text: `Nouvel evenement: ${ev.title || "Evenement"}`,
    eventId: ev.id,
    createdAt: nowIso(),
    by: "",
    reactions: {},
  });
  pinEvent(db, groupCode, ev.id);
}

// Get rating
app.get("/api/groups/:code/events/:id/rating", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const id = String(req.params.id || "");
  const { ev } = findEvent(got.db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!ev.ratings || typeof ev.ratings !== "object") ev.ratings = {};

  const ended = eventEnded(ev);
  const canVote = ended && hasParticipated(ev, clientId);
  const { up, down } = ratingSummary(ev);
  const myVote = ev.ratings[clientId] || 0;
  return res.json({ ok: true, rating: { ended, canVote, up, down, myVote } });
});

// Set rating (up/down/clear)
app.post("/api/groups/:code/events/:id/rating", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const id = String(req.params.id || "");
  const db = got.db;
  const { idx, ev } = findEvent(db, got.code, id);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!ev.ratings || typeof ev.ratings !== "object") ev.ratings = {};

  const ended = eventEnded(ev);
  if (!ended) return bad(res, 400, "Tu peux voter seulement apres la fin de l'evenement.");
  if (!hasParticipated(ev, clientId)) return bad(res, 403, "Seuls les participants peuvent voter.");

  const vote = String(req.body?.vote || "");
  if (vote === "up") ev.ratings[clientId] = 1;
  else if (vote === "down") ev.ratings[clientId] = -1;
  else if (vote === "clear") delete ev.ratings[clientId];
  else return bad(res, 400, "Vote invalide.");

  db.events[idx] = ev;
  await writeDb(db);

  const { up, down } = ratingSummary(ev);
  const myVote = ev.ratings[clientId] || 0;
  return res.json({ ok: true, rating: { ended: true, canVote: true, up, down, myVote } });
});

// Group chat (global thread)
app.get("/api/groups/:code/chat", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  const db = got.db;
  const pins = pinsForGroup(db, got.code);
  const messages = db.groupChat
    .filter((m) => m.groupCode === got.code)
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-200)
    .map((m) => {
      const { summary, mine } = reactionSummary(m.reactions, clientId);
      const canEdit = Boolean(clientId && m.by && m.by === clientId && m.kind === "text");
      const canDelete = canEdit;
      return { ...m, by: undefined, reactions: summary, myReactions: mine, canEdit, canDelete };
    }); // don't expose client ids
  return res.json({ ok: true, chat: { pins, messages } });
});

app.post("/api/groups/:code/chat", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const author = sanitizeAuthor(req.body?.author || "");
  const text = sanitizeText(req.body?.text || "");
  if (!author) return bad(res, 400, "Pseudo obligatoire.");
  if (!text) return bad(res, 400, "Message vide.");

  const db = got.db;
  const m = {
    id: newChatId(),
    groupCode: got.code,
    kind: "text",
    author,
    text,
    eventId: "",
    createdAt: nowIso(),
    by: clientId,
    reactions: {},
  };
  db.groupChat.push(m);
  await writeDb(db);
  return res.json({ ok: true, message: { ...m, by: undefined, reactions: {}, myReactions: {}, canEdit: true, canDelete: true } });
});

app.post("/api/groups/:code/chat/:msgId/react", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");
  const msgId = String(req.params.msgId || "");
  if (!msgId) return bad(res, 400, "Message invalide.");

  const emoji = normalizeEmoji(req.body?.emoji || "");
  if (!ALLOWED_REACTIONS.has(emoji)) return bad(res, 400, "Emoji invalide.");

  const db = got.db;
  const idx = db.groupChat.findIndex((m) => m.groupCode === got.code && m.id === msgId);
  if (idx === -1) return bad(res, 404, "Message introuvable.");
  const m = db.groupChat[idx];
  if (!m.reactions || typeof m.reactions !== "object") m.reactions = {};
  toggleReaction(m.reactions, emoji, clientId);
  db.groupChat[idx] = m;
  await writeDb(db);

  const { summary, mine } = reactionSummary(m.reactions, clientId);
  return res.json({ ok: true, reactions: summary, myReactions: mine });
});

app.put("/api/groups/:code/chat/:msgId", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const msgId = String(req.params.msgId || "");
  if (!msgId) return bad(res, 400, "Message invalide.");
  const db = got.db;
  const idx = db.groupChat.findIndex((m) => m.groupCode === got.code && m.id === msgId);
  if (idx === -1) return bad(res, 404, "Message introuvable.");
  const m = db.groupChat[idx];
  if (m.kind !== "text") return bad(res, 400, "Message non modifiable.");
  if (!m.by || m.by !== clientId) return bad(res, 403, "Tu peux modifier seulement tes messages.");

  const text = sanitizeText(req.body?.text || "");
  if (!text) return bad(res, 400, "Message vide.");
  m.text = text;
  m.updatedAt = nowIso();
  db.groupChat[idx] = m;
  await writeDb(db);

  const { summary, mine } = reactionSummary(m.reactions, clientId);
  return res.json({ ok: true, message: { ...m, by: undefined, reactions: summary, myReactions: mine, canEdit: true, canDelete: true } });
});

app.delete("/api/groups/:code/chat/:msgId", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const msgId = String(req.params.msgId || "");
  if (!msgId) return bad(res, 400, "Message invalide.");
  const db = got.db;
  const idx = db.groupChat.findIndex((m) => m.groupCode === got.code && m.id === msgId);
  if (idx === -1) return bad(res, 404, "Message introuvable.");
  const m = db.groupChat[idx];
  if (m.kind !== "text") return bad(res, 400, "Message non supprimable.");
  if (!m.by || m.by !== clientId) return bad(res, 403, "Tu peux supprimer seulement tes messages.");

  db.groupChat.splice(idx, 1);
  await writeDb(db);
  return res.json({ ok: true });
});

app.put("/api/groups/:code/events/:eventId/comments/:commentId", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const eventId = String(req.params.eventId || "");
  const commentId = String(req.params.commentId || "");
  const db = got.db;
  const { idx, ev } = findEvent(db, got.code, eventId);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!Array.isArray(ev.comments)) ev.comments = [];
  const cIdx = ev.comments.findIndex((c) => c && typeof c === "object" && c.id === commentId);
  if (cIdx === -1) return bad(res, 404, "Message introuvable.");

  const c = ev.comments[cIdx];
  if (!c.by || c.by !== clientId) return bad(res, 403, "Tu peux modifier seulement tes messages.");

  const text = sanitizeText(req.body?.text || "");
  if (!text) return bad(res, 400, "Message vide.");
  c.text = text;
  c.updatedAt = nowIso();
  ev.comments[cIdx] = c;
  db.events[idx] = ev;
  await writeDb(db);

  const { summary, mine } = reactionSummary(c.reactions, clientId);
  return res.json({
    ok: true,
    comment: { ...c, by: undefined, reactions: summary, myReactions: mine, canEdit: true, canDelete: true },
  });
});

app.delete("/api/groups/:code/events/:eventId/comments/:commentId", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;
  const clientId = clientIdFromReq(req);
  if (!clientId) return bad(res, 401, "Client invalide.");

  const eventId = String(req.params.eventId || "");
  const commentId = String(req.params.commentId || "");
  const db = got.db;
  const { idx, ev } = findEvent(db, got.code, eventId);
  if (!ev) return bad(res, 404, "Evenement introuvable.");
  if (!Array.isArray(ev.comments)) ev.comments = [];
  const cIdx = ev.comments.findIndex((c) => c && typeof c === "object" && c.id === commentId);
  if (cIdx === -1) return bad(res, 404, "Message introuvable.");

  const c = ev.comments[cIdx];
  const isMine = Boolean(c.by && c.by === clientId);
  const isCreator = Boolean(ev.createdBy && ev.createdBy === clientId);
  if (!isMine && !isCreator) return bad(res, 403, "Tu peux supprimer seulement tes messages.");

  ev.comments.splice(cIdx, 1);
  db.events[idx] = ev;
  await writeDb(db);
  return res.json({ ok: true });
});

// Friends: pseudo list inferred from chat + comments
app.get("/api/groups/:code/friends", async (req, res) => {
  const got = await getGroupOr404(res, req.params.code);
  if (got.res) return got.res;

  const db = got.db;
  const map = new Map(); // name -> { name, messages, comments, lastAt }

  function bump(nameRaw, kind, atRaw) {
    const name = String(nameRaw || "").trim();
    if (!name) return;
    if (name.toLowerCase() === "systeme") return;
    const at = String(atRaw || "");
    const cur = map.get(name) || { name, messages: 0, comments: 0, lastAt: "" };
    if (kind === "msg") cur.messages += 1;
    if (kind === "comment") cur.comments += 1;
    if (at && (!cur.lastAt || at > cur.lastAt)) cur.lastAt = at;
    map.set(name, cur);
  }

  for (const m of db.groupChat) {
    if (!m || typeof m !== "object") continue;
    if (m.groupCode !== got.code) continue;
    if (String(m.kind || "") !== "text") continue;
    bump(m.author, "msg", m.createdAt);
  }

  for (const ev of db.events) {
    if (!ev || typeof ev !== "object") continue;
    if (ev.groupCode !== got.code) continue;
    const comments = Array.isArray(ev.comments) ? ev.comments : [];
    for (const c of comments) {
      if (!c || typeof c !== "object") continue;
      bump(c.author, "comment", c.createdAt);
    }
  }

  const friends = Array.from(map.values()).sort((a, b) => {
    const ta = (a.messages || 0) + (a.comments || 0);
    const tb = (b.messages || 0) + (b.comments || 0);
    if (tb !== ta) return tb - ta;
    return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
  });

  return res.json({ ok: true, friends });
});

// Weather: geocode (best-effort, returns a few candidates)
app.get("/api/weather/geocode", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return bad(res, 400, "q obligatoire.");
  try {
    const attempts = [];
    attempts.push(q);
    // Fallback: remove postal codes/numbers which often hurt matching.
    const noDigits = q.replace(/[0-9]/g, " ").replace(/\s+/g, " ").trim();
    if (noDigits && noDigits !== q) attempts.push(noDigits);

    let results = [];
    for (const name of attempts) {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=fr&format=json`;
      const data = await fetchJson(url);
      const rs = Array.isArray(data?.results) ? data.results : [];
      if (rs.length) {
        results = rs;
        break;
      }
    }

    if (!results.length) return bad(res, 404, "Lieu introuvable. Essaie juste la ville (ex: Paris, Lyon).");

    const mapped = results.map((r) => ({
      name: r.name,
      admin1: r.admin1 || "",
      country: r.country || "",
      lat: r.latitude,
      lon: r.longitude,
    }));
    return res.json({ ok: true, results: mapped });
  } catch (e) {
    return bad(res, 502, `Service meteo indisponible. (${e?.message || "erreur"})`);
  }
});

// Weather: day icon (sun/rain)
app.get("/api/weather/day", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const date = String(req.query.date || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(res, 400, "Coordonnees invalides.");
  if (!ymdOk(date)) return bad(res, 400, "date invalide.");

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&daily=precipitation_sum,precipitation_probability_max,weather_code` +
    `&start_date=${encodeURIComponent(date)}&end_date=${encodeURIComponent(date)}` +
    `&timezone=auto`;

  try {
    const data = await fetchJson(url);
    const precipSum = Number(data?.daily?.precipitation_sum?.[0] ?? 0);
    const precipProbMax = Number(data?.daily?.precipitation_probability_max?.[0] ?? 0);
    const weatherCode = Number(data?.daily?.weather_code?.[0] ?? 0);
    const rain = isRainy({ precipSum, precipProbMax, weatherCode });
    return res.json({ ok: true, weather: { icon: rain ? "rain" : "sun" } });
  } catch (e) {
    const msg = String(e?.message || "erreur");
    const status = msg.includes("Upstream 400") ? 400 : 502;
    return bad(res, status, `Service meteo indisponible. (${msg})`);
  }
});

// Weather: range icons (sun/rain) for calendar grid (one upstream call)
app.get("/api/weather/range", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const start = String(req.query.start || "");
  const end = String(req.query.end || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(res, 400, "Coordonnees invalides.");
  if (!ymdOk(start) || !ymdOk(end)) return bad(res, 400, "start/end invalides.");

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&daily=precipitation_sum,precipitation_probability_max,weather_code` +
    `&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}` +
    `&timezone=auto`;

  try {
    const data = await fetchJson(url);
    const dates = data?.daily?.time || [];
    const precipSum = data?.daily?.precipitation_sum || [];
    const precipProbMax = data?.daily?.precipitation_probability_max || [];
    const weatherCode = data?.daily?.weather_code || [];
    if (!Array.isArray(dates) || dates.length === 0) return bad(res, 502, "Pas de donnees meteo.");

    const icons = {};
    for (let i = 0; i < dates.length; i++) {
      const ymd = String(dates[i] || "");
      if (!ymdOk(ymd)) continue;
      const rain = isRainy({
        precipSum: Number(precipSum[i] ?? 0),
        precipProbMax: Number(precipProbMax[i] ?? 0),
        weatherCode: Number(weatherCode[i] ?? 0),
      });
      icons[ymd] = rain ? "rain" : "sun";
    }

    return res.json({ ok: true, icons });
  } catch (e) {
    const msg = String(e?.message || "erreur");
    const status = msg.includes("Upstream 400") ? 400 : 502;
    return bad(res, status, `Service meteo indisponible. (${msg})`);
  }
});

// API fallback: never serve HTML for unknown /api routes.
app.use("/api", (req, res) => {
  return bad(res, 404, "Route API introuvable.");
});

// Static frontend (this repo root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";
app.use(
  express.static(webRoot, {
    extensions: ["html"],
    setHeaders(res, filePath) {
      // Avoid stale assets during local dev, especially with ES modules.
      if (!isProd && (filePath.endsWith(".js") || filePath.endsWith(".css") || filePath.endsWith(".html"))) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  }),
);

// SPA-ish fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

const port = Number(process.env.PORT || 5173);
// Bind to localhost to avoid sandbox restrictions on 0.0.0.0.
app.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`Kifekoi server listening on http://localhost:${port}`);
});
