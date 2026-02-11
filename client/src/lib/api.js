const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

function apiUrl(path) {
  const p = String(path || "");
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  if (!API_BASE) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

async function apiFetch(path, { method = "GET", body } = {}) {
  const url = apiUrl(path);
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    const msg = data?.error || `Erreur API (${res.status})`;
    throw new Error(`${msg} [${method} ${url}]`);
  }
  return data;
}

export async function me() {
  const data = await apiFetch("/api/auth/me");
  return data.user;
}

export async function signup({ email, password, displayName }) {
  const data = await apiFetch("/api/auth/signup", { method: "POST", body: { email, password, displayName } });
  return data.user;
}

export async function login({ email, password, rememberMe = false }) {
  const data = await apiFetch("/api/auth/login", { method: "POST", body: { email, password, rememberMe: Boolean(rememberMe) } });
  return data.user;
}

export async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST", body: {} });
}

export async function requestPasswordReset(email) {
  await apiFetch("/api/auth/password/reset/request", { method: "POST", body: { email } });
}

export async function confirmPasswordReset({ token, newPassword }) {
  await apiFetch("/api/auth/password/reset/confirm", { method: "POST", body: { token, newPassword } });
}

export async function listMyGroups() {
  const data = await apiFetch("/api/groups");
  return data.groups || [];
}

export async function createGroup(name) {
  const data = await apiFetch("/api/groups", { method: "POST", body: { name } });
  return data.group;
}

export async function joinGroup(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/join`, { method: "POST", body: {} });
  return data.group;
}

export async function leaveGroup(code) {
  await apiFetch(`/api/groups/${encodeURIComponent(code)}/leave`, { method: "POST", body: {} });
}

export async function deleteGroup(code) {
  await apiFetch(`/api/groups/${encodeURIComponent(code)}`, { method: "DELETE", body: {} });
}

export async function listGroupMembers(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/members`);
  return data.members || [];
}

export async function listEvents(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/events`);
  return data.events || [];
}

export async function createEvent(code, payload) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/events`, { method: "POST", body: payload });
  return data.event;
}

export async function updateEvent(code, eventId, payload) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/events/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    body: payload,
  });
  return data.event;
}

export async function deleteEvent(code, eventId) {
  await apiFetch(`/api/groups/${encodeURIComponent(code)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", body: {} });
}

export async function getGroupChat(code) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/chat`);
  return data.chat;
}

export async function postGroupChat(code, text) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/chat`, { method: "POST", body: { text } });
  return data.message;
}

export async function updateGroupChatMessage(code, msgId, text) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/chat/${encodeURIComponent(msgId)}`, { method: "PUT", body: { text } });
  return data.message;
}

export async function deleteGroupChatMessage(code, msgId) {
  await apiFetch(`/api/groups/${encodeURIComponent(code)}/chat/${encodeURIComponent(msgId)}`, { method: "DELETE", body: {} });
}

export async function pinGroupChatMessage(code, msgId) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/chat/${encodeURIComponent(msgId)}/pin`, { method: "POST", body: {} });
  return { pinnedAt: data.pinnedAt || "" };
}

export async function reactGroupChatMessage(code, msgId, emoji) {
  const data = await apiFetch(`/api/groups/${encodeURIComponent(code)}/chat/${encodeURIComponent(msgId)}/react`, {
    method: "POST",
    body: { emoji },
  });
  return { reactions: data.reactions || {}, myReactions: data.myReactions || {} };
}

export async function geocodePlace(q) {
  const data = await apiFetch(`/api/weather/geocode?q=${encodeURIComponent(String(q || ""))}`);
  return data.results || [];
}

export async function weatherDay({ lat, lon, dateYmd }) {
  const data = await apiFetch(
    `/api/weather/day?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&date=${encodeURIComponent(String(dateYmd))}`,
  );
  return data.weather;
}

export async function weatherRange({ lat, lon, startYmd, endYmd }) {
  const data = await apiFetch(
    `/api/weather/range?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&start=${encodeURIComponent(String(startYmd))}&end=${encodeURIComponent(
      String(endYmd),
    )}`,
  );
  return data.icons || {};
}

export async function listFriends() {
  const data = await apiFetch("/api/friends");
  return data.friends || [];
}

export async function listFriendRequests() {
  const data = await apiFetch("/api/friends/requests");
  return { incoming: data.incoming || [], outgoing: data.outgoing || [] };
}

export async function sendFriendRequest(email) {
  const data = await apiFetch("/api/friends/requests", { method: "POST", body: { email } });
  return data.request || null;
}

export async function acceptFriendRequest(id) {
  await apiFetch(`/api/friends/requests/${encodeURIComponent(id)}/accept`, { method: "POST", body: {} });
}

export async function declineFriendRequest(id) {
  await apiFetch(`/api/friends/requests/${encodeURIComponent(id)}/decline`, { method: "POST", body: {} });
}

export async function cancelFriendRequest(id) {
  await apiFetch(`/api/friends/requests/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} });
}
