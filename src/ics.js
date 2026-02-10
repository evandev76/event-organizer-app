import { formatHm, formatHumanDate } from "./date.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dtLocalToIcsUtc(dt) {
  // Convert to UTC and format as YYYYMMDDTHHMMSSZ
  const d = new Date(dt.getTime());
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

function escapeText(s) {
  return String(s || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

export function buildIcsForEvent(ev, groupName) {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const now = new Date();
  const uid = `${ev.id}@kifekoi.local`;
  const summary = ev.title || "Evenement";
  const desc = ev.description || "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kifekoi//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${dtLocalToIcsUtc(now)}`,
    `DTSTART:${dtLocalToIcsUtc(start)}`,
    `DTEND:${dtLocalToIcsUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(desc)}`,
    `CATEGORIES:${escapeText(groupName || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

export function downloadText(filename, text, mimeType = "text/plain") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function icsFilename(ev) {
  const start = new Date(ev.start);
  const y = start.getFullYear();
  const m = pad2(start.getMonth() + 1);
  const d = pad2(start.getDate());
  const t = formatHm(start).replace(":", "");
  const base = `${y}${m}${d}_${t}_${(ev.title || "evenement").slice(0, 24)}`;
  return `${base.replaceAll(/[^a-zA-Z0-9_-]+/g, "_")}.ics`;
}

export function humanRange(ev) {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const date = formatHumanDate(start);
  return `${date} ${formatHm(start)} - ${formatHm(end)}`;
}

