const KEY = "kifekoi:v1";
const GROUPS_KEY = "kifekoi:knownGroups:v1";

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  // Good enough for local/offline usage.
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  const state = safeJsonParse(raw, null);
  if (state && typeof state === "object") return migrate(state);

  const defaultGroupId = newId("g");
  const seeded = {
    version: 1,
    groups: [{ id: defaultGroupId, name: "Amis", createdAt: nowIso() }],
    events: [],
    ui: { activeGroupId: defaultGroupId },
    notified: {}, // map key -> iso timestamp of when we notified
    knownGroups: [], // [{ code, name, lastUsedAt }]
  };
  localStorage.setItem(KEY, JSON.stringify(seeded));
  return seeded;
}

function migrate(state) {
  // For future schema changes.
  const s = { ...state };
  if (!s.version) s.version = 1;
  if (!Array.isArray(s.groups)) s.groups = [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!s.ui || typeof s.ui !== "object") s.ui = {};
  if (!s.ui.activeGroupId) s.ui.activeGroupId = s.groups[0]?.id || null;
  if (!s.notified || typeof s.notified !== "object") s.notified = {};
  if (!Array.isArray(s.knownGroups)) s.knownGroups = [];
  return s;
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function createGroup(state, name) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("Nom de groupe invalide.");
  const group = { id: newId("g"), name: clean, createdAt: nowIso() };
  state.groups.push(group);
  state.ui.activeGroupId = group.id;
  saveState(state);
  return group;
}

export function updateActiveGroup(state, groupId) {
  state.ui.activeGroupId = groupId;
  saveState(state);
}

export function upsertEvent(state, ev) {
  const idx = state.events.findIndex((x) => x.id === ev.id);
  if (idx === -1) state.events.push(ev);
  else state.events[idx] = ev;
  saveState(state);
}

export function deleteEvent(state, eventId) {
  state.events = state.events.filter((x) => x.id !== eventId);
  // Remove old notified markers for this event.
  Object.keys(state.notified || {}).forEach((k) => {
    if (k.startsWith(`ev:${eventId}:`)) delete state.notified[k];
  });
  saveState(state);
}

export function markNotified(state, key) {
  state.notified[key] = nowIso();
  saveState(state);
}

export function clearNotified(state) {
  state.notified = {};
  saveState(state);
}

export { newId };

export function loadKnownGroups() {
  const raw = localStorage.getItem(GROUPS_KEY);
  const list = safeJsonParse(raw, []);
  return Array.isArray(list) ? list : [];
}

export function saveKnownGroups(list) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
}

export function rememberGroup(code, name) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return;
  const list = loadKnownGroups();
  const idx = list.findIndex((g) => g.code === cleanCode);
  const entry = { code: cleanCode, name: String(name || cleanCode), lastUsedAt: nowIso() };
  if (idx === -1) list.push(entry);
  else list[idx] = { ...list[idx], ...entry };
  // Most recent first.
  list.sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)));
  saveKnownGroups(list);
}

export function forgetGroup(code) {
  const cleanCode = String(code || "").trim().toUpperCase();
  if (!cleanCode) return loadKnownGroups();
  const list = loadKnownGroups().filter((g) => g.code !== cleanCode);
  saveKnownGroups(list);
  return list;
}
