import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_DB = {
  version: 1,
  groups: [], // { code, name, createdAt }
  events: [], // { id, groupCode, title, description, start, end, reminderMinutes, createdAt, updatedAt, comments: [] }
  groupChat: [], // { id, groupCode, kind, author, text, eventId, createdAt, by }
  pins: {}, // { [groupCode]: [eventId, ...] }
};

export function dbPath() {
  return path.resolve(process.cwd(), "data", "db.json");
}

async function ensureDbFile(file) {
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(DEFAULT_DB, null, 2), "utf-8");
  }
}

export async function readDb() {
  const file = dbPath();
  await ensureDbFile(file);
  const raw = await fs.readFile(file, "utf-8");
  const db = JSON.parse(raw);
  // Minimal sanity.
  if (!db || typeof db !== "object") return structuredClone(DEFAULT_DB);
  if (!Array.isArray(db.groups)) db.groups = [];
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.groupChat)) db.groupChat = [];
  if (!db.pins || typeof db.pins !== "object") db.pins = {};
  if (!db.version) db.version = 1;

  // Migrate existing events to include comments array.
  for (const ev of db.events) {
    if (!ev || typeof ev !== "object") continue;
    if (!Array.isArray(ev.comments)) ev.comments = [];
    if (typeof ev.createdBy !== "string") ev.createdBy = "";
    if (typeof ev.createdByName !== "string") ev.createdByName = "";
    if (!ev.ratings || typeof ev.ratings !== "object") ev.ratings = {}; // clientId -> 1|-1
    if (!ev.poll || typeof ev.poll !== "object") ev.poll = null; // single poll per event
    for (const c of ev.comments) {
      if (!c || typeof c !== "object") continue;
      if (typeof c.by !== "string") c.by = "";
      if (!c.reactions || typeof c.reactions !== "object") c.reactions = {}; // emoji -> [clientId]
    }
  }

  // Migrate groupChat messages.
  for (const m of db.groupChat) {
    if (!m || typeof m !== "object") continue;
    if (typeof m.id !== "string") m.id = "";
    if (typeof m.groupCode !== "string") m.groupCode = "";
    if (typeof m.kind !== "string") m.kind = "text";
    if (typeof m.author !== "string") m.author = "";
    if (typeof m.text !== "string") m.text = "";
    if (typeof m.eventId !== "string") m.eventId = "";
    if (typeof m.createdAt !== "string") m.createdAt = new Date().toISOString();
    if (typeof m.by !== "string") m.by = "";
    if (!m.reactions || typeof m.reactions !== "object") m.reactions = {}; // emoji -> [clientId]
  }

  return db;
}

export async function writeDb(db) {
  const file = dbPath();
  await ensureDbFile(file);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
  await fs.rename(tmp, file);
}
