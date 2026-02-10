function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "");
}

const CLIENT_KEY = "kifekoi:clientId:v1";

function clientId() {
  let v = String(localStorage.getItem(CLIENT_KEY) || "").trim();
  if (v) return v;
  v =
    (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null) ||
    `c_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  localStorage.setItem(CLIENT_KEY, v);
  return v;
}

async function apiFetch(path, init) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", "x-kifekoi-client": clientId() },
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!data && path.startsWith("/api/") && res.status === 404) {
    throw new Error("API introuvable (404). Ouvre l'app via `npm run dev` (pas en fichier, ni via un serveur statique).");
  }
  if (!data && path.startsWith("/api/")) {
    // Usually means the server returned HTML (SPA fallback) or wasn't restarted after an API change.
    throw new Error(
      `API invalide (status ${res.status}). Redemarre le serveur (arrete puis relance \`npm run dev\`) et ouvre l'app via http://localhost:5173.`,
    );
  }
  if (!res.ok || !data || data.ok === false) {
    const msg = data?.error || `Erreur API (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export function groupCodeFromUrl() {
  const url = new URL(window.location.href);
  const g = url.searchParams.get("g");
  return normalizeCode(g);
}

export function setGroupCodeInUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("g", normalizeCode(code));
  history.replaceState(null, "", url.toString());
}

export function clearGroupCodeInUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("g");
  history.replaceState(null, "", url.toString());
}

export async function createGroup(name) {
  const data = await apiFetch("/api/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.group;
}

export async function fetchGroup(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}`, {
    method: "GET",
  });
  return data.group;
}

export async function listEvents(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}/events`, {
    method: "GET",
  });
  return data.events;
}

export async function createEvent(code, payload) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}/events`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.event;
}

export async function updateEvent(code, eventId, payload) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  return data.event;
}

export async function deleteEventApi(code, eventId) {
  await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

export async function listComments(code, eventId) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(eventId)}/comments`,
    { method: "GET" },
  );
  return data.comments;
}

export async function addComment(code, eventId, payload) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(eventId)}/comments`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return data.comment;
}

export async function getRating(code, eventId) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(eventId)}/rating`,
    { method: "GET" },
  );
  return data.rating;
}

export async function setRating(code, eventId, vote) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(eventId)}/rating`,
    { method: "POST", body: JSON.stringify({ vote }) },
  );
  return data.rating;
}

export async function getGroupChat(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}/chat`, { method: "GET" });
  return data.chat;
}

export async function postGroupChat(code, payload) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.message;
}

export async function updateGroupChatMessage(code, msgId, text) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/chat/${encodeURIComponent(String(msgId))}`,
    { method: "PUT", body: JSON.stringify({ text }) },
  );
  return data.message;
}

export async function deleteGroupChatMessage(code, msgId) {
  await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}/chat/${encodeURIComponent(String(msgId))}`, {
    method: "DELETE",
  });
}

export async function reactGroupChatMessage(code, msgId, emoji) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/chat/${encodeURIComponent(String(msgId))}/react`,
    { method: "POST", body: JSON.stringify({ emoji }) },
  );
  return { reactions: data.reactions, myReactions: data.myReactions };
}

export async function reactEventComment(code, eventId, commentId, emoji) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(String(eventId))}/comments/${encodeURIComponent(String(commentId))}/react`,
    { method: "POST", body: JSON.stringify({ emoji }) },
  );
  return { reactions: data.reactions, myReactions: data.myReactions };
}

export async function updateEventComment(code, eventId, commentId, text) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(String(eventId))}/comments/${encodeURIComponent(String(commentId))}`,
    { method: "PUT", body: JSON.stringify({ text }) },
  );
  return data.comment;
}

export async function deleteEventComment(code, eventId, commentId) {
  await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(String(eventId))}/comments/${encodeURIComponent(String(commentId))}`,
    { method: "DELETE" },
  );
}

export async function getEventPoll(code, eventId) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(String(eventId))}/poll`,
    { method: "GET" },
  );
  return { poll: data.poll, myVote: data.myVote || "", canEdit: Boolean(data.canEdit) };
}

export async function setEventPoll(code, eventId, { action, question, options }) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(String(eventId))}/poll`,
    { method: "POST", body: JSON.stringify({ action, question, options }) },
  );
  return { poll: data.poll, myVote: data.myVote || "", canEdit: Boolean(data.canEdit) };
}

export async function voteEventPoll(code, eventId, { optionId, vote }) {
  const data = await apiFetch(
    `/api/groups/${encodeURIComponent(normalizeCode(code))}/events/${encodeURIComponent(String(eventId))}/poll/vote`,
    { method: "POST", body: JSON.stringify({ optionId, vote }) },
  );
  return { poll: data.poll, myVote: data.myVote || "", canEdit: Boolean(data.canEdit) };
}

export async function getGroupFriends(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(normalizeCode(code))}/friends`, { method: "GET" });
  return data.friends;
}

export async function geocodePlace(q) {
  const url = `/api/weather/geocode?q=${encodeURIComponent(String(q || ""))}`;
  const data = await apiFetch(url, { method: "GET" });
  return data.results;
}

export async function weatherDay({ lat, lon, dateYmd }) {
  const url =
    `/api/weather/day?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&date=${encodeURIComponent(String(dateYmd))}`;
  const data = await apiFetch(url, { method: "GET" });
  return data.weather;
}

export async function weatherRange({ lat, lon, startYmd, endYmd }) {
  const url =
    `/api/weather/range?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&start=${encodeURIComponent(String(startYmd))}` +
    `&end=${encodeURIComponent(String(endYmd))}`;
  const data = await apiFetch(url, { method: "GET" });
  return data.icons;
}
