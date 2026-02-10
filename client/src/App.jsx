import React from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./lib/api.js";
import { WEEKDAYS, addMinutes, formatHm, formatHumanDate, getMonthGrid, monthLabel, parseLocalDateTime, sameYmd, startOfDay, toYmd } from "./lib/date.js";
import { EventIcon } from "./lib/icons.jsx";
import { WeatherIcon } from "./lib/weather.jsx";

function Shell({ user, onLogout, children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="dot" aria-hidden="true" />
            Kifekoi
          </div>
          <div className="row">
            {user ? <span className="badge">{user.displayName}</span> : null}
            {user ? (
              <button className="btn" onClick={onLogout} type="button">
                Deconnexion
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </div>
  );
}

function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
  });
}

function RequireAuth({ children }) {
  const meQ = useMe();
  const loc = useLocation();
  if (meQ.isLoading) return <div className="muted">Chargement...</div>;
  if (meQ.isError) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

function LoginPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/home";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");

  const mut = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: async () => {
      setErr("");
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav(next, { replace: true });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  return (
    <div className="panel">
      <div className="title">Connexion</div>
      {err ? <div className="err">{err}</div> : null}
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="input"
          placeholder="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" type="button" onClick={() => mut.mutate()} disabled={mut.isPending}>
          Se connecter
        </button>
        <Link className="btn" to={`/signup?next=${encodeURIComponent(next)}`}>
          Creer un compte
        </Link>
        <Link className="btn" to="/reset-password">
          Mot de passe oublie
        </Link>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        Dev: le backend doit tourner sur <code>http://127.0.0.1:5173</code> (proxy Vite).
      </div>
    </div>
  );
}

function SignupPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/home";

  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");

  const mut = useMutation({
    mutationFn: () => api.signup({ email, password, displayName }),
    onSuccess: async () => {
      setErr("");
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav(next, { replace: true });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  return (
    <div className="panel">
      <div className="title">Inscription</div>
      {err ? <div className="err">{err}</div> : null}
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="Pseudo" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input
          className="input"
          placeholder="Mot de passe (min 8)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" type="button" onClick={() => mut.mutate()} disabled={mut.isPending}>
          Creer le compte
        </button>
        <Link className="btn" to={`/login?next=${encodeURIComponent(next)}`}>
          J'ai deja un compte
        </Link>
      </div>
    </div>
  );
}

function ResetPasswordRequestPage() {
  const [email, setEmail] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

  const mut = useMutation({
    mutationFn: () => api.requestPasswordReset(email),
    onSuccess: () => {
      setErr("");
      setMsg("OK. Si l'email existe, un lien a ete envoye (en dev: lien affiche dans la console du serveur).");
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  return (
    <div className="panel">
      <div className="title">Mot de passe oublie</div>
      {err ? <div className="err">{err}</div> : null}
      {msg ? <div className="card">{msg}</div> : null}
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-warn" type="button" onClick={() => mut.mutate()} disabled={mut.isPending}>
          Envoyer le lien
        </button>
        <Link className="btn" to="/login">
          Retour login
        </Link>
      </div>
    </div>
  );
}

function ResetPasswordConfirmPage({ token }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [newPassword, setNewPassword] = React.useState("");
  const [err, setErr] = React.useState("");

  const mut = useMutation({
    mutationFn: () => api.confirmPasswordReset({ token, newPassword }),
    onSuccess: async () => {
      setErr("");
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/home", { replace: true });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  return (
    <div className="panel">
      <div className="title">Nouveau mot de passe</div>
      {err ? <div className="err">{err}</div> : null}
      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="input"
          placeholder="Nouveau mot de passe (min 8)"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" type="button" onClick={() => mut.mutate()} disabled={mut.isPending}>
          Enregistrer
        </button>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        Token: <code>{token.slice(0, 10)}...</code>
      </div>
    </div>
  );
}

function AppHome() {
  const groupsQ = useQuery({ queryKey: ["groups"], queryFn: api.listMyGroups });
  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: api.listFriends });
  const frQ = useQuery({ queryKey: ["friendRequests"], queryFn: api.listFriendRequests });

  const [newGroup, setNewGroup] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");
  const [friendEmail, setFriendEmail] = React.useState("");
  const [err, setErr] = React.useState("");

  const qc = useQueryClient();
  const createGroupMut = useMutation({
    mutationFn: () => api.createGroup(newGroup),
    onSuccess: async () => {
      setNewGroup("");
      await qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });
  const joinMut = useMutation({
    mutationFn: () => api.joinGroup(joinCode),
    onSuccess: async () => {
      setJoinCode("");
      await qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  const sendFriendMut = useMutation({
    mutationFn: () => api.sendFriendRequest(friendEmail),
    onSuccess: async () => {
      setFriendEmail("");
      await qc.invalidateQueries({ queryKey: ["friendRequests"] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  return (
    <div className="grid2">
      <div className="panel">
        <div className="title">Groupes</div>
        {err ? <div className="err">{err}</div> : null}
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" placeholder="Nom du groupe" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
          <button className="btn btn-primary" type="button" onClick={() => createGroupMut.mutate()} disabled={createGroupMut.isPending}>
            Creer
          </button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" placeholder="Code (ex: A1B2C3D4)" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
          <button className="btn" type="button" onClick={() => joinMut.mutate()} disabled={joinMut.isPending}>
            Rejoindre
          </button>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {groupsQ.isLoading ? <div className="muted">Chargement...</div> : null}
          {(groupsQ.data || []).map((g) => (
            <div key={g.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{g.name}</div>
                  <div className="muted">
                    code: <code>{g.code}</code> · role: {g.role}
                  </div>
                </div>
                <Link className="btn" to={`/home?g=${encodeURIComponent(g.code)}`}>
                  Ouvrir
                </Link>
              </div>
            </div>
          ))}
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Tip: ouvre un groupe pour acceder au calendrier + discussions + meteo.
        </div>
      </div>

      <div className="panel">
        <div className="title">Amis</div>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" placeholder="Email de ton ami" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} />
          <button className="btn btn-warn" type="button" onClick={() => sendFriendMut.mutate()} disabled={sendFriendMut.isPending}>
            Ajouter
          </button>
        </div>

        <div className="title" style={{ marginTop: 14 }}>
          Demandes
        </div>
        {frQ.isLoading ? <div className="muted">Chargement...</div> : null}
        <div className="list">
          {(frQ.data?.incoming || []).map((r) => (
            <div key={r.id} className="card">
              <div style={{ fontWeight: 900 }}>{r.from.displayName}</div>
              <div className="muted">{r.from.email}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <FriendReqActions request={r} />
              </div>
            </div>
          ))}
          {(frQ.data?.outgoing || []).map((r) => (
            <div key={r.id} className="card">
              <div style={{ fontWeight: 900 }}>Sortante: {r.to.displayName}</div>
              <div className="muted">{r.to.email}</div>
              <div className="muted">En attente</div>
            </div>
          ))}
        </div>

        <div className="title" style={{ marginTop: 14 }}>
          Liste
        </div>
        {friendsQ.isLoading ? <div className="muted">Chargement...</div> : null}
        <div className="list">
          {(friendsQ.data || []).map((f) => (
            <div key={f.id} className="card">
              <div style={{ fontWeight: 900 }}>{f.displayName}</div>
              <div className="muted">{f.email}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const WEATHER_KEY = "kifekoi:weatherCityByGroup:v1"; // { [groupCode]: { label, lat, lon } }

function loadWeatherPrefs() {
  try {
    const raw = localStorage.getItem(WEATHER_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj;
  } catch {
    return {};
  }
}

function saveWeatherPrefs(obj) {
  localStorage.setItem(WEATHER_KEY, JSON.stringify(obj || {}));
}

function getWeatherPref(groupCode) {
  const prefs = loadWeatherPrefs();
  return prefs[groupCode] || null;
}

function setWeatherPref(groupCode, prefOrNull) {
  const prefs = loadWeatherPrefs();
  if (!groupCode) return;
  if (!prefOrNull) delete prefs[groupCode];
  else prefs[groupCode] = prefOrNull;
  saveWeatherPrefs(prefs);
}

function OnboardingTips({ user }) {
  const key = `kifekoi:onboarding:v1:${user?.id || "anon"}`;
  const [open, setOpen] = React.useState(() => localStorage.getItem(key) !== "done");
  if (!user || !open) return null;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="title">Astuces (1 fois)</div>
      <div className="muted">
        1. Cree un groupe ou rejoins un groupe avec un code.
        <br />
        2. Clique une date dans le calendrier, puis ajoute un evenement.
        <br />
        3. Utilise la discussion du groupe pour prevenir tout le monde.
        <br />
        4. (Optionnel) Configure la ville meteo du groupe pour afficher les icones soleil/pluie.
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            localStorage.setItem(key, "done");
            setOpen(false);
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

function LegacyHomePage() {
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const groupsQ = useQuery({ queryKey: ["groups"], queryFn: api.listMyGroups });
  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: api.listFriends });

  const initialFromUrl = (sp.get("g") || "").trim().toUpperCase();
  const [activeCode, setActiveCode] = React.useState(initialFromUrl);
  const [view, setView] = React.useState(() => localStorage.getItem("kifekoi:view:v1") || "calendar");
  const [switchPulse, setSwitchPulse] = React.useState(0);
  const [switchingGroup, setSwitchingGroup] = React.useState(false);
  const [searchQ, setSearchQ] = React.useState("");

  const [newGroup, setNewGroup] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");
  const [err, setErr] = React.useState("");

  const [monthDate, setMonthDate] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState(() => new Date());
  const [activeEventId, setActiveEventId] = React.useState("");
  const [evModalOpen, setEvModalOpen] = React.useState(false);
  const [evEditing, setEvEditing] = React.useState(null); // event or null (new)
  const [evTitle, setEvTitle] = React.useState("");
  const [evDate, setEvDate] = React.useState(() => toYmd(new Date()));
  const [evTime, setEvTime] = React.useState("18:00");
  const [evDurH, setEvDurH] = React.useState("1");
  const [evDurM, setEvDurM] = React.useState("0");
  const [evReminder, setEvReminder] = React.useState("0");
  const [evDesc, setEvDesc] = React.useState("");

  // Weather (stored per group in localStorage, like legacy)
  const [weatherLabel, setWeatherLabel] = React.useState("");
  const [weatherByDayKey, setWeatherByDayKey] = React.useState(() => new Map());
  const [weatherErr, setWeatherErr] = React.useState("");
  const [weatherRefreshKey, setWeatherRefreshKey] = React.useState(0);

  // Chat (group thread)
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatText, setChatText] = React.useState("");
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [chatEditingId, setChatEditingId] = React.useState("");

  const eventsQ = useQuery({
    queryKey: ["events", activeCode],
    queryFn: () => api.listEvents(activeCode),
    enabled: Boolean(activeCode),
  });
  const chatQ = useQuery({
    queryKey: ["groupChat", activeCode],
    queryFn: () => api.getGroupChat(activeCode),
    enabled: Boolean(activeCode),
    refetchInterval: 5000,
  });
  const membersQ = useQuery({
    queryKey: ["members", activeCode],
    queryFn: () => api.listGroupMembers(activeCode),
    enabled: Boolean(activeCode) && view === "hub",
  });

  // Ensure active group exists (fallback to first).
  React.useEffect(() => {
    if (!groupsQ.data) return;
    const codes = (groupsQ.data || []).map((g) => g.code);
    const urlCode = (sp.get("g") || "").trim().toUpperCase();
    const desired = urlCode || activeCode;
    if (desired && codes.includes(desired)) {
      if (desired !== activeCode) setActiveCode(desired);
      return;
    }
    const first = codes[0] || "";
    if (first && first !== activeCode) setActiveCode(first);
    if (!first && activeCode) setActiveCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsQ.data, sp]);

  // Keep URL in sync.
  React.useEffect(() => {
    const urlCode = (sp.get("g") || "").trim().toUpperCase();
    if (activeCode && urlCode !== activeCode) {
      const next = new URLSearchParams(sp);
      next.set("g", activeCode);
      setSp(next, { replace: true });
    }
    if (!activeCode && urlCode) {
      const next = new URLSearchParams(sp);
      next.delete("g");
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCode]);

  React.useEffect(() => {
    localStorage.setItem("kifekoi:view:v1", view);
  }, [view]);

  function selectGroup(nextCodeRaw) {
    const nextCode = String(nextCodeRaw || "").trim().toUpperCase();
    if (nextCode === activeCode) return;

    setErr("");
    setWeatherErr("");
    setChatText("");
    setChatOpen(false);
    setNotifOpen(false);
    setActiveEventId("");
    setSelectedDay(new Date());

    setSwitchingGroup(true);
    setSwitchPulse((x) => x + 1);
    setActiveCode(nextCode);
    setTimeout(() => setSwitchingGroup(false), 260);
  }

  // Sync weather label when group changes.
  React.useEffect(() => {
    if (!activeCode) {
      setWeatherLabel("");
      setWeatherByDayKey(new Map());
      return;
    }
    setWeatherLabel(getWeatherPref(activeCode)?.label || "");
    setWeatherRefreshKey((x) => x + 1);
    qc.invalidateQueries({ queryKey: ["events", activeCode] }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["groupChat", activeCode] }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["members", activeCode] }).catch(() => {});
  }, [activeCode]);

  // Keep month anchored to selectedDay.
  React.useEffect(() => {
    setMonthDate(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1));
  }, [selectedDay]);

  const events = (eventsQ.data || []).slice().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const search = searchQ.trim().toLowerCase();
  function matches(v) {
    if (!search) return true;
    return String(v || "").toLowerCase().includes(search);
  }

  const byDay = React.useMemo(() => {
    const m = new Map();
    for (const ev of events) {
      const key = toYmd(new Date(ev.start));
      const arr = m.get(key) || [];
      arr.push(ev);
      m.set(key, arr);
    }
    return m;
  }, [events]);

  const selectedKey = toYmd(selectedDay);
  const selectedEvents = byDay.get(selectedKey) || [];
  const activeEvent = activeEventId ? events.find((e) => e.id === activeEventId) : null;
  const shownSelectedEvents = search ? selectedEvents.filter((ev) => matches(ev.title) || matches(ev.description)) : selectedEvents;

  const shownChatMessages = search
    ? (chatQ.data?.messages || []).filter((m) => matches(m.text) || matches(m.author))
    : chatQ.data?.messages || [];

  const shownGroupsHub = search ? (groupsQ.data || []).filter((g) => matches(g.name) || matches(g.code)) : groupsQ.data || [];
  const shownFriendsHub = search ? (friendsQ.data || []).filter((f) => matches(f.displayName) || matches(f.email)) : friendsQ.data || [];
  const shownMembersHub = search ? (membersQ.data || []).filter((m) => matches(m.displayName) || matches(m.email) || matches(m.role)) : membersQ.data || [];

  const searchResults = React.useMemo(() => {
    if (!search) return null;
    const res = {
      events: events
        .filter((ev) => matches(ev.title) || matches(ev.description))
        .slice(0, 12),
      messages: (chatQ.data?.messages || [])
        .filter((m) => matches(m.text) || matches(m.author))
        .slice(0, 12),
      pinnedMessages: (chatQ.data?.pinnedMessages || [])
        .filter((m) => matches(m.text) || matches(m.author) || matches(m.pinnedBy))
        .slice(0, 8),
      groups: (groupsQ.data || []).filter((g) => matches(g.name) || matches(g.code)).slice(0, 8),
      friends: (friendsQ.data || []).filter((f) => matches(f.displayName) || matches(f.email)).slice(0, 8),
      members: (membersQ.data || []).filter((m) => matches(m.displayName) || matches(m.email) || matches(m.role)).slice(0, 10),
    };
    const total =
      res.events.length + res.messages.length + res.pinnedMessages.length + res.groups.length + res.friends.length + res.members.length;
    return { ...res, total };
  }, [search, events, chatQ.data, groupsQ.data, friendsQ.data, membersQ.data, matches]);

  // Unread chat dot (client-side)
  const lastSeenKey = activeCode ? `kifekoi:chat:lastSeen:${activeCode}` : "";
  const lastSeen = lastSeenKey ? Number(localStorage.getItem(lastSeenKey) || "0") : 0;
  const latestChatAt = (() => {
    const ms = (chatQ.data?.messages || []).map((m) => new Date(m.createdAt).getTime()).reduce((a, b) => Math.max(a, b), 0);
    return ms || 0;
  })();
  const hasUnread = Boolean(activeCode && latestChatAt && latestChatAt > lastSeen);

  const createGroupMut = useMutation({
    mutationFn: () => api.createGroup(newGroup),
    onSuccess: async (g) => {
      setErr("");
      setNewGroup("");
      await qc.invalidateQueries({ queryKey: ["groups"] });
      if (g?.code) selectGroup(String(g.code).toUpperCase());
    },
    onError: (e) => setErr(String(e?.message || e)),
  });
  const joinMut = useMutation({
    mutationFn: () => api.joinGroup(joinCode),
    onSuccess: async (g) => {
      setErr("");
      setJoinCode("");
      await qc.invalidateQueries({ queryKey: ["groups"] });
      if (g?.code) selectGroup(String(g.code).toUpperCase());
    },
    onError: (e) => setErr(String(e?.message || e)),
  });
  const leaveMut = useMutation({
    mutationFn: () => api.leaveGroup(activeCode),
    onSuccess: async () => {
      setErr("");
      setChatOpen(false);
      setActiveEventId("");
      await qc.invalidateQueries({ queryKey: ["groups"] });
      setActiveCode("");
    },
    onError: (e) => setErr(String(e?.message || e)),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteGroup(activeCode),
    onSuccess: async () => {
      setErr("");
      setChatOpen(false);
      setActiveEventId("");
      await qc.invalidateQueries({ queryKey: ["groups"] });
      setActiveCode("");
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  const postChatMut = useMutation({
    mutationFn: async () => {
      const clean = chatText.trim();
      if (!clean) throw new Error("Message vide.");
      if (!activeCode) throw new Error("Aucun groupe actif.");
      if (chatEditingId) return api.updateGroupChatMessage(activeCode, chatEditingId, clean);
      return api.postGroupChat(activeCode, clean);
    },
    onSuccess: async () => {
      setErr("");
      setChatText("");
      setChatEditingId("");
      await qc.invalidateQueries({ queryKey: ["groupChat", activeCode] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  const createEventMut = useMutation({
    mutationFn: async () => {
      const title = evTitle.trim();
      if (!activeCode) throw new Error("Aucun groupe actif.");
      if (!title) throw new Error("Titre obligatoire.");
      const dH = Number(evDurH || 0);
      const dM = Number(evDurM || 0);
      if (!Number.isFinite(dH) || dH < 0 || dH > 72) throw new Error("Duree (heures) invalide.");
      if (!Number.isFinite(dM) || dM < 0 || dM > 59) throw new Error("Duree (minutes) invalide.");
      const duration = dH * 60 + dM;
      if (duration < 5) throw new Error("Duree invalide.");
      const start = parseLocalDateTime(evDate, evTime);
      const end = addMinutes(start, duration);
      return api.createEvent(activeCode, {
        title,
        description: evDesc.trim(),
        reminderMinutes: Number(evReminder || 0),
        start: start.toISOString(),
        end: end.toISOString(),
      });
    },
    onSuccess: async () => {
      setErr("");
      setEvModalOpen(false);
      await qc.invalidateQueries({ queryKey: ["events", activeCode] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  const updateEventMut = useMutation({
    mutationFn: async () => {
      if (!activeCode) throw new Error("Aucun groupe actif.");
      if (!evEditing?.id) throw new Error("Evenement invalide.");
      if (evEditing.canEdit === false) throw new Error("Seul le createur peut modifier.");
      const title = evTitle.trim();
      if (!title) throw new Error("Titre obligatoire.");
      const dH = Number(evDurH || 0);
      const dM = Number(evDurM || 0);
      const duration = dH * 60 + dM;
      if (!Number.isFinite(duration) || duration < 5) throw new Error("Duree invalide.");
      const start = parseLocalDateTime(evDate, evTime);
      const end = addMinutes(start, duration);
      return api.updateEvent(activeCode, evEditing.id, {
        title,
        description: evDesc.trim(),
        reminderMinutes: Number(evReminder || 0),
        start: start.toISOString(),
        end: end.toISOString(),
      });
    },
    onSuccess: async () => {
      setErr("");
      setEvModalOpen(false);
      await qc.invalidateQueries({ queryKey: ["events", activeCode] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  const deleteEventMut = useMutation({
    mutationFn: async () => {
      if (!activeCode) throw new Error("Aucun groupe actif.");
      if (!evEditing?.id) throw new Error("Evenement invalide.");
      if (evEditing.canEdit === false) throw new Error("Seul le createur peut supprimer.");
      await api.deleteEvent(activeCode, evEditing.id);
    },
    onSuccess: async () => {
      setErr("");
      setEvModalOpen(false);
      await qc.invalidateQueries({ queryKey: ["events", activeCode] });
    },
    onError: (e) => setErr(String(e?.message || e)),
  });

  async function saveCity() {
    const code = activeCode;
    if (!code) return;
    const q = String(weatherLabel || "").trim();
    if (!q) {
      setWeatherPref(code, null);
      setWeatherByDayKey(new Map());
      setWeatherErr("");
      setWeatherRefreshKey((x) => x + 1);
      return;
    }
    const query = q.split(",")[0].trim() || q;
    const rs = await api.geocodePlace(query);
    if (!rs.length) throw new Error("Lieu introuvable.");
    const r = rs[0];
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    setWeatherPref(code, { label, lat: r.lat, lon: r.lon });
    setWeatherLabel(label);
    setWeatherRefreshKey((x) => x + 1);
  }

  // Refresh weather for current calendar range (best-effort).
  React.useEffect(() => {
    let alive = true;
    async function run() {
      setWeatherErr("");
      if (!activeCode) return;
      const pref = getWeatherPref(activeCode);
      if (!pref) {
        if (alive) setWeatherByDayKey(new Map());
        return;
      }
      const gridStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 - 7);
      const gridEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 10);
      const startYmd = toYmd(gridStart);
      const endYmd = toYmd(gridEnd);
      try {
        const load = async (s, e) => {
          const icons = await api.weatherRange({ lat: pref.lat, lon: pref.lon, startYmd: s, endYmd: e });
          const m = new Map();
          for (const [k, v] of Object.entries(icons || {})) m.set(k, v);
          return m;
        };

        const m = await load(startYmd, endYmd);
        if (alive) setWeatherByDayKey(m);
      } catch (e) {
        if (alive) {
          const msg = String(e?.message || e);
          // Open-Meteo can reject ranges outside its free window. Clamp and retry once.
          const m = msg.match(/out of allowed range from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/);
          if (m) {
            const minAllowed = m[1];
            const maxAllowed = m[2];
            const clampMax = (a, b) => (String(a) > String(b) ? a : b); // max lexicographically for YYYY-MM-DD
            const clampMin = (a, b) => (String(a) < String(b) ? a : b); // min
            const s2 = clampMax(startYmd, minAllowed);
            const e2 = clampMin(endYmd, maxAllowed);
            if (String(e2) >= String(s2)) {
              try {
                const icons2 = await api.weatherRange({ lat: pref.lat, lon: pref.lon, startYmd: s2, endYmd: e2 });
                const mm = new Map();
                for (const [k, v] of Object.entries(icons2 || {})) mm.set(k, v);
                setWeatherByDayKey(mm);
                // Silent clamp: don't show an alert/banner to the user.
                setWeatherErr("");
                return;
              } catch (e2err) {
                // fall through
              }
            }
          }

          setWeatherByDayKey(new Map());
          setWeatherErr(msg);
        }
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [activeCode, monthDate, weatherRefreshKey]);

  const today = new Date();
  const todayStart = startOfDay(today);
  const gridDays = getMonthGrid(monthDate);

  function openNewEvent() {
    const base = selectedDay ? new Date(selectedDay) : new Date();
    setEvEditing(null);
    setEvTitle("");
    setEvDesc("");
    setEvReminder("0");
    setEvDurH("1");
    setEvDurM("0");
    setEvDate(toYmd(base));
    setEvTime("18:00");
    setEvModalOpen(true);
  }

  function openEditEvent(ev) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const durMin = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60_000) || 60);
    setEvEditing(ev);
    setEvTitle(ev.title || "");
    setEvDesc(ev.description || "");
    setEvReminder(String(ev.reminderMinutes || 0));
    setEvDurH(String(Math.floor(durMin / 60)));
    setEvDurM(String(durMin % 60));
    setEvDate(toYmd(start));
    setEvTime(formatHm(start));
    setEvModalOpen(true);
  }

  // Ensure weather for selected date in the event modal (best effort)
  React.useEffect(() => {
    if (!evModalOpen) return;
    if (!activeCode) return;
    const pref = getWeatherPref(activeCode);
    if (!pref) return;
    const ymd = String(evDate || "").trim();
    if (!ymd) return;
    if (weatherByDayKey.get(ymd)) return;
    api
      .weatherDay({ lat: pref.lat, lon: pref.lon, dateYmd: ymd })
      .then((w) => {
        if (w?.icon === "sun" || w?.icon === "rain") {
          setWeatherByDayKey((prev) => {
            const m = new Map(prev);
            m.set(ymd, w.icon);
            return m;
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evModalOpen, evDate, activeCode]);

  return (
    <div>
      <div className="panel homeTop">
        <div className="homeTopInner">
          <div className="homeTabs">
            <button className={`btn viewbtn ${view === "calendar" ? "on" : ""}`} type="button" onClick={() => setView("calendar")}>
              Calendrier
            </button>
            <button className={`btn viewbtn ${view === "hub" ? "on" : ""}`} type="button" onClick={() => setView("hub")}>
              Groupes &amp; amis
            </button>
          </div>
          <div className="homeStatus">
            {activeCode ? (
              <>
                <span key={switchPulse} className={`pulseDot ${switchingGroup ? "on" : ""}`} aria-hidden="true" />
                <span className="muted">
                  Groupe actif: <code>{activeCode}</code>
                </span>
              </>
            ) : (
              <span className="muted">Aucun groupe actif</span>
            )}
          </div>
        </div>
      </div>

      <div className="legacyLayout">
        <aside className="legacySidebar">
          <div className="panel panelSub">
            <div className="title">Groupe (lien d'invitation)</div>
            {err ? <div className="err">{err}</div> : null}
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" placeholder="Code (ex: A1B2C3D4)" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
              <button className="btn" type="button" onClick={() => joinMut.mutate()} disabled={joinMut.isPending}>
                Rejoindre
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" placeholder="Nom du groupe" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
              <button className="btn btn-primary" type="button" onClick={() => createGroupMut.mutate()} disabled={createGroupMut.isPending}>
                Creer
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <select className="select" value={activeCode} onChange={(e) => selectGroup(String(e.target.value || "").toUpperCase())}>
                <option value="">Mes groupes...</option>
                {(groupsQ.data || []).map((g) => (
                  <option key={g.id} value={g.code}>
                    {g.name} ({g.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={() => leaveMut.mutate()} disabled={!activeCode || leaveMut.isPending}>
                Quitter
              </button>
              <button className="btn btn-warn" type="button" onClick={() => deleteMut.mutate()} disabled={!activeCode || deleteMut.isPending}>
                Supprimer
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="Ville meteo (ex: Paris)"
                value={weatherLabel}
                onChange={(e) => setWeatherLabel(e.target.value)}
                disabled={!activeCode}
              />
              <button className="btn btn-primary" type="button" onClick={() => saveCity().catch((e) => setWeatherErr(String(e?.message || e)))} disabled={!activeCode}>
                OK
              </button>
            </div>
            {weatherErr ? <div className="err">{weatherErr}</div> : null}
            {!weatherErr && activeCode && getWeatherPref(activeCode) ? <div className="muted">Meteo: {getWeatherPref(activeCode)?.label}</div> : null}
          </div>

          <div className="panel panelSub">
            <button
              className="title titleBtn"
              type="button"
              onClick={() => {
                const next = !chatOpen;
                setChatOpen(next);
                if (next && lastSeenKey) localStorage.setItem(lastSeenKey, String(Date.now()));
              }}
            >
              Discussions {hasUnread ? <span className="dotInline" title="Nouveaux messages" /> : null}
              <span style={{ marginLeft: "auto", opacity: 0.7 }}>{chatOpen ? "▾" : "▸"}</span>
            </button>
            {chatOpen ? (
              <>
                {!activeCode ? <div className="muted">Choisis un groupe.</div> : null}
                {activeCode ? (
                  <>
                    <div className="gchatList" style={{ marginTop: 10 }}>
                      {chatQ.isLoading ? <div className="muted">Chargement...</div> : null}
                      {shownChatMessages.map((m) => (
                        <div key={m.id} className={`gmsg ${m.kind === "system" ? "system" : ""}`}>
                          <div className="gmsgHead">
                            <div className="gmsgAuthor">{m.author}</div>
                            <div className="gmsgTime">{new Date(m.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="gmsgText">{m.text}</div>
                          {m.canEdit || m.canDelete ? (
                            <div className="gmsgActions">
                              {m.canPin ? (
                                <button
                                  className="btn btnSmall"
                                  type="button"
                                  onClick={() => {
                                    if (!activeCode) return;
                                    api
                                      .pinGroupChatMessage(activeCode, m.id)
                                      .then(() => qc.invalidateQueries({ queryKey: ["groupChat", activeCode] }))
                                      .catch((e) => setErr(String(e?.message || e)));
                                  }}
                                >
                                  {m.pinnedAt ? "Depingler" : "Epingler"}
                                </button>
                              ) : null}
                              {m.canEdit ? (
                                <button
                                  className="btn btnSmall"
                                  type="button"
                                  onClick={() => {
                                    setChatOpen(true);
                                    setChatText(m.text || "");
                                    setChatEditingId(m.id);
                                  }}
                                >
                                  Modifier
                                </button>
                              ) : null}
                              {m.canDelete ? (
                                <button
                                  className="btn btnSmall btnDanger"
                                  type="button"
                                  onClick={() => {
                                    if (!activeCode) return;
                                    api
                                      .deleteGroupChatMessage(activeCode, m.id)
                                      .then(() => qc.invalidateQueries({ queryKey: ["groupChat", activeCode] }))
                                      .catch((e) => setErr(String(e?.message || e)));
                                  }}
                                >
                                  Supprimer
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="reactions">
                            {["👍", "👎", "😂", "❤️", "🔥", "🎉", "😮"].map((e) => (
                              <button
                                key={e}
                                className={`rbtn ${m.myReactions?.[e] ? "on" : ""}`}
                                type="button"
                                onClick={() =>
                                  api
                                    .reactGroupChatMessage(activeCode, m.id, e)
                                    .then(() => qc.invalidateQueries({ queryKey: ["groupChat", activeCode] }))
                                    .catch((err) => setErr(String(err?.message || err)))
                                }
                              >
                                {e} {m.reactions?.[e] ? String(m.reactions[e]) : ""}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="quick" style={{ marginTop: 10 }}>
                      {["Je suis en retard", "J'arrive", "Je ne peux pas", "On se retrouve ou ?"].map((t) => (
                        <button key={t} className="qbtn" type="button" onClick={() => setChatText(t)}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <input className="input" maxLength={500} placeholder="Message pour le groupe..." value={chatText} onChange={(e) => setChatText(e.target.value)} />
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => postChatMut.mutate()}
                        disabled={!chatText.trim() || postChatMut.isPending}
                      >
                        {chatEditingId ? "Enregistrer" : "Envoyer"}
                      </button>
                      {chatEditingId ? (
                        <button className="btn" type="button" onClick={() => { setChatEditingId(""); setChatText(""); }}>
                          Annuler
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div className="muted">Clique pour ouvrir.</div>
            )}
          </div>

          <div className="panel panelSub">
            <div className="title">Jour selectionne</div>
            <div className="muted" id="selectedDayLabel">
              {formatHumanDate(selectedDay)} <WeatherIcon icon={weatherByDayKey.get(toYmd(selectedDay))} />
            </div>
            <div className="dayList" style={{ marginTop: 10 }}>
              {!activeCode ? <div className="muted">Rejoins un groupe pour voir les evenements.</div> : null}
              {activeCode && eventsQ.isLoading ? <div className="muted">Chargement...</div> : null}
              {activeCode && !eventsQ.isLoading && shownSelectedEvents.length === 0 ? <div className="muted">Aucun evenement.</div> : null}
              {activeCode
                ? shownSelectedEvents.map((ev) => {
                    const solo = selectedEvents.length === 1;
                    const isActive = activeEventId === ev.id;
                    return (
                      <button
                        key={ev.id}
                        className={`dayItem ${solo ? "solo" : ""} ${isActive ? "active" : ""} c${colorIndex(ev.id || ev.title)}`}
                        type="button"
                        onClick={() => {
                          setActiveEventId(ev.id);
                          openEditEvent(ev);
                        }}
                      >
                        <div className="dayItemTitle">
                          <WeatherIcon icon={weatherByDayKey.get(toYmd(new Date(ev.start)))} />
                          <EventIcon title={ev.title} />
                          {ev.title || "Evenement"}
                        </div>
                        <div className="dayItemMeta">
                          {new Date(ev.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} →{" "}
                          {new Date(ev.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </button>
                    );
                  })
                : null}
            </div>
          </div>

          <div className="panel panelSub">
            <div className="title">Astuce</div>
            <div className="muted">Clique une date pour voir les evenements du jour. Clique un evenement pour voir sa description.</div>
          </div>
        </aside>

        <main className="legacyMain">
          {view === "hub" ? (
            <div className="grid2">
              <div className="panel">
                <div className="title">Mes groupes</div>
                <div className="list">
                  {groupsQ.isLoading ? <div className="muted">Chargement...</div> : null}
                  {shownGroupsHub.map((g) => (
                    <button key={g.id} className="card" type="button" onClick={() => selectGroup(String(g.code).toUpperCase())}>
                      <div style={{ fontWeight: 900 }}>{g.name}</div>
                      <div className="muted">
                        code: <code>{g.code}</code> · role: {g.role}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="title">Amis</div>
                <div className="list">
                  {friendsQ.isLoading ? <div className="muted">Chargement...</div> : null}
                  {shownFriendsHub.map((f) => (
                    <div key={f.id} className="card">
                      <div style={{ fontWeight: 900 }}>{f.displayName}</div>
                      <div className="muted">{f.email}</div>
                    </div>
                  ))}
                </div>
                {activeCode ? (
                  <>
                    <div className="title" style={{ marginTop: 14 }}>
                      Membres du groupe
                    </div>
                    <div className="list">
                      {membersQ.isLoading ? <div className="muted">Chargement...</div> : null}
                      {shownMembersHub.map((m) => (
                        <div key={m.id} className="card">
                          <div style={{ fontWeight: 900 }}>{m.displayName}</div>
                          <div className="muted">
                            {m.email} · role: {m.role}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="calendarHeader">
                <div className="row">
                  <button className="btn" type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}>
                    ◀
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const t = new Date();
                      setSelectedDay(t);
                      setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1));
                    }}
                  >
                    Aujourd&apos;hui
                  </button>
                  <button className="btn" type="button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}>
                    ▶
                  </button>
                </div>
                <div className="calendarTitle">{monthLabel(monthDate)}</div>
              </div>

              <div className="calendar">
                <div className="calGrid">
                  {WEEKDAYS.map((dow) => (
                    <div key={dow} className="calDow">
                      {dow}
                    </div>
                  ))}
                  {gridDays.map((d) => {
                    const dayKey = toYmd(d);
                    const isOff = d.getMonth() !== monthDate.getMonth();
                    const isToday = sameYmd(d, today);
                    const isSelected = sameYmd(d, selectedDay);
                    const isPast = startOfDay(d).getTime() < todayStart.getTime() && !isToday;
                    const evs = byDay.get(dayKey) || [];
                    const max = 3;
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        className={["calCell", isOff ? "off" : "", isToday ? "today" : "", isSelected ? "selected" : "", isPast ? "past" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          setSelectedDay(d);
                          setActiveEventId("");
                        }}
                      >
                        <div className="calDate">
                          <div className="calDateNum">
                            {d.getDate()} <WeatherIcon icon={weatherByDayKey.get(dayKey)} className="inCal" />
                          </div>
                          <div className="pill" style={{ visibility: evs.length ? "visible" : "hidden" }}>
                            {evs.length ? String(evs.length) : ""}
                          </div>
                        </div>
                        {evs.slice(0, max).map((ev) => (
                          <div key={ev.id} className={`evChip c${colorIndex(ev.id || ev.title)}`}>
                            <EventIcon title={ev.title} />
                            {ev.title || "Evenement"}
                          </div>
                        ))}
                        {evs.length > max ? <div className="evChip more">+{evs.length - max} autres</div> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeEvent ? (
                <div className="panel" style={{ marginTop: 18 }}>
                  <div className="title">Evenement</div>
                  <div style={{ fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <EventIcon title={activeEvent.title} /> {activeEvent.title || "Evenement"}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {new Date(activeEvent.start).toLocaleString()} → {new Date(activeEvent.end).toLocaleString()}
                  </div>
                  {activeEvent.description ? <div className="card" style={{ marginTop: 10 }}>{activeEvent.description}</div> : null}
                </div>
              ) : null}
            </>
          )}
        </main>
      </div>

      {/* Floating buttons (notifications + create event placeholder) */}
      <div className="fabRow" aria-label="Actions rapides">
        <button
          className="fab fabMini"
          type="button"
          aria-label="Discussions"
          onClick={() => {
            setChatOpen(true);
            if (lastSeenKey) localStorage.setItem(lastSeenKey, String(Date.now()));
          }}
          title="Discussions"
        >
          <span className={`fabBadge ${hasUnread ? "" : "hidden"}`} aria-hidden="true" />
          💬
        </button>
        <button className="fab" type="button" aria-label="Nouvel evenement" onClick={() => openNewEvent()} disabled={!activeCode}>
          +
        </button>
      </div>

      {searchResults && (
        <div className="searchResults" aria-label="Resultats de recherche">
          <div className="searchResultsHead">
            <div className="searchResultsTitle">Resultats</div>
            <div className="muted">{searchResults.total ? `${searchResults.total}+` : "0"}</div>
          </div>

          {searchResults.total === 0 ? <div className="muted">Aucun resultat.</div> : null}

          {searchResults.events.length ? (
            <div className="searchBlock">
              <div className="searchBlockTitle">Evenements</div>
              <div className="searchList">
                {searchResults.events.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className="searchItem"
                    onClick={() => {
                      setView("calendar");
                      const d = new Date(ev.start);
                      setSelectedDay(d);
                      openEditEvent(ev);
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 900, display: "flex", alignItems: "center" }}>
                        <EventIcon title={ev.title} /> {ev.title}
                      </div>
                      <div className="muted">{toYmd(new Date(ev.start))}</div>
                    </div>
                    {ev.description ? <div className="muted">{String(ev.description).slice(0, 90)}</div> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searchResults.pinnedMessages.length ? (
            <div className="searchBlock">
              <div className="searchBlockTitle">Epingles</div>
              <div className="searchList">
                {searchResults.pinnedMessages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="searchItem"
                    onClick={() => {
                      setChatOpen(true);
                      setNotifOpen(false);
                      if (lastSeenKey) localStorage.setItem(lastSeenKey, String(Date.now()));
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{m.author}</div>
                    <div className="muted">{String(m.text).slice(0, 110)}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searchResults.messages.length ? (
            <div className="searchBlock">
              <div className="searchBlockTitle">Messages</div>
              <div className="searchList">
                {searchResults.messages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="searchItem"
                    onClick={() => {
                      setChatOpen(true);
                      setNotifOpen(false);
                      if (lastSeenKey) localStorage.setItem(lastSeenKey, String(Date.now()));
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 900 }}>{m.author}</div>
                      <div className="muted">{new Date(m.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="muted">{String(m.text).slice(0, 110)}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {searchResults.groups.length || searchResults.friends.length || searchResults.members.length ? (
            <div className="searchBlock">
              <div className="searchBlockTitle">Groupes & amis</div>
              <div className="searchList">
                {searchResults.groups.map((g) => (
                  <button key={g.id} type="button" className="searchItem" onClick={() => selectGroup(String(g.code).toUpperCase())}>
                    <div style={{ fontWeight: 900 }}>{g.name}</div>
                    <div className="muted">
                      code: <code>{g.code}</code>
                    </div>
                  </button>
                ))}
                {searchResults.friends.map((f) => (
                  <div key={f.id} className="searchItem" style={{ cursor: "default" }}>
                    <div style={{ fontWeight: 900 }}>{f.displayName}</div>
                    <div className="muted">{f.email}</div>
                  </div>
                ))}
                {searchResults.members.map((m) => (
                  <div key={m.id} className="searchItem" style={{ cursor: "default" }}>
                    <div style={{ fontWeight: 900 }}>{m.displayName}</div>
                    <div className="muted">
                      {m.email} · role: {m.role}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="searchDock" aria-label="Recherche">
        <div className="searchWrap">
          <input
            className="searchInput"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Recherche: evenements, messages, groupes..."
            aria-label="Recherche"
          />
          {searchQ ? (
            <button className="searchClear" type="button" onClick={() => setSearchQ("")} aria-label="Effacer la recherche">
              ×
            </button>
          ) : null}
        </div>
      </div>

      {notifOpen ? (
        <div className="panel" style={{ position: "fixed", right: 18, bottom: 88, width: "min(420px, calc(100vw - 36px))", zIndex: 50 }}>
          <div className="title">Notifications</div>
          {hasUnread ? <div className="muted">Nouveaux messages dans le groupe.</div> : <div className="muted">Aucune notification.</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" type="button" onClick={() => setNotifOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {evModalOpen ? (
        <>
          <div className="modalBackdrop" role="presentation" onClick={() => setEvModalOpen(false)} />
          <div className="modalCard">
            <div className="panel modalPanel">
              <div className="modalHead">
                <div className="modalTitle">{evEditing ? "Modifier evenement" : "Nouvel evenement"}</div>
                <button className="btn" type="button" onClick={() => setEvModalOpen(false)}>
                  Annuler
                </button>
              </div>

              {err ? <div className="err">{err}</div> : null}

              <div className="grid">
                <div>
                  <div className="fieldLabel">Titre</div>
                  <input className="input" maxLength={60} value={evTitle} onChange={(e) => setEvTitle(e.target.value)} />
                </div>
                <div>
                  <div className="fieldLabel">Date</div>
                  <input className="input" type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
                </div>
                <div>
                  <div className="fieldLabel">Heure</div>
                  <input className="input" type="time" value={evTime} onChange={(e) => setEvTime(e.target.value)} />
                </div>
                <div>
                  <div className="fieldLabel">Duree</div>
                  <div className="durRow">
                    <input className="input" type="number" min="0" step="1" value={evDurH} onChange={(e) => setEvDurH(e.target.value)} />
                    <span className="durSep">h</span>
                    <input className="input" type="number" min="0" max="59" step="5" value={evDurM} onChange={(e) => setEvDurM(e.target.value)} />
                    <span className="durSep">min</span>
                  </div>
                </div>
                <div className="span2">
                  <div className="fieldLabel">Meteo (jour)</div>
                  <div className="muted">
                    {activeCode && getWeatherPref(activeCode) ? (
                      <>
                        Ville: {getWeatherPref(activeCode)?.label} ·{" "}
                        <WeatherIcon icon={weatherByDayKey.get(String(evDate || "").trim())} />
                      </>
                    ) : (
                      "Configure la ville meteo dans le groupe."
                    )}
                  </div>
                </div>
                <div>
                  <div className="fieldLabel">Rappel</div>
                  <select className="select" value={evReminder} onChange={(e) => setEvReminder(e.target.value)}>
                    <option value="0">Aucun</option>
                    <option value="5">5 min avant</option>
                    <option value="15">15 min avant</option>
                    <option value="60">1 h avant</option>
                  </select>
                </div>
                <div className="span2">
                  <div className="fieldLabel">Description</div>
                  <textarea className="textarea" rows={4} maxLength={800} value={evDesc} onChange={(e) => setEvDesc(e.target.value)} />
                </div>
              </div>

              <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
                {evEditing ? (
                  <button
                    className={`btn btnDanger`}
                    type="button"
                    onClick={() => deleteEventMut.mutate()}
                    disabled={deleteEventMut.isPending || evEditing.canEdit === false}
                  >
                    Supprimer
                  </button>
                ) : (
                  <span />
                )}

                <div className="row">
                  <button className="btn" type="button" onClick={() => setEvModalOpen(false)}>
                    Fermer
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => (evEditing ? updateEventMut.mutate() : createEventMut.mutate())}
                    disabled={(evEditing?.canEdit === false) || createEventMut.isPending || updateEventMut.isPending}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FriendReqActions({ request }) {
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.acceptFriendRequest(request.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["friendRequests"] });
      await qc.invalidateQueries({ queryKey: ["friends"] });
    },
  });
  const decline = useMutation({
    mutationFn: () => api.declineFriendRequest(request.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["friendRequests"] });
    },
  });
  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => accept.mutate()} disabled={accept.isPending}>
        Accepter
      </button>
      <button className="btn" type="button" onClick={() => decline.mutate()} disabled={decline.isPending}>
        Refuser
      </button>
    </>
  );
}

function GroupLegacyPage({ code }) {
  const nav = useNavigate();
  const joinMut = useMutation({
    mutationFn: () => api.joinGroup(code),
  });
  const eventsQ = useQuery({
    queryKey: ["events", code],
    queryFn: () => api.listEvents(code),
    enabled: joinMut.isSuccess,
  });

  const [monthDate, setMonthDate] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState(() => new Date());
  const [activeEventId, setActiveEventId] = React.useState("");

  // Group chat (sidebar)
  const chatQ = useQuery({
    queryKey: ["groupChat", code],
    queryFn: () => api.getGroupChat(code),
    enabled: joinMut.isSuccess,
    refetchInterval: 5000,
  });
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatText, setChatText] = React.useState("");

  const qc = useQueryClient();
  const postChatMut = useMutation({
    mutationFn: () => api.postGroupChat(code, chatText),
    onSuccess: async () => {
      setChatText("");
      await qc.invalidateQueries({ queryKey: ["groupChat", code] });
    },
  });

  // Weather (stored per group in localStorage, like legacy)
  const [weatherLabel, setWeatherLabel] = React.useState(() => getWeatherPref(code)?.label || "");
  const [weatherByDayKey, setWeatherByDayKey] = React.useState(() => new Map());
  const [weatherErr, setWeatherErr] = React.useState("");
  const [weatherRefreshKey, setWeatherRefreshKey] = React.useState(0);

  React.useEffect(() => {
    joinMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  React.useEffect(() => {
    // Keep month anchored to selectedDay.
    setMonthDate(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1));
  }, [selectedDay]);

  const events = (eventsQ.data || []).slice().sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const byDay = React.useMemo(() => {
    const m = new Map();
    for (const ev of events) {
      const key = toYmd(new Date(ev.start));
      const arr = m.get(key) || [];
      arr.push(ev);
      m.set(key, arr);
    }
    return m;
  }, [events]);

  const selectedKey = toYmd(selectedDay);
  const selectedEvents = byDay.get(selectedKey) || [];
  const activeEvent = activeEventId ? events.find((e) => e.id === activeEventId) : null;

  const today = new Date();
  const todayStart = startOfDay(today);
  const gridDays = getMonthGrid(monthDate);

  // Refresh weather for current calendar range (best-effort).
  React.useEffect(() => {
    let alive = true;
    async function run() {
      setWeatherErr("");
      const pref = getWeatherPref(code);
      if (!pref) {
        if (alive) setWeatherByDayKey(new Map());
        return;
      }
      const gridStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 - 7);
      const gridEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 10);
      const startYmd = toYmd(gridStart);
      const endYmd = toYmd(gridEnd);
      try {
        const icons = await api.weatherRange({ lat: pref.lat, lon: pref.lon, startYmd, endYmd });
        const m = new Map();
        for (const [k, v] of Object.entries(icons || {})) m.set(k, v);
        if (alive) setWeatherByDayKey(m);
      } catch (e) {
        if (alive) {
          setWeatherByDayKey(new Map());
          setWeatherErr(String(e?.message || e));
        }
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [code, monthDate, weatherRefreshKey]);

  async function saveCity() {
    const q = String(weatherLabel || "").trim();
    if (!q) {
      setWeatherPref(code, null);
      setWeatherByDayKey(new Map());
      setWeatherErr("");
      setWeatherRefreshKey((x) => x + 1);
      return;
    }
    // Open-Meteo geocoding can fail on full string; try first chunk.
    const query = q.split(",")[0].trim() || q;
    const rs = await api.geocodePlace(query);
    if (!rs.length) throw new Error("Lieu introuvable.");
    const r = rs[0];
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    setWeatherPref(code, { label, lat: r.lat, lon: r.lon });
    setWeatherLabel(label);
    setWeatherRefreshKey((x) => x + 1);
  }

  return (
    <div className="legacyShell">
      <div className="legacyLayout">
        <aside className="legacySidebar">
          <div className="panel panelSub">
            <div className="title">Groupe</div>
            <div className="muted">
              Code: <code>{code}</code>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" placeholder="Ville meteo (ex: Paris)" value={weatherLabel} onChange={(e) => setWeatherLabel(e.target.value)} />
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => saveCity().catch((e) => setWeatherErr(String(e?.message || e)))}
              >
                OK
              </button>
            </div>
            {weatherErr ? <div className="err">{weatherErr}</div> : null}
            {!weatherErr && getWeatherPref(code) ? <div className="muted">Meteo: {getWeatherPref(code)?.label}</div> : null}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={() => nav("/home")}>
                Changer de groupe
              </button>
            </div>
          </div>

          <div className="panel panelSub" style={{ marginTop: 14 }}>
            <button className="title titleBtn" type="button" onClick={() => setChatOpen((v) => !v)}>
              Discussions <span style={{ marginLeft: "auto", opacity: 0.7 }}>{chatOpen ? "▾" : "▸"}</span>
            </button>
            {chatOpen ? (
              <>
                    <div className="gchatList" style={{ marginTop: 10 }}>
                      {chatQ.isLoading ? <div className="muted">Chargement...</div> : null}
                      {(chatQ.data?.pinnedMessages || []).length ? (
                        <div className="pinsBox">
                          <div className="pinsTitle">Epingles</div>
                          <div className="pinsList">
                            {(chatQ.data?.pinnedMessages || []).map((pm) => (
                              <div key={pm.id} className="pinMsg">
                                <div style={{ fontWeight: 900, marginBottom: 4 }}>{pm.author}</div>
                                <div className="muted">{pm.text}</div>
                                {pm.canUnpin ? (
                                  <div className="row" style={{ marginTop: 8 }}>
                                    <button
                                      className="btn btnSmall"
                                      type="button"
                                      onClick={() => {
                                        if (!activeCode) return;
                                        api.pinGroupChatMessage(activeCode, pm.id).then(() => qc.invalidateQueries({ queryKey: ["groupChat", activeCode] }));
                                      }}
                                    >
                                      Depingler
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {(chatQ.data?.messages || []).map((m) => (
                        <div key={m.id} className={`gmsg ${m.kind === "system" ? "system" : ""}`}>
                          <div className="gmsgHead">
                            <div className="gmsgAuthor">{m.author}</div>
                            <div className="gmsgTime">{new Date(m.createdAt).toLocaleString()}</div>
                          </div>
                      <div className="gmsgText">{m.text}</div>
                      <div className="reactions">
                        {["👍", "👎", "😂", "❤️", "🔥", "🎉", "😮"].map((e) => (
                          <button
                            key={e}
                            className={`rbtn ${m.myReactions?.[e] ? "on" : ""}`}
                            type="button"
                            onClick={() => api.reactGroupChatMessage(code, m.id, e).then(() => qc.invalidateQueries({ queryKey: ["groupChat", code] }))}
                          >
                            {e} {m.reactions?.[e] ? String(m.reactions[e]) : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="quick" style={{ marginTop: 10 }}>
                  {["Je suis en retard", "J'arrive", "Je ne peux pas", "On se retrouve ou ?"].map((t) => (
                    <button key={t} className="qbtn" type="button" onClick={() => { setChatText(t); }}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <input className="input" maxLength={500} placeholder="Message pour le groupe..." value={chatText} onChange={(e) => setChatText(e.target.value)} />
                  <button className="btn btn-primary" type="button" onClick={() => postChatMut.mutate()} disabled={postChatMut.isPending}>
                    Envoyer
                  </button>
                </div>
              </>
            ) : (
              <div className="muted">Clique pour ouvrir.</div>
            )}
          </div>

          <div className="panel panelSub" style={{ marginTop: 14 }}>
            <div className="title">Jour selectionne</div>
            <div className="muted" id="selectedDayLabel">
              {formatHumanDate(selectedDay)} <WeatherIcon icon={weatherByDayKey.get(toYmd(selectedDay))} />
            </div>
            <div className="dayList" style={{ marginTop: 10 }}>
              {eventsQ.isLoading ? <div className="muted">Chargement...</div> : null}
              {selectedEvents.length === 0 ? <div className="muted">Aucun evenement.</div> : null}
              {selectedEvents.map((ev) => {
                const solo = selectedEvents.length === 1;
                const isActive = activeEventId === ev.id;
                return (
                  <button
                    key={ev.id}
                    className={`dayItem ${solo ? "solo" : ""} ${isActive ? "active" : ""} c${colorIndex(ev.id || ev.title)}`}
                    type="button"
                    onClick={() => setActiveEventId(ev.id)}
                  >
                    <div className="dayItemTitle">
                      <WeatherIcon icon={weatherByDayKey.get(toYmd(new Date(ev.start)))} />
                      <EventIcon title={ev.title} />
                      {ev.title || "Evenement"}
                    </div>
                    <div className="dayItemMeta">
                      {new Date(ev.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} →{" "}
                      {new Date(ev.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel panelSub" style={{ marginTop: 14 }}>
            <div className="title">Astuce</div>
            <div className="muted">Clique une date pour voir les evenements du jour. Clique un evenement pour voir sa description.</div>
          </div>
        </aside>

        <main className="legacyMain">
          {joinMut.isPending ? <div className="muted">Connexion au groupe...</div> : null}
          {joinMut.isError ? (
            <div className="err">
              {String(joinMut.error?.message || joinMut.error)}{" "}
              <button className="btn" type="button" onClick={() => nav("/home")}>
                Retour
              </button>
            </div>
          ) : null}

          <div className="calendarHeader">
            <div className="row">
              <button
                className="btn"
                type="button"
                onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
              >
                ◀
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const t = new Date();
                  setSelectedDay(t);
                  setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1));
                }}
              >
                Aujourd&apos;hui
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
              >
                ▶
              </button>
            </div>
            <div className="calendarTitle">{monthLabel(monthDate)}</div>
          </div>

          <div className="calendar">
            <div className="calGrid">
              {WEEKDAYS.map((dow) => (
                <div key={dow} className="calDow">
                  {dow}
                </div>
              ))}
              {gridDays.map((d) => {
                const dayKey = toYmd(d);
                const isOff = d.getMonth() !== monthDate.getMonth();
                const isToday = sameYmd(d, today);
                const isSelected = sameYmd(d, selectedDay);
                const isPast = startOfDay(d).getTime() < todayStart.getTime() && !isToday;
                const evs = byDay.get(dayKey) || [];
                const max = 3;
                return (
                  <button
                    key={dayKey}
                    type="button"
                    className={[
                      "calCell",
                      isOff ? "off" : "",
                      isToday ? "today" : "",
                      isSelected ? "selected" : "",
                      isPast ? "past" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      setSelectedDay(d);
                      setActiveEventId("");
                    }}
                  >
                    <div className="calDate">
                      <div className="calDateNum">
                        {d.getDate()} <WeatherIcon icon={weatherByDayKey.get(dayKey)} className="inCal" />
                      </div>
                      <div className="pill" style={{ visibility: evs.length ? "visible" : "hidden" }}>
                        {evs.length ? String(evs.length) : ""}
                      </div>
                    </div>
                    {evs.slice(0, max).map((ev) => (
                      <div key={ev.id} className={`evChip c${colorIndex(ev.id || ev.title)}`}>
                        <EventIcon title={ev.title} />
                        {ev.title || "Evenement"}
                      </div>
                    ))}
                    {evs.length > max ? <div className="evChip more">+{evs.length - max} autres</div> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function colorIndex(key) {
  // Stable small hash -> 1..6
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

// (Read receipts removed)

function InviteRedirect() {
  const loc = useLocation();
  const sp = new URLSearchParams(loc.search);
  const g = (sp.get("g") || "").trim().toUpperCase();
  if (g) return <Navigate to={`/home?g=${encodeURIComponent(g)}`} replace />;
  return <Navigate to="/home" replace />;
}

function TokenRouteWrapper({ Component }) {
  const loc = useLocation();
  const parts = loc.pathname.split("/").filter(Boolean);
  const token = parts[1] || "";
  return <Component token={token} />;
}

export default function App() {
  const qc = useQueryClient();
  const meQ = useMe();
  const user = meQ.data || null;

  const logoutMut = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <Shell user={user} onLogout={() => logoutMut.mutate()}>
      {user ? <OnboardingTips user={user} /> : null}
      <Routes>
        <Route path="/" element={<InviteRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordRequestPage />} />
        <Route
          path="/reset-password/:token"
          element={<TokenRouteWrapper Component={({ token }) => <ResetPasswordConfirmPage token={token} />} />}
        />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppHome />
            </RequireAuth>
          }
        />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <LegacyHomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/g/:code"
          element={
            <RequireAuth>
              <GroupRoute />
            </RequireAuth>
          }
        />
        <Route path="*" element={<div className="muted">Page introuvable.</div>} />
      </Routes>
    </Shell>
  );
}

function GroupRoute() {
  const loc = useLocation();
  const parts = loc.pathname.split("/").filter(Boolean);
  const code = (parts[1] || "").trim().toUpperCase();
  return <Navigate to={`/home?g=${encodeURIComponent(code)}`} replace />;
}
