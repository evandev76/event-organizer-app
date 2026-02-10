import { WEEKDAYS, getMonthGrid, monthLabel, sameYmd, toYmd } from "./date.js";
import { makeEventIconEl } from "./icons.js";

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

function colorIndex(key) {
  // Stable small hash -> 1..6
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

export function renderCalendar({
  rootEl,
  monthDate,
  today,
  selectedDay,
  eventsByDayKey,
  weatherByDayKey,
  onSelectDay,
}) {
  rootEl.textContent = "";

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const grid = document.createElement("div");
  grid.className = "cal-grid";

  for (const dow of WEEKDAYS) {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = dow;
    grid.appendChild(el);
  }

  const days = getMonthGrid(monthDate);
  const month = monthDate.getMonth();

  for (const d of days) {
    const dayKey = toYmd(d);
    const isOff = d.getMonth() !== month;
    const isToday = sameYmd(d, today);
    const isSelected = selectedDay ? sameYmd(d, selectedDay) : false;
    const isPast = d.getTime() < todayStart.getTime() && !isToday;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (isOff) cell.classList.add("off");
    if (isToday) cell.classList.add("today");
    if (isSelected) cell.classList.add("selected");
    if (isPast) cell.classList.add("past");

    const head = document.createElement("div");
    head.className = "cal-date";

    const num = document.createElement("div");
    num.className = "cal-date-num";
    num.textContent = String(d.getDate());

    const w = weatherByDayKey ? weatherByDayKey.get(dayKey) : null;
    if (w === "sun" || w === "rain") {
      num.appendChild(makeWeatherIconEl(w));
    }

    const count = (eventsByDayKey.get(dayKey) || []).length;
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = count ? `${count}` : "";
    pill.style.visibility = count ? "visible" : "hidden";

    head.appendChild(num);
    head.appendChild(pill);
    cell.appendChild(head);

    const evs = eventsByDayKey.get(dayKey) || [];
    const max = 3;
    for (let i = 0; i < Math.min(max, evs.length); i++) {
      const chip = document.createElement("div");
      chip.className = `ev-chip c${colorIndex(evs[i].id || evs[i].title)}`;
      chip.appendChild(makeEventIconEl(evs[i].title || ""));
      chip.appendChild(document.createTextNode(evs[i].title || "Evenement"));
      cell.appendChild(chip);
    }
    if (evs.length > max) {
      const more = document.createElement("div");
      more.className = "ev-chip more";
      more.textContent = `+${evs.length - max} autres`;
      cell.appendChild(more);
    }

    cell.addEventListener("click", () => onSelectDay(d));
    grid.appendChild(cell);
  }

  rootEl.appendChild(grid);

  return {
    monthLabel: monthLabel(monthDate),
  };
}
