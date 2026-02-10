import { markNotified } from "./storage.js";

function minutesBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 60_000);
}

function shouldNotify({ now, ev }) {
  const reminder = Number(ev.reminderMinutes || 0);
  if (!reminder) return null;

  const start = new Date(ev.start);
  const delta = minutesBetween(now, start);
  // Notify in a small window so we don't miss if the timer drifts.
  if (delta <= reminder && delta >= reminder - 2) return { start, reminder };
  return null;
}

export function canNotify() {
  return "Notification" in window;
}

export async function ensurePermission() {
  if (!canNotify()) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "granted") return { ok: true };
  if (Notification.permission === "denied") return { ok: false, reason: "denied" };
  const res = await Notification.requestPermission();
  return { ok: res === "granted", reason: res };
}

export function startNotificationLoop({ state, getActiveGroupId, getGroupName, getEvents }) {
  if (!canNotify()) return () => {};

  const tick = () => {
    if (Notification.permission !== "granted") return;

    const now = new Date();
    const activeGroupId = getActiveGroupId();
    const evs = getEvents().filter((e) => {
      // Backward compatible: older local schema had groupId; server schema uses groupCode.
      if (e.groupCode) return e.groupCode === activeGroupId;
      if (e.groupId) return e.groupId === activeGroupId;
      return true;
    });

    for (const ev of evs) {
      const hit = shouldNotify({ now, ev });
      if (!hit) continue;

      const key = `ev:${ev.id}:${new Date(ev.start).toISOString()}:${ev.reminderMinutes}`;
      if (state.notified && state.notified[key]) continue;

      const groupKey = ev.groupCode || ev.groupId || activeGroupId;
      const groupName = getGroupName(groupKey);
      // If the caller ignores the parameter, that's fine.
      const title = ev.title || "Evenement";
      const when = new Date(ev.start);
      const hh = String(when.getHours()).padStart(2, "0");
      const mm = String(when.getMinutes()).padStart(2, "0");
      const body = `${groupName ? `[${groupName}] ` : ""}Commence a ${hh}:${mm} (rappel ${ev.reminderMinutes} min)`;

      try {
        // eslint-disable-next-line no-new
        new Notification(title, { body });
        markNotified(state, key);
        // Let UI show a badge/dot.
        try {
          window.dispatchEvent(
            new CustomEvent("kifekoi:notification", { detail: { title, body, groupKey, eventId: ev.id } }),
          );
        } catch {
          // ignore
        }
      } catch {
        // Some browsers can still throw even when granted.
      }
    }
  };

  tick();
  const id = setInterval(tick, 60_000);
  return () => clearInterval(id);
}
