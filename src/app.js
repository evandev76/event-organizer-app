import { loadState, saveState, clearNotified, rememberGroup, loadKnownGroups, forgetGroup } from "./storage.js";
import { addMinutes, formatHm, formatHumanDate, getMonthGrid, parseLocalDateTime, startOfDay, toYmd } from "./date.js";
import { renderCalendar } from "./calendar.js";
import { buildIcsForEvent, downloadText, icsFilename, humanRange } from "./ics.js";
import { canNotify, ensurePermission, startNotificationLoop } from "./notifications.js";
import { makeEventIconEl } from "./icons.js";
import {
  clearGroupCodeInUrl,
  createGroup as apiCreateGroup,
  addComment,
  createEvent as apiCreateEvent,
  deleteEventApi,
  fetchGroup,
  getRating,
  getGroupChat,
  getGroupFriends,
  getEventPoll,
  geocodePlace,
  groupCodeFromUrl,
  listComments,
  listEvents,
  postGroupChat,
  updateGroupChatMessage,
  deleteGroupChatMessage,
  reactEventComment,
  reactGroupChatMessage,
  setGroupCodeInUrl,
  setRating,
  setEventPoll,
  updateEventComment,
  deleteEventComment,
  updateEvent as apiUpdateEvent,
  voteEventPoll,
  weatherDay,
  weatherRange,
} from "./api.js";

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element manquant: ${id}`);
  return el;
}

const BUILD = "2026-02-09-7";

const els = {
  btnViewCalendar: $("btnViewCalendar"),
  btnViewHub: $("btnViewHub"),
  calendarView: $("calendarView"),
  hubView: $("hubView"),
  hubGroups: $("hubGroups"),
  hubFriends: $("hubFriends"),
  hubFriendsHint: $("hubFriendsHint"),
  btnHubRefresh: $("btnHubRefresh"),

  groupSelect: $("groupSelect"),
  groupHint: $("groupHint"),
  groupName: $("groupName"),
  joinCode: $("joinCode"),
  btnJoin: $("btnJoin"),
  btnCreateGroup: $("btnCreateGroup"),
  btnLeaveGroup: $("btnLeaveGroup"),
  btnRemoveGroup: $("btnRemoveGroup"),
  weatherCity: $("weatherCity"),
  btnSaveCity: $("btnSaveCity"),

  btnNewEvent: $("btnNewEvent"),
  btnNotifications: $("btnNotifications"),

  btnPrev: $("btnPrev"),
  btnToday: $("btnToday"),
  btnNext: $("btnNext"),
  monthLabel: $("monthLabel"),
  calendar: $("calendar"),

  selectedDayLabel: $("selectedDayLabel"),
  dayEventList: $("dayEventList"),

  modalBackdrop: $("modalBackdrop"),
  eventModal: $("eventModal"),
  eventForm: $("eventForm"),
  eventModalTitle: $("eventModalTitle"),
  btnDeleteEvent: $("btnDeleteEvent"),
  btnExportIcs: $("btnExportIcs"),
  btnCancelEvent: $("btnCancelEvent"),

  evId: $("evId"),
  evTitle: $("evTitle"),
  evGroup: $("evGroup"),
  evDate: $("evDate"),
  evTime: $("evTime"),
  evDurH: $("evDurH"),
  evDurM: $("evDurM"),
  evReminder: $("evReminder"),
  evDescription: $("evDescription"),
  eventWeatherHint: $("eventWeatherHint"),

  groupPins: $("groupPins"),
  groupChatList: $("groupChatList"),
  groupChatText: $("groupChatText"),
  btnGroupChatSend: $("btnGroupChatSend"),
  btnToggleGroupChat: $("btnToggleGroupChat"),
  groupChatBody: $("groupChatBody"),
  groupQuick: $("groupQuick"),

  detailsModal: $("detailsModal"),
  detailsBody: $("detailsBody"),
  btnEditFromDetails: $("btnEditFromDetails"),
  btnExportIcsFromDetails: $("btnExportIcsFromDetails"),

  ratingBox: $("ratingBox"),
  ratingStats: $("ratingStats"),
  ratingHint: $("ratingHint"),
  btnThumbUp: $("btnThumbUp"),
  btnThumbDown: $("btnThumbDown"),
  btnClearVote: $("btnClearVote"),

  btnChangePseudo: $("btnChangePseudo"),
  chatList: $("chatList"),
  chatText: $("chatText"),
  btnChatSend: $("btnChatSend"),
  eventQuick: $("eventQuick"),

  notifDot: $("notifDot"),
  buildStamp: $("buildStamp"),

  pollBox: $("pollBox"),
  pollQuestion: $("pollQuestion"),
  pollOptions: $("pollOptions"),
  pollHint: $("pollHint"),
  btnNewPoll: $("btnNewPoll"),
  btnClearPoll: $("btnClearPoll"),
  pollEditor: $("pollEditor"),
  pollQInput: $("pollQInput"),
  pollOptsInput: $("pollOptsInput"),
  btnCreatePoll: $("btnCreatePoll"),
  btnCancelPoll: $("btnCancelPoll"),
};

const state = loadState();

const VIEW_KEY = "kifekoi:view:v1";
const HUB_SELECTED_KEY = "kifekoi:hubSelectedGroup:v1";

const ui = {
  monthDate: new Date(),
  selectedDay: new Date(),
  detailsEventId: null,
  activeGroupCode: "",
  activeGroupName: "",
  events: [],
  comments: new Map(), // eventId -> comments[]
  apiOk: null,
  rating: new Map(), // eventId -> { ended, canVote, up, down, myVote }
  groupChat: { pins: [], messages: [] },
  weatherByDayKey: new Map(), // dayKey -> "sun"|"rain"
  poll: new Map(), // eventId -> { poll, myVote, canEdit }
};

const AUTHOR_KEY = "kifekoi:author:v1";
const WEATHER_KEY = "kifekoi:weatherCityByGroup:v1"; // { [groupCode]: { label, lat, lon } }

function renderPollLoading() {
  els.pollBox.style.display = "";
  els.pollQuestion.textContent = "Chargement sondage...";
  els.pollOptions.textContent = "";
  els.pollHint.textContent = "";
  els.pollEditor.classList.add("hidden");
  els.btnNewPoll.disabled = true;
  els.btnClearPoll.disabled = true;
}

function renderPollNone({ canEdit } = {}) {
  els.pollBox.style.display = "";
  els.pollQuestion.textContent = "Aucun sondage.";
  els.pollOptions.textContent = "";
  els.pollHint.textContent = canEdit ? "Cree un sondage pour choisir une option avec le groupe." : "";
  els.pollEditor.classList.add("hidden");
  els.btnNewPoll.disabled = !canEdit;
  els.btnClearPoll.disabled = true;
  els.btnClearPoll.style.display = "none";
  els.btnNewPoll.style.display = canEdit ? "" : "none";
}

function openPollEditor({ question = "", options = [] } = {}) {
  els.pollEditor.classList.remove("hidden");
  els.pollQInput.value = String(question || "");
  els.pollOptsInput.value = (Array.isArray(options) && options.length ? options : ["Pizza", "Burger"])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
  // Put cursor in the question field.
  els.pollQInput.focus();
}

function closePollEditor() {
  els.pollEditor.classList.add("hidden");
}

function renderPollForEvent(eventId) {
  const st = ui.poll.get(eventId) || null;
  const canEdit = Boolean(st?.canEdit);
  const poll = st?.poll || null;
  const myVote = String(st?.myVote || "");

  els.btnNewPoll.style.display = canEdit ? "" : "none";
  els.btnClearPoll.style.display = canEdit && poll ? "" : "none";
  els.btnNewPoll.disabled = !canEdit;
  els.btnClearPoll.disabled = !(canEdit && poll);

  if (!poll) {
    renderPollNone({ canEdit });
    return;
  }

  els.pollBox.style.display = "";
  els.pollQuestion.textContent = poll.question || "Sondage";
  // If the editor is open, keep it visible but don't overwrite its inputs.
  els.pollOptions.textContent = "";

  const opts = Array.isArray(poll.options) ? poll.options : [];
  for (const o of opts) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "popt";
    if (o.id && o.id === myVote) b.classList.add("on");

    const left = document.createElement("div");
    left.textContent = o.text || "-";
    const right = document.createElement("div");
    right.className = "pcount";
    right.textContent = `${Number(o.count || 0)}`;
    b.appendChild(left);
    b.appendChild(right);

    b.addEventListener("click", async () => {
      try {
        if (!ui.activeGroupCode) throw new Error("Aucun groupe actif.");
        const next = await voteEventPoll(ui.activeGroupCode, eventId, { optionId: o.id });
        ui.poll.set(eventId, next);
        renderPollForEvent(eventId);
      } catch (e) {
        alert(e.message || String(e));
      }
    });

    els.pollOptions.appendChild(b);
  }

  const voted = myVote ? "Ton vote est enregistre." : "Clique un choix pour voter.";
  els.pollHint.textContent = voted;
}

async function refreshPollForEvent(eventId) {
  if (!ui.activeGroupCode) return;
  const st = await getEventPoll(ui.activeGroupCode, eventId);
  ui.poll.set(eventId, st);
  if (els.detailsModal.open && ui.detailsEventId === eventId) renderPollForEvent(eventId);
}

function copyText(text) {
  const v = String(text || "");
  if (!v) return;
  const clip = globalThis.navigator?.clipboard;
  if (clip && typeof clip.writeText === "function") return clip.writeText(v);
  // Fallback: prompt allows manual copy.
  prompt("Copie ce texte:", v);
}

function setActiveView(view) {
  const v = view === "hub" ? "hub" : "calendar";
  localStorage.setItem(VIEW_KEY, v);

  const isHub = v === "hub";
  els.calendarView.classList.toggle("hidden", isHub);
  els.hubView.classList.toggle("hidden", !isHub);

  els.btnViewCalendar.classList.toggle("on", !isHub);
  els.btnViewHub.classList.toggle("on", isHub);

  if (isHub) renderHub().catch(() => {});
}

function getHubSelectedGroupCode() {
  const raw = String(localStorage.getItem(HUB_SELECTED_KEY) || "").trim().toUpperCase();
  if (raw) return raw;
  if (ui.activeGroupCode) return ui.activeGroupCode;
  const known = loadKnownGroups();
  return known[0]?.code || "";
}

function setHubSelectedGroupCode(code) {
  const c = String(code || "").trim().toUpperCase();
  localStorage.setItem(HUB_SELECTED_KEY, c);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function maxDate(a, b) {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}

function loadWeatherPrefs() {
  try {
    const raw = localStorage.getItem(WEATHER_KEY);
    const obj = JSON.parse(raw || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveWeatherPrefs(obj) {
  localStorage.setItem(WEATHER_KEY, JSON.stringify(obj));
}

function getWeatherPref(groupCode) {
  const prefs = loadWeatherPrefs();
  return prefs[String(groupCode || "").toUpperCase()] || null;
}

function setWeatherPref(groupCode, prefOrNull) {
  const code = String(groupCode || "").toUpperCase();
  const prefs = loadWeatherPrefs();
  if (!prefOrNull) delete prefs[code];
  else prefs[code] = prefOrNull;
  saveWeatherPrefs(prefs);
}

function colorIndex(key) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

function weatherSvg(icon) {
  if (icon === "rain") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a1 1 0 0 1-.9-1.4l1-2.2a1 1 0 1 1 1.8.8l-1 2.2A1 1 0 0 1 7 18Zm5 0a1 1 0 0 1-.9-1.4l1-2.2a1 1 0 1 1 1.8.8l-1 2.2A1 1 0 0 1 12 18Zm5 0a1 1 0 0 1-.9-1.4l1-2.2a1 1 0 1 1 1.8.8l-1 2.2A1 1 0 0 1 17 18Zm-1.2-8.9A5.5 5.5 0 0 0 6.3 7.8 4.5 4.5 0 0 0 7.5 16H18a4 4 0 0 0 2.8-6.9Z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-16h1v3h-2V2h1Zm0 19h1v-3h-2v3h1ZM3.5 12.5v-2H1v2h2.5Zm19.5 0v-2H20.5v2H23ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4L4.2 5.6Zm13.4 13.4 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM18.4 4.2l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1ZM5.6 19.8l-1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1Z"/></svg>`;
}

function makeWeatherIconEl(icon) {
  const el = document.createElement("span");
  el.className = `wicon ${icon === "rain" ? "rain" : "sun"}`;
  el.innerHTML = weatherSvg(icon);
  el.title = icon === "rain" ? "Pluie" : "Soleil";
  return el;
}

function loadAuthor() {
  return String(localStorage.getItem(AUTHOR_KEY) || "").trim();
}
function saveAuthor(v) {
  localStorage.setItem(AUTHOR_KEY, String(v || "").trim());
}

function promptForAuthor() {
  const current = loadAuthor();
  // eslint-disable-next-line no-alert
  const v = prompt("Choisis un pseudo (visible dans la discussion du groupe):", current || "");
  if (v == null) return null;
  const clean = String(v).trim().slice(0, 24);
  if (!clean) return null;
  saveAuthor(clean);
  return clean;
}

function authorOrAskOnce() {
  const existing = loadAuthor();
  if (existing) return existing;
  return promptForAuthor();
}

const QUICK_MESSAGES = [
  "J'arrive",
  "Je suis en retard",
  "Je ne peux plus venir",
  "Ok",
  "On se retrouve ou ?",
];

const REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "🎉", "😮"];

function renderQuickButtons(rootEl, onSend) {
  rootEl.textContent = "";
  for (const t of QUICK_MESSAGES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qbtn";
    b.textContent = t;
    b.addEventListener("click", () => onSend(t));
    rootEl.appendChild(b);
  }
}

function renderReactionRow({ rootEl, reactions, myReactions, onReact }) {
  rootEl.textContent = "";
  rootEl.className = "reactions";

  const merged = new Map();
  for (const [emoji, cnt] of Object.entries(reactions || {})) merged.set(emoji, Number(cnt || 0));
  for (const emoji of REACTION_EMOJIS) if (!merged.has(emoji)) merged.set(emoji, 0);

  for (const [emoji, cnt] of merged.entries()) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rbtn";
    if (myReactions && myReactions[emoji]) b.classList.add("on");
    b.textContent = cnt > 0 ? `${emoji} ${cnt}` : `${emoji}`;
    b.addEventListener("click", () => onReact(emoji));
    rootEl.appendChild(b);
  }
}

function getActiveGroupId() {
  return ui.activeGroupCode;
}

function getGroupName() {
  return ui.activeGroupName || ui.activeGroupCode || "";
}

function getEvents() {
  return ui.events.slice();
}

function sortEventsByStart(a, b) {
  return new Date(a.start).getTime() - new Date(b.start).getTime();
}

function eventsForDay(dayDate) {
  const start = startOfDay(dayDate).getTime();
  const end = addMinutes(new Date(start), 24 * 60).getTime();
  return ui.events
    .filter((e) => {
      const t = new Date(e.start).getTime();
      return t >= start && t < end;
    })
    .sort(sortEventsByStart);
}

function buildEventsByDayKey(monthDate) {
  const gridStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() - 7);
  const end = new Date(gridStart.getFullYear(), gridStart.getMonth() + 1, 10);

  const m = new Map();
  for (const ev of ui.events) {
    const t = new Date(ev.start);
    if (t.getTime() < start.getTime() || t.getTime() > end.getTime()) continue;
    const key = toYmd(t);
    const list = m.get(key) || [];
    list.push(ev);
    m.set(key, list);
  }
  for (const [k, list] of m.entries()) list.sort(sortEventsByStart);
  return m;
}

function renderGroupPicker() {
  const known = loadKnownGroups();
  els.groupSelect.textContent = "";

  if (known.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Aucun groupe memorise";
    els.groupSelect.appendChild(opt);
    els.groupSelect.disabled = true;
  } else {
    els.groupSelect.disabled = false;
    for (const g of known) {
      const opt = document.createElement("option");
      opt.value = g.code;
      opt.textContent = `${g.name} (${g.code})`;
      if (g.code === ui.activeGroupCode) opt.selected = true;
      els.groupSelect.appendChild(opt);
    }
  }

  // Event modal group select: single option for current group.
  els.evGroup.textContent = "";
  const optEv = document.createElement("option");
  optEv.value = ui.activeGroupCode;
  optEv.textContent = ui.activeGroupName ? `${ui.activeGroupName} (${ui.activeGroupCode})` : ui.activeGroupCode || "-";
  optEv.selected = true;
  els.evGroup.appendChild(optEv);
  els.evGroup.disabled = true;

  if (ui.activeGroupCode) {
    const link = new URL(window.location.href);
    link.searchParams.set("g", ui.activeGroupCode);
    els.groupHint.textContent = `Lien a partager: ${link.toString()}`;
    els.btnLeaveGroup.disabled = false;
  } else {
    els.groupHint.textContent = "Entre un code pour rejoindre, ou cree un groupe.";
    els.btnLeaveGroup.disabled = true;
  }
  els.btnRemoveGroup.disabled = known.length === 0;

  if (ui.apiOk === false) {
    els.groupHint.textContent =
      "API introuvable. Lance l'app via `npm run dev` (le mode serveur est obligatoire pour groupes + chat).";
  }

  const pref = ui.activeGroupCode ? getWeatherPref(ui.activeGroupCode) : null;
  els.weatherCity.value = pref?.label || "";
  els.weatherCity.disabled = !ui.activeGroupCode;
  els.btnSaveCity.disabled = !ui.activeGroupCode;
}

function renderHubGroups() {
  const known = loadKnownGroups();
  els.hubGroups.textContent = "";

  if (known.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Aucun groupe memorise. Rejoins un groupe avec un code ou cree-en un.";
    els.hubGroups.appendChild(empty);
    return;
  }

  let selected = getHubSelectedGroupCode();
  if (!selected || !known.some((g) => g.code === selected)) {
    selected = known[0].code;
    setHubSelectedGroupCode(selected);
  }

  for (const g of known) {
    const card = document.createElement("div");
    card.className = "hub-group-item";
    if (g.code === selected) card.classList.add("on");

    const top = document.createElement("div");
    top.className = "hub-group-top";

    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "hub-group-name";
    name.textContent = g.name || g.code;
    const code = document.createElement("div");
    code.className = "hub-group-code";
    code.textContent = g.code;
    left.appendChild(name);
    left.appendChild(code);

    const right = document.createElement("div");
    right.className = "hub-group-code";
    right.textContent = g.lastUsedAt ? `Dernier: ${formatHumanDate(new Date(g.lastUsedAt))}` : "";

    top.appendChild(left);
    top.appendChild(right);
    card.appendChild(top);

    const actions = document.createElement("div");
    actions.className = "hub-group-actions";

    const btnSelect = document.createElement("button");
    btnSelect.type = "button";
    btnSelect.className = "btn btn-small";
    btnSelect.textContent = "Voir amis";
    btnSelect.addEventListener("click", (e) => {
      e.stopPropagation();
      setHubSelectedGroupCode(g.code);
      renderHub().catch(() => {});
    });

    const btnOpen = document.createElement("button");
    btnOpen.type = "button";
    btnOpen.className = "btn btn-small";
    btnOpen.textContent = "Ouvrir";
    btnOpen.addEventListener("click", async (e) => {
      e.stopPropagation();
      setHubSelectedGroupCode(g.code);
      try {
        await activateGroup(g.code);
      } finally {
        renderHub().catch(() => {});
      }
    });

    const btnLink = document.createElement("button");
    btnLink.type = "button";
    btnLink.className = "btn btn-ghost btn-small";
    btnLink.textContent = "Copier lien";
    btnLink.addEventListener("click", (e) => {
      e.stopPropagation();
      const link = new URL(window.location.href);
      link.searchParams.set("g", g.code);
      copyText(link.toString());
    });

    const btnForget = document.createElement("button");
    btnForget.type = "button";
    btnForget.className = "btn btn-ghost btn-small danger";
    btnForget.textContent = "Enlever";
    btnForget.addEventListener("click", (e) => {
      e.stopPropagation();
      const ok = confirm(`Enlever "${g.name || g.code}" de ta liste locale ?`);
      if (!ok) return;
      forgetGroup(g.code);
      // If it was selected, pick the first remaining group.
      const next = loadKnownGroups();
      if (getHubSelectedGroupCode() === g.code) setHubSelectedGroupCode(next[0]?.code || "");
      renderHub().catch(() => {});
    });

    actions.appendChild(btnSelect);
    actions.appendChild(btnOpen);
    actions.appendChild(btnLink);
    actions.appendChild(btnForget);
    card.appendChild(actions);

    card.addEventListener("click", () => {
      setHubSelectedGroupCode(g.code);
      renderHub().catch(() => {});
    });

    els.hubGroups.appendChild(card);
  }
}

async function renderHubFriends() {
  const code = getHubSelectedGroupCode();
  els.hubFriends.textContent = "";

  if (!code) {
    els.hubFriendsHint.textContent = "Choisis un groupe pour voir les pseudos (amis) qui ont ecrit dans le chat/commentaires.";
    return;
  }

  els.hubFriendsHint.textContent = `Groupe: ${code}`;
  const loading = document.createElement("div");
  loading.className = "muted";
  loading.textContent = "Chargement...";
  els.hubFriends.appendChild(loading);

  try {
    const friends = await getGroupFriends(code);
    els.hubFriends.textContent = "";

    if (!friends.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Aucun pseudo encore. Ecris dans la discussion du groupe ou dans un evenement, et ca apparaitra ici.";
      els.hubFriends.appendChild(empty);
      return;
    }

    for (const f of friends) {
      const item = document.createElement("div");
      item.className = "friend-item";

      const top = document.createElement("div");
      top.className = "friend-top";
      const name = document.createElement("div");
      name.className = "friend-name";
      name.textContent = f.name || "-";
      const total = document.createElement("div");
      total.className = "hub-group-code";
      const t = Number(f.messages || 0) + Number(f.comments || 0);
      total.textContent = `${t} actions`;
      top.appendChild(name);
      top.appendChild(total);

      const meta = document.createElement("div");
      meta.className = "friend-meta";
      const last = f.lastAt ? formatHumanDate(new Date(f.lastAt)) : "-";
      meta.textContent = `Chat: ${Number(f.messages || 0)} · Com: ${Number(f.comments || 0)} · Dernier: ${last}`;

      item.appendChild(top);
      item.appendChild(meta);
      els.hubFriends.appendChild(item);
    }
  } catch (e) {
    els.hubFriends.textContent = "";
    const err = document.createElement("div");
    err.className = "muted danger";
    err.textContent = String(e?.message || "Erreur.");
    els.hubFriends.appendChild(err);
  }
}

async function renderHub() {
  renderHubGroups();
  await renderHubFriends();
}

function renderSelectedDayPanel() {
  const d = ui.selectedDay;
  els.dayEventList.textContent = "";

  if (!d) {
    els.selectedDayLabel.textContent = "Aucun";
    return;
  }

  // Selected day label + weather icon (if available)
  const dayKey = toYmd(d);
  els.selectedDayLabel.textContent = "";
  els.selectedDayLabel.appendChild(document.createTextNode(formatHumanDate(d)));
  const wDay = ui.weatherByDayKey?.get(dayKey);
  if (wDay === "sun" || wDay === "rain") els.selectedDayLabel.appendChild(makeWeatherIconEl(wDay));

  const evs = eventsForDay(d);
  if (evs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = ui.activeGroupCode ? "Aucun evenement." : "Rejoins un groupe pour voir les evenements.";
    els.dayEventList.appendChild(empty);
    return;
  }

  for (const ev of evs) {
    const item = document.createElement("div");
    item.className = `day-item c${colorIndex(ev.id || ev.title)}${evs.length === 1 ? " solo" : ""}`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      openDetailsModal(ev.id);
    });

    const title = document.createElement("div");
    title.className = "day-item-title";
    // Meteo (jour) si disponible
    const dayKey = toYmd(new Date(ev.start));
    const w = ui.weatherByDayKey?.get(dayKey);
    if (w === "sun" || w === "rain") title.appendChild(makeWeatherIconEl(w));
    title.appendChild(makeEventIconEl(ev.title || ""));
    title.appendChild(document.createTextNode(ev.title || "Evenement"));

    const meta = document.createElement("div");
    meta.className = "day-item-meta";
    meta.textContent = humanRange(ev);

    item.appendChild(title);
    item.appendChild(meta);
    els.dayEventList.appendChild(item);
  }
}

function renderMonth() {
  const today = new Date();
  const eventsByDayKey = buildEventsByDayKey(ui.monthDate);

  const { monthLabel } = renderCalendar({
    rootEl: els.calendar,
    monthDate: ui.monthDate,
    today,
    selectedDay: ui.selectedDay,
    eventsByDayKey,
    weatherByDayKey: ui.weatherByDayKey,
    onSelectDay: (d) => {
      ui.selectedDay = d;
      renderMonth();
      renderSelectedDayPanel();
    },
  });

  els.monthLabel.textContent = monthLabel;
}

function openModal(dialogEl) {
  els.modalBackdrop.classList.remove("hidden");
  dialogEl.showModal();
}

function closeModal(dialogEl) {
  dialogEl.close();
  els.modalBackdrop.classList.add("hidden");
}

function resetEventFormForNew() {
  els.eventModalTitle.textContent = "Nouvel evenement";
  els.btnDeleteEvent.classList.add("danger");
  els.btnDeleteEvent.classList.remove("btn-danger");
  els.btnDeleteEvent.style.visibility = "hidden";

  els.evId.value = "";
  els.evTitle.value = "";
  els.evDescription.value = "";
  els.evReminder.value = "0";
  els.evDurH.value = "1";
  els.evDurM.value = "0";

  const base = ui.selectedDay ? new Date(ui.selectedDay) : new Date();
  els.evDate.value = toYmd(base);
  els.evTime.value = "18:00";
  updateEventWeatherHint();
}

function fillEventFormForEdit(ev) {
  els.eventModalTitle.textContent = "Modifier evenement";
  els.btnDeleteEvent.style.visibility = ev.canEdit === false ? "hidden" : "visible";
  els.btnDeleteEvent.classList.add("btn-danger");

  const start = new Date(ev.start);
  els.evId.value = ev.id;
  els.evTitle.value = ev.title || "";
  els.evDate.value = toYmd(start);
  els.evTime.value = formatHm(start);
  const durMin = Math.max(5, Math.round((new Date(ev.end) - start) / 60_000) || 60);
  const h = Math.floor(durMin / 60);
  const m = durMin % 60;
  els.evDurH.value = String(h);
  els.evDurM.value = String(m);
  els.evReminder.value = String(ev.reminderMinutes || 0);
  els.evDescription.value = ev.description || "";
  updateEventWeatherHint();
}

function readEventPayloadFromForm() {
  const title = els.evTitle.value.trim();
  const dateYmd = els.evDate.value;
  const timeHm = els.evTime.value;
  const durH = Number(els.evDurH.value || 0);
  const durM = Number(els.evDurM.value || 0);
  const duration = durH * 60 + durM;
  const reminderMinutes = Number(els.evReminder.value || 0);
  const description = els.evDescription.value.trim();

  if (!ui.activeGroupCode) throw new Error("Aucun groupe actif.");
  if (!title) throw new Error("Le titre est obligatoire.");
  if (!dateYmd) throw new Error("Date invalide.");
  if (!timeHm) throw new Error("Heure invalide.");
  if (!Number.isFinite(durH) || durH < 0 || durH > 72) throw new Error("Duree (heures) invalide.");
  if (!Number.isFinite(durM) || durM < 0 || durM > 59) throw new Error("Duree (minutes) invalide.");
  if (!Number.isFinite(duration) || duration < 5) throw new Error("Duree invalide.");

  const start = parseLocalDateTime(dateYmd, timeHm);
  const end = addMinutes(start, duration);

  return {
    title,
    description,
    reminderMinutes,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function setWeatherHintText(parts) {
  els.eventWeatherHint.textContent = "";
  for (const p of parts) {
    if (typeof p === "string") els.eventWeatherHint.appendChild(document.createTextNode(p));
    else els.eventWeatherHint.appendChild(p);
  }
}

function iconLabel(icon) {
  return icon === "rain" ? "Pluie" : "Soleil";
}

function updateEventWeatherHint() {
  const code = ui.activeGroupCode;
  if (!code) {
    setWeatherHintText(["Rejoins un groupe pour la meteo."]);
    return;
  }
  const pref = getWeatherPref(code);
  if (!pref) {
    setWeatherHintText(["Configure la ville meteo dans le groupe."]);
    return;
  }
  const ymd = String(els.evDate.value || "").trim();
  if (!ymd) {
    setWeatherHintText([`Ville: ${pref.label}. Choisis une date.`]);
    return;
  }
  const cached = ui.weatherByDayKey?.get(ymd);
  if (cached === "sun" || cached === "rain") {
    setWeatherHintText(["Ville: ", pref.label, " · ", makeWeatherIconEl(cached), iconLabel(cached)]);
    return;
  }
  setWeatherHintText(["Ville: ", pref.label, " · Chargement..."]);
}

async function ensureWeatherForDay(ymd) {
  const code = ui.activeGroupCode;
  if (!code) return;
  const pref = getWeatherPref(code);
  if (!pref) return;
  if (ui.weatherByDayKey?.get(ymd)) return;
  const w = await weatherDay({ lat: pref.lat, lon: pref.lon, dateYmd: ymd });
  if (w && (w.icon === "sun" || w.icon === "rain")) {
    ui.weatherByDayKey.set(ymd, w.icon);
  }
}

function openEventModalNew() {
  if (!ui.activeGroupCode) {
    alert("Rejoins ou cree un groupe d'abord.");
    return;
  }
  renderGroupPicker();
  resetEventFormForNew();
  openModal(els.eventModal);
}

function openEventModalEdit(eventId) {
  const ev = ui.events.find((e) => e.id === eventId);
  if (!ev) return;
  if (ev.canEdit === false) {
    alert("Seul le createur peut modifier cet evenement.");
    return;
  }
  renderGroupPicker();
  fillEventFormForEdit(ev);
  openModal(els.eventModal);
}

function openDetailsModal(eventId) {
  const ev = ui.events.find((e) => e.id === eventId);
  if (!ev) return;
  ui.detailsEventId = ev.id;

  const parts = [];
  parts.push({ k: "Titre", v: ev.title || "Evenement", pre: false, isTitle: true });
  parts.push({ k: "Groupe", v: getGroupName() || "-", pre: false });
  parts.push({ k: "Quand", v: humanRange(ev), pre: false });
  parts.push({
    k: "Rappel",
    v: ev.reminderMinutes ? `${ev.reminderMinutes} min avant` : "Aucun",
    pre: false,
  });
  parts.push({ k: "Description", v: ev.description || "(vide)", pre: true });

  els.detailsBody.textContent = "";
  for (const p of parts) {
    const kv = document.createElement("div");
    kv.className = "kv";
    const k = document.createElement("div");
    k.className = "kv-k";
    k.textContent = p.k;
    const v = document.createElement("div");
    v.className = p.pre ? "kv-v pre" : "kv-v";
    if (p.isTitle) {
      v.appendChild(makeEventIconEl(ev.title || ""));
      v.appendChild(document.createTextNode(p.v));
    } else {
      v.textContent = p.v;
    }
    kv.appendChild(k);
    kv.appendChild(v);
    els.detailsBody.appendChild(kv);
  }

  openModal(els.detailsModal);

  // Only owner can edit.
  els.btnEditFromDetails.style.display = ev.canEdit === false ? "none" : "";

  // Rating (non-blocking)
  renderRatingFromEvent(ev);
  refreshRatingForEvent(ev.id).catch(() => {});

  // Kick off discussion load (non-blocking).
  const cached = ui.comments.get(ev.id);
  if (cached) renderChat(cached);
  else renderChatLoading();
  refreshCommentsForEvent(ev.id).catch(() => {
    // ignore
  });

  // Poll (non-blocking).
  closePollEditor();
  const pollCached = ui.poll.get(ev.id);
  if (pollCached) renderPollForEvent(ev.id);
  else renderPollLoading();
  refreshPollForEvent(ev.id).catch(() => {
    // ignore
  });
}

async function refreshWeatherForCurrentMonth({ silent = true } = {}) {
  ui.weatherByDayKey = new Map();
  if (!ui.activeGroupCode) {
    renderMonth();
    return false;
  }
  const pref = getWeatherPref(ui.activeGroupCode);
  if (!pref) {
    renderMonth();
    return false;
  }

  // Range = full 6-week grid for the displayed month.
  const days = getMonthGrid(ui.monthDate);
  const gridStart = days[0];
  const gridEnd = days[days.length - 1];

  // Open-Meteo free forecast endpoints have a limited date window (typically ~last 92 days and ~next 16 days).
  // Clamp the request so navigation to far months doesn't hard-fail; icons simply won't show out of range.
  const today = new Date();
  // Be slightly conservative to avoid off-by-one errors in the provider's range checks.
  const allowedStart = addDays(today, -93);
  const allowedEnd = addDays(today, 15);
  const reqStart = maxDate(gridStart, allowedStart);
  const reqEnd = minDate(gridEnd, allowedEnd);

  if (reqStart.getTime() > reqEnd.getTime()) {
    renderMonth();
    renderSelectedDayPanel();
    if (!silent) {
      const a = toYmd(allowedStart);
      const b = toYmd(allowedEnd);
      throw new Error(`Meteo hors plage: disponible du ${a} au ${b}.`);
    }
    return false;
  }

  const startYmd = toYmd(reqStart);
  const endYmd = toYmd(reqEnd);

  try {
    const icons = await weatherRange({ lat: pref.lat, lon: pref.lon, startYmd, endYmd });
    const m = new Map();
    for (const [k, v] of Object.entries(icons || {})) {
      if (v === "sun" || v === "rain") m.set(k, v);
    }
    ui.weatherByDayKey = m;
  } catch (e) {
    ui.weatherByDayKey = new Map();
    if (!silent) {
      const msg = e?.message ? `Meteo indisponible: ${e.message}` : "Meteo indisponible.";
      throw new Error(`${msg} [build ${BUILD}] (Astuce: redemarre le serveur et verifie ta connexion internet.)`);
    }
  }
  renderMonth();
  renderSelectedDayPanel();
  return ui.weatherByDayKey.size > 0;
}

function endedFromEvent(ev) {
  if (typeof ev.ended === "boolean") return ev.ended;
  return new Date(ev.end).getTime() <= Date.now();
}

function renderRatingFromEvent(ev) {
  const ended = endedFromEvent(ev);
  if (!ended) {
    els.ratingBox.style.display = "none";
    return;
  }
  // Only participants can vote; non-participants still see stats.
  const canVote = ev.canVote === true;
  const up = Number(ev.ratingUp || 0);
  const down = Number(ev.ratingDown || 0);
  const myVote = Number(ev.myVote || 0);
  ui.rating.set(ev.id, { ended: true, canVote, up, down, myVote });
  renderRating(ev.id);
}

function renderRating(eventId) {
  const r = ui.rating.get(eventId);
  if (!r || !r.ended) {
    els.ratingBox.style.display = "none";
    return;
  }
  els.ratingBox.style.display = "";
  els.ratingStats.textContent = `👍 ${r.up} · 👎 ${r.down}`;
  els.btnThumbUp.classList.toggle("voted", r.myVote === 1);
  els.btnThumbDown.classList.toggle("voted", r.myVote === -1);
  els.btnClearVote.disabled = r.myVote === 0;

  if (!r.canVote) {
    els.ratingHint.textContent = "Vote reserve aux participants.";
    els.btnThumbUp.disabled = true;
    els.btnThumbDown.disabled = true;
    els.btnClearVote.disabled = true;
    return;
  }

  els.btnThumbUp.disabled = false;
  els.btnThumbDown.disabled = false;
  els.btnClearVote.disabled = r.myVote === 0;
  els.ratingHint.textContent = r.myVote === 0 ? "Donne ton avis: bien ou pas bien." : "Merci pour ton avis.";

  // Visual hint when user hasn't voted yet.
  els.ratingBox.classList.toggle("attn", r.myVote === 0);
}

async function refreshRatingForEvent(eventId) {
  if (!ui.activeGroupCode) return;
  const r = await getRating(ui.activeGroupCode, eventId);
  ui.rating.set(eventId, r);

  // Keep list view in sync for stats/ended.
  const idx = ui.events.findIndex((e) => e.id === eventId);
  if (idx !== -1) {
    ui.events[idx] = {
      ...ui.events[idx],
      ended: r.ended,
      canVote: r.canVote,
      ratingUp: r.up,
      ratingDown: r.down,
      myVote: r.myVote,
    };
  }

  if (els.detailsModal.open && ui.detailsEventId === eventId) renderRating(eventId);
}

async function vote(voteKind) {
  if (!ui.activeGroupCode) return;
  const eventId = ui.detailsEventId;
  if (!eventId) return;
  try {
    const r = await setRating(ui.activeGroupCode, eventId, voteKind);
    ui.rating.set(eventId, r);
    const idx = ui.events.findIndex((e) => e.id === eventId);
    if (idx !== -1) {
      ui.events[idx] = {
        ...ui.events[idx],
        ended: r.ended,
        canVote: r.canVote,
        ratingUp: r.up,
        ratingDown: r.down,
        myVote: r.myVote,
      };
    }
    renderRating(eventId);
    renderSelectedDayPanel();
    renderMonth();
  } catch (e) {
    alert(e.message || String(e));
  }
}

function exportEventIcs(eventId) {
  const ev = ui.events.find((e) => e.id === eventId);
  if (!ev) return;
  const ics = buildIcsForEvent(ev, getGroupName());
  downloadText(icsFilename(ev), ics, "text/calendar;charset=utf-8");
}

async function refreshEvents() {
  if (!ui.activeGroupCode) {
    ui.events = [];
    renderMonth();
    renderSelectedDayPanel();
    return;
  }
  ui.events = await listEvents(ui.activeGroupCode);
  renderMonth();
  renderSelectedDayPanel();
  renderGroupChat(); // refresh pinned rendering with latest event data
}

function renderGroupChat() {
  els.groupPins.textContent = "";
  els.groupChatList.textContent = "";

  if (!ui.activeGroupCode) {
    const el = document.createElement("div");
    el.className = "muted";
    el.textContent = "Rejoins un groupe pour discuter.";
    els.groupChatList.appendChild(el);
    return;
  }

  // If panel is collapsed, avoid DOM work.
  if (els.groupChatBody.classList.contains("hidden")) return;

  // Pins
  const pins = ui.groupChat.pins || [];
  for (const eventId of pins) {
    const ev = ui.events.find((e) => e.id === eventId);
    if (!ev) continue;
    const item = document.createElement("div");
    item.className = "pin-item";
    item.addEventListener("click", () => openDetailsModal(ev.id));

    const t = document.createElement("div");
    t.className = "pin-title";
    t.appendChild(makeEventIconEl(ev.title || ""));
    t.appendChild(document.createTextNode(ev.title || "Evenement"));

    const m = document.createElement("div");
    m.className = "pin-meta";
    m.textContent = humanRange(ev);

    item.appendChild(t);
    item.appendChild(m);
    els.groupPins.appendChild(item);
  }

  // Messages
  const messages = ui.groupChat.messages || [];
  if (messages.length === 0) {
    const el = document.createElement("div");
    el.className = "muted";
    el.textContent = "Pas encore de messages.";
    els.groupChatList.appendChild(el);
    return;
  }

  for (const msg of messages) {
    const box = document.createElement("div");
    box.className = "gmsg";
    if (msg.kind === "event" || msg.author === "Systeme") box.classList.add("system");

    const head = document.createElement("div");
    head.className = "gmsg-head";

    const author = document.createElement("div");
    author.className = "gmsg-author";
    author.textContent = msg.author || "Anonyme";

    const time = document.createElement("div");
    time.className = "gmsg-time";
    const d = new Date(msg.createdAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    time.textContent = `${toYmd(d)} ${hh}:${mm}`;

    head.appendChild(author);
    head.appendChild(time);

    const text = document.createElement("div");
    text.className = "gmsg-text";
    text.textContent = msg.text || "";

    box.appendChild(head);
    box.appendChild(text);

    if (msg.eventId) {
      const ev = ui.events.find((e) => e.id === msg.eventId);
      if (ev) {
        const evBox = document.createElement("div");
        evBox.className = "gmsg-event";
        evBox.addEventListener("click", () => openDetailsModal(ev.id));
        evBox.appendChild(makeEventIconEl(ev.title || ""));
        evBox.appendChild(document.createTextNode(`${ev.title || "Evenement"} · ${humanRange(ev)}`));
        box.appendChild(evBox);
      }
    }

    const react = document.createElement("div");
    renderReactionRow({
      rootEl: react,
      reactions: msg.reactions || {},
      myReactions: msg.myReactions || {},
      onReact: async (emoji) => {
        try {
          await reactGroupChatMessage(ui.activeGroupCode, msg.id, emoji);
          await refreshGroupChat();
        } catch (e) {
          alert(e.message || String(e));
        }
      },
    });
    box.appendChild(react);

    if (msg.canEdit || msg.canDelete) {
      attachLongPress(box, () => {
        messageActions({
          kind: "group",
          id: msg.id,
          text: msg.text,
          canEdit: Boolean(msg.canEdit),
          canDelete: Boolean(msg.canDelete),
          eventId: "",
        }).catch((e) => alert(e.message || String(e)));
      });
    }

    els.groupChatList.appendChild(box);
  }

  els.groupChatList.scrollTop = els.groupChatList.scrollHeight;
}

async function refreshGroupChat() {
  if (!ui.activeGroupCode) {
    ui.groupChat = { pins: [], messages: [] };
    renderGroupChat();
    return;
  }
  const chat = await getGroupChat(ui.activeGroupCode);
  ui.groupChat = chat;
  renderGroupChat();
}

async function sendGroupChatMessage() {
  if (ui.apiOk === false) {
    alert("API introuvable. Lance l'app via `npm run dev` puis recharge la page.");
    return;
  }
  if (!ui.activeGroupCode) {
    alert("Rejoins un groupe d'abord.");
    return;
  }
  const author = authorOrAskOnce();
  if (!author) return;
  const text = els.groupChatText.value.trim();
  if (!text) return;

  els.btnGroupChatSend.disabled = true;
  try {
    await postGroupChat(ui.activeGroupCode, { author, text });
    els.groupChatText.value = "";
    await refreshGroupChat();
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    els.btnGroupChatSend.disabled = false;
  }
}

async function activateGroup(codeLike) {
  const code = String(codeLike || "").trim().toUpperCase();
  if (!code) throw new Error("Code invalide.");
  const group = await fetchGroup(code);
  ui.activeGroupCode = group.code;
  ui.activeGroupName = group.name;
  rememberGroup(group.code, group.name);
  setGroupCodeInUrl(group.code);
  clearNotified(state);
  ui.comments.clear();
  ui.rating.clear();
  ui.groupChat = { pins: [], messages: [] };
  renderGroupPicker();
  await refreshEvents();
  await refreshGroupChat();
  await refreshWeatherForCurrentMonth();
}

function leaveActiveGroup() {
  ui.activeGroupCode = "";
  ui.activeGroupName = "";
  ui.events = [];
  ui.comments.clear();
  ui.detailsEventId = null;
  clearGroupCodeInUrl();
  clearNotified(state);
  ui.rating.clear();
  ui.groupChat = { pins: [], messages: [] };
  ui.weatherByDayKey = new Map();
  renderGroupPicker();
  renderMonth();
  renderSelectedDayPanel();
  renderGroupChat();
}

function renderChatLoading() {
  els.chatList.textContent = "";
  const el = document.createElement("div");
  el.className = "muted";
  el.textContent = ui.activeGroupCode ? "Chargement..." : "Rejoins un groupe pour discuter.";
  els.chatList.appendChild(el);
}

function attachLongPress(el, onLongPress) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    const tag = String(e.target?.tagName || "").toLowerCase();
    if (tag === "button" || tag === "input" || tag === "textarea" || tag === "select" || tag === "a") return;
    fired = false;
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = setTimeout(() => {
      fired = true;
      try {
        e.preventDefault();
      } catch {
        // ignore
      }
      onLongPress();
    }, 520);
  });

  el.addEventListener("pointermove", (e) => {
    if (!timer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 10 || dy > 10) clear();
  });
  el.addEventListener("pointerup", () => clear());
  el.addEventListener("pointercancel", () => clear());
  el.addEventListener("pointerleave", () => clear());

  // Desktop fallback: right-click.
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    onLongPress();
  });

  // Avoid firing a click after long-press.
  el.addEventListener("click", (e) => {
    if (!fired) return;
    e.preventDefault();
    e.stopPropagation();
  });
}

async function messageActions({ kind, id, text, canEdit, canDelete, eventId }) {
  const opts = [];
  if (canEdit) opts.push("1 Modifier");
  if (canDelete) opts.push("2 Supprimer");
  if (opts.length === 0) return;

  const choice = prompt(`Action:\n${opts.join("\n")}`, canEdit ? "1" : "2");
  if (choice == null) return;

  if (String(choice).trim() === "1" && canEdit) {
    const next = prompt("Modifier le message:", String(text || ""));
    if (next == null) return;
    const clean = String(next || "").trim();
    if (!clean) return;
    if (kind === "event") {
      await updateEventComment(ui.activeGroupCode, eventId, id, clean);
      await refreshCommentsForEvent(eventId);
    } else if (kind === "group") {
      await updateGroupChatMessage(ui.activeGroupCode, id, clean);
      await refreshGroupChat();
    }
    return;
  }

  if (String(choice).trim() === "2" && canDelete) {
    const ok = confirm("Supprimer ce message ?");
    if (!ok) return;
    if (kind === "event") {
      await deleteEventComment(ui.activeGroupCode, eventId, id);
      await refreshCommentsForEvent(eventId);
    } else if (kind === "group") {
      await deleteGroupChatMessage(ui.activeGroupCode, id);
      await refreshGroupChat();
    }
  }
}

function renderChat(comments) {
  els.chatList.textContent = "";
  if (!ui.activeGroupCode) return renderChatLoading();

  if (!comments || comments.length === 0) {
    const el = document.createElement("div");
    el.className = "muted";
    el.textContent = "Pas encore de messages.";
    els.chatList.appendChild(el);
    return;
  }

  const ev = ui.events.find((e) => e.id === ui.detailsEventId) || null;
  const creatorName = String(ev?.createdByName || "").trim();

  for (const c of comments) {
    const msg = document.createElement("div");
    msg.className = `msg c${colorIndex(c.author || "")}`;

    const head = document.createElement("div");
    head.className = "msg-head";

    const author = document.createElement("div");
    author.className = "msg-author";
    author.textContent = c.author || "Anonyme";
    if (creatorName && String(c.author || "").trim() === creatorName) {
      const badge = document.createElement("span");
      badge.className = "creator-badge";
      badge.title = "Createur de l'evenement";
      badge.textContent = "👑";
      author.appendChild(badge);
    }

    const time = document.createElement("div");
    time.className = "msg-time";
    const d = new Date(c.createdAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    time.textContent = `${toYmd(d)} ${hh}:${mm}`;

    const text = document.createElement("div");
    text.className = "msg-text";
    text.textContent = c.text || "";

    head.appendChild(author);
    head.appendChild(time);
    msg.appendChild(head);
    msg.appendChild(text);

    const react = document.createElement("div");
    renderReactionRow({
      rootEl: react,
      reactions: c.reactions || {},
      myReactions: c.myReactions || {},
      onReact: async (emoji) => {
        try {
          await reactEventComment(ui.activeGroupCode, ui.detailsEventId, c.id, emoji);
          await refreshCommentsForEvent(ui.detailsEventId);
        } catch (e) {
          alert(e.message || String(e));
        }
      },
    });
    msg.appendChild(react);
    if (c.canEdit || c.canDelete) {
      attachLongPress(msg, () => {
        messageActions({
          kind: "event",
          id: c.id,
          text: c.text,
          canEdit: Boolean(c.canEdit),
          canDelete: Boolean(c.canDelete),
          eventId: ui.detailsEventId,
        }).catch((e) => alert(e.message || String(e)));
      });
    }
    els.chatList.appendChild(msg);
  }

  // Scroll to bottom
  els.chatList.scrollTop = els.chatList.scrollHeight;
}

async function refreshCommentsForEvent(eventId) {
  if (!ui.activeGroupCode) return;
  const list = await listComments(ui.activeGroupCode, eventId);
  ui.comments.set(eventId, list);
  if (ui.detailsEventId === eventId && els.detailsModal.open) renderChat(list);
}

async function sendChatMessage() {
  if (ui.apiOk === false) {
    alert("API introuvable. Lance l'app via `npm run dev` puis recharge la page.");
    return;
  }
  if (!ui.activeGroupCode) {
    alert("Rejoins un groupe d'abord.");
    return;
  }
  const eventId = ui.detailsEventId;
  if (!eventId) return;

  const author = authorOrAskOnce();
  const text = els.chatText.value.trim();
  if (!author) return;
  if (!text) return;

  els.btnChatSend.disabled = true;
  try {
    await addComment(ui.activeGroupCode, eventId, { author, text });
    els.chatText.value = "";
    await refreshCommentsForEvent(eventId);
  } catch (e) {
    alert(e.message || String(e));
  } finally {
    els.btnChatSend.disabled = false;
  }
}

function wireEvents() {
  els.btnViewCalendar.addEventListener("click", () => setActiveView("calendar"));
  els.btnViewHub.addEventListener("click", () => setActiveView("hub"));

  els.btnHubRefresh.addEventListener("click", async () => {
    try {
      if (ui.apiOk === false) throw new Error("API introuvable. Lance `npm run dev` puis recharge.");
      const known = loadKnownGroups();
      if (known.length === 0) return;
      els.btnHubRefresh.disabled = true;
      await Promise.all(
        known.map(async (g) => {
          try {
            const fresh = await fetchGroup(g.code);
            rememberGroup(fresh.code, fresh.name);
          } catch {
            // ignore per-group failures
          }
        }),
      );
      renderGroupPicker();
      renderHub().catch(() => {});
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      els.btnHubRefresh.disabled = false;
    }
  });

  els.btnCreateGroup.addEventListener("click", async () => {
    try {
      if (ui.apiOk === false) throw new Error("API introuvable. Lance `npm run dev` puis recharge.");
      const name = els.groupName.value.trim();
      if (!name) throw new Error("Nom de groupe obligatoire.");
      const group = await apiCreateGroup(name);
      els.groupName.value = "";
      await activateGroup(group.code);
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  els.btnJoin.addEventListener("click", async () => {
    try {
      if (ui.apiOk === false) throw new Error("API introuvable. Lance `npm run dev` puis recharge.");
      await activateGroup(els.joinCode.value);
      els.joinCode.value = "";
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  els.groupSelect.addEventListener("change", async () => {
    try {
      await activateGroup(els.groupSelect.value);
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  els.btnLeaveGroup.addEventListener("click", () => {
    if (!ui.activeGroupCode) return;
    const ok = confirm(`Quitter le groupe "${getGroupName()}" ?`);
    if (!ok) return;
    leaveActiveGroup();
  });

  els.btnRemoveGroup.addEventListener("click", () => {
    const code = String(els.groupSelect.value || "").trim().toUpperCase();
    if (!code) return;
    const ok = confirm(`Supprimer ce groupe de ta liste locale (${code}) ?`);
    if (!ok) return;
    forgetGroup(code);
    if (ui.activeGroupCode === code) leaveActiveGroup();
    else renderGroupPicker();
  });

  els.btnSaveCity.addEventListener("click", () => {
    (async () => {
      try {
        if (ui.apiOk === false) throw new Error("API introuvable. Lance `npm run dev` puis recharge.");
        if (!ui.activeGroupCode) return;
        const q = els.weatherCity.value.trim();
        if (!q) {
          setWeatherPref(ui.activeGroupCode, null);
          ui.weatherByDayKey = new Map();
          renderGroupPicker();
          renderMonth();
          return;
        }
        const existing = getWeatherPref(ui.activeGroupCode);
        // If the input already equals the saved label, just refresh the month (no re-geocode).
        if (existing && q === existing.label) {
          await refreshWeatherForCurrentMonth({ silent: false });
          return;
        }

        // Users often re-click OK after we auto-fill "City, Region, Country".
        // Open-Meteo geocoding can fail on the full string, so we geocode the first chunk.
        const query = q.split(",")[0].trim() || q;
        const results = await geocodePlace(query);
        const r = Array.isArray(results) && results.length ? results[0] : null;
        if (!r) throw new Error("Lieu introuvable. Essaie juste la ville (ex: Paris, Lyon).");
        const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
        setWeatherPref(ui.activeGroupCode, { label, lat: r.lat, lon: r.lon });
        els.weatherCity.value = label;
        renderGroupPicker();
        await refreshWeatherForCurrentMonth({ silent: false });
      } catch (e) {
        alert(e.message || String(e));
      }
    })();
  });

  els.btnNewEvent.addEventListener("click", () => openEventModalNew());

  els.btnPrev.addEventListener("click", () => {
    ui.monthDate = new Date(ui.monthDate.getFullYear(), ui.monthDate.getMonth() - 1, 1);
    renderMonth();
    refreshWeatherForCurrentMonth().catch(() => {});
  });
  els.btnNext.addEventListener("click", () => {
    ui.monthDate = new Date(ui.monthDate.getFullYear(), ui.monthDate.getMonth() + 1, 1);
    renderMonth();
    refreshWeatherForCurrentMonth().catch(() => {});
  });
  els.btnToday.addEventListener("click", () => {
    ui.monthDate = new Date();
    ui.selectedDay = new Date();
    renderMonth();
    renderSelectedDayPanel();
    refreshWeatherForCurrentMonth().catch(() => {});
  });

  els.modalBackdrop.addEventListener("click", () => {
    if (els.eventModal.open) closeModal(els.eventModal);
    if (els.detailsModal.open) closeModal(els.detailsModal);
  });
  els.eventModal.addEventListener("close", () => els.modalBackdrop.classList.add("hidden"));
  els.detailsModal.addEventListener("close", () => els.modalBackdrop.classList.add("hidden"));

  els.btnCancelEvent.addEventListener("click", () => {
    closeModal(els.eventModal);
  });

  els.evDate.addEventListener("change", () => {
    updateEventWeatherHint();
    const ymd = String(els.evDate.value || "").trim();
    if (!ymd) return;
    ensureWeatherForDay(ymd)
      .then(() => updateEventWeatherHint())
      .catch(() => {
        // Don't block event creation.
        updateEventWeatherHint();
      });
  });

  els.eventForm.addEventListener("submit", (e) => {
    e.preventDefault();
    (async () => {
      try {
        if (ui.apiOk === false) throw new Error("API introuvable. Lance `npm run dev` puis recharge.");
        const id = els.evId.value.trim();
        const payload = readEventPayloadFromForm();
        // Store creator pseudo once so we can show the creator badge in chat.
        if (!id) {
          const a = authorOrAskOnce();
          if (a) payload.createdByName = a;
        }

        let saved;
        if (id) saved = await apiUpdateEvent(ui.activeGroupCode, id, payload);
        else saved = await apiCreateEvent(ui.activeGroupCode, payload);

        ui.selectedDay = new Date(saved.start);
        ui.monthDate = new Date(ui.selectedDay.getFullYear(), ui.selectedDay.getMonth(), 1);
        saveState(state);
        closeModal(els.eventModal);
        await refreshEvents();
        await refreshGroupChat();
      } catch (err) {
        alert(err.message || String(err));
      }
    })();
  });

  els.btnDeleteEvent.addEventListener("click", () => {
    (async () => {
      const id = els.evId.value.trim();
      if (!id) return;
      const ev = ui.events.find((x) => x.id === id);
      if (!ev) return;
      if (ev.canEdit === false) {
        alert("Seul le createur peut supprimer cet evenement.");
        return;
      }
      const ok = confirm(`Supprimer l'evenement "${ev.title}" ?`);
      if (!ok) return;
      try {
        await deleteEventApi(ui.activeGroupCode, id);
        closeModal(els.eventModal);
        await refreshEvents();
        await refreshGroupChat();
      } catch (e) {
        alert(e.message || String(e));
      }
    })();
  });

  els.btnExportIcs.addEventListener("click", () => {
    const id = els.evId.value.trim();
    if (!id) return;
    exportEventIcs(id);
  });

  els.btnEditFromDetails.addEventListener("click", () => {
    const id = ui.detailsEventId;
    if (!id) return;
    closeModal(els.detailsModal);
    openEventModalEdit(id);
  });

  els.btnExportIcsFromDetails.addEventListener("click", () => {
    const id = ui.detailsEventId;
    if (!id) return;
    exportEventIcs(id);
  });

  els.btnThumbUp.addEventListener("click", () => vote("up"));
  els.btnThumbDown.addEventListener("click", () => vote("down"));
  els.btnClearVote.addEventListener("click", () => vote("clear"));

  els.btnNotifications.addEventListener("click", async () => {
    if (!canNotify()) {
      alert("Notifications non supportees par ce navigateur.");
      return;
    }
    // Clicking the icon acknowledges any previous reminder.
    els.notifDot.classList.add("hidden");
    const res = await ensurePermission();
    if (!res.ok) {
      alert("Permission notifications non accordee.");
      return;
    }
    // Keep button usable; just change title.
    els.btnNotifications.title = "Notifications actives";
  });

  els.btnChatSend.addEventListener("click", () => {
    sendChatMessage();
  });
  els.chatText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });

  els.btnChangePseudo.addEventListener("click", () => {
    const v = promptForAuthor();
    if (!v) return;
    // Update button label to reflect the chosen author.
    els.btnChangePseudo.textContent = `Pseudo: ${v}`;
  });

  els.btnNewPoll.addEventListener("click", async () => {
    try {
      const eventId = ui.detailsEventId;
      if (!eventId) return;
      if (!ui.activeGroupCode) throw new Error("Aucun groupe actif.");

      const existing = ui.poll.get(eventId)?.poll || null;
      if (existing) {
        const ok = confirm("Remplacer le sondage actuel ?");
        if (!ok) return;
      }
      openPollEditor({ question: existing?.question || "", options: existing?.options?.map((o) => o?.text) || [] });
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  els.btnClearPoll.addEventListener("click", async () => {
    try {
      const eventId = ui.detailsEventId;
      if (!eventId) return;
      if (!ui.activeGroupCode) throw new Error("Aucun groupe actif.");
      const ok = confirm("Supprimer le sondage de cet evenement ?");
      if (!ok) return;
      els.btnClearPoll.disabled = true;
      const st = await setEventPoll(ui.activeGroupCode, eventId, { action: "clear" });
      ui.poll.set(eventId, st);
      renderPollForEvent(eventId);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      els.btnClearPoll.disabled = false;
    }
  });

  els.btnCancelPoll.addEventListener("click", () => {
    closePollEditor();
    const eventId = ui.detailsEventId;
    if (eventId) renderPollForEvent(eventId);
  });

  els.btnCreatePoll.addEventListener("click", async () => {
    try {
      const eventId = ui.detailsEventId;
      if (!eventId) return;
      if (!ui.activeGroupCode) throw new Error("Aucun groupe actif.");

      const question = String(els.pollQInput.value || "").trim();
      const options = String(els.pollOptsInput.value || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);

      if (!question) throw new Error("Question obligatoire.");
      if (options.length < 2) throw new Error("Il faut au moins 2 choix.");

      els.btnCreatePoll.disabled = true;
      const st = await setEventPoll(ui.activeGroupCode, eventId, { question, options });
      ui.poll.set(eventId, st);
      closePollEditor();
      renderPollForEvent(eventId);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      els.btnCreatePoll.disabled = false;
    }
  });

  renderQuickButtons(els.eventQuick, async (text) => {
    els.chatText.value = text;
    await sendChatMessage();
  });

  renderQuickButtons(els.groupQuick, async (text) => {
    els.groupChatText.value = text;
    await sendGroupChatMessage();
  });

  els.btnGroupChatSend.addEventListener("click", () => {
    sendGroupChatMessage();
  });
  els.groupChatText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendGroupChatMessage();
    }
  });

  els.btnToggleGroupChat.addEventListener("click", () => {
    const open = els.groupChatBody.classList.contains("hidden");
    els.groupChatBody.classList.toggle("hidden", !open);
    els.btnToggleGroupChat.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) refreshGroupChat().catch(() => {});
    else renderGroupChat();
  });

  // Duration inputs: keep minutes within 0..59.
  els.evDurM.addEventListener("change", () => {
    const m = Number(els.evDurM.value || 0);
    if (!Number.isFinite(m)) return;
    const clamped = Math.max(0, Math.min(59, Math.round(m)));
    els.evDurM.value = String(clamped);
  });
}

async function init() {
  els.buildStamp.textContent = `Build ${BUILD}`;
  renderGroupPicker();
  const a = loadAuthor();
  els.btnChangePseudo.textContent = a ? `Pseudo: ${a}` : "Pseudo";
  wireEvents();
  renderMonth();
  renderSelectedDayPanel();
  setActiveView(localStorage.getItem(VIEW_KEY) || "calendar");

  if (!canNotify()) {
    els.btnNotifications.title = "Notifications indisponibles";
    els.btnNotifications.disabled = true;
  } else if (Notification.permission === "granted") {
    els.btnNotifications.title = "Notifications actives";
  }

  startNotificationLoop({
    state,
    getActiveGroupId,
    getGroupName,
    getEvents,
  });

  window.addEventListener("kifekoi:notification", () => {
    els.notifDot.classList.remove("hidden");
  });

  try {
    const r = await fetch("/api/health");
    const j = await r.json().catch(() => null);
    ui.apiOk = Boolean(r.ok && j && j.ok === true);
  } catch {
    ui.apiOk = false;
  }
  renderGroupPicker();

  const code = groupCodeFromUrl();
  if (code) {
    try {
      await activateGroup(code);
    } catch {
      // Ignore invalid codes.
    }
  }
}

init();
