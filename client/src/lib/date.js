export const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const MONTHS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toYmd(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

export function sameYmd(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function monthLabel(date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatHumanDate(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatHm(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseLocalDateTime(dateYmd, timeHm) {
  const [y, m, d] = String(dateYmd || "").split("-").map(Number);
  const [hh, mm] = String(timeHm || "").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function getMonthGrid(date) {
  // Returns a 6-week grid starting Monday.
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const jsDow = first.getDay(); // 0 Sun .. 6 Sat
  const mondayIndex = (jsDow + 6) % 7; // Monday=0
  const gridStart = new Date(year, month, 1 - mondayIndex);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}
