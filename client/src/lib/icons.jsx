import React from "react";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(hay, needles) {
  for (const n of needles) if (hay.includes(n)) return true;
  return false;
}

export function iconKeyForTitle(title) {
  const t = norm(title);
  if (!t) return "chat";
  if (hasAny(t, ["anniv", "anniversaire", "birthday", "gateau", "cake"])) return "cake";
  if (hasAny(t, ["foot", "soccer", "match", "basket", "tennis", "sport", "run", "course"])) return "ball";
  if (hasAny(t, ["cine", "cinema", "film", "movie", "serie", "series"])) return "film";
  if (hasAny(t, ["resto", "restaurant", "bar", "apero", "aperitif", "cafe", "brunch", "dej", "dejeuner", "diner"])) return "food";
  if (hasAny(t, ["boulot", "travail", "work", "reunion", "meeting", "standup", "call"])) return "work";
  if (hasAny(t, ["cours", "classe", "exam", "devoir", "etude", "revision", "school"])) return "study";
  if (hasAny(t, ["voyage", "trip", "train", "avion", "vol", "hotel", "vacances"])) return "travel";
  if (hasAny(t, ["concert", "musique", "music", "festival"])) return "music";
  if (hasAny(t, ["jeu", "jeux", "gaming", "game", "lan"])) return "game";
  return "chat";
}

const ICONS = {
  cake: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c.6 0 1 .4 1 1v2h-2V3c0-.6.4-1 1-1Zm-5 7h10a3 3 0 0 1 3 3v8H4v-8a3 3 0 0 1 3-3Zm-1 6c1.3 0 1.9-.7 2.6-1.4.8-.8 1.7-1.6 3.4-1.6s2.6.8 3.4 1.6c.7.7 1.3 1.4 2.6 1.4.7 0 1.4-.2 2-.7V12a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v1.3c.6.5 1.3.7 2 .7Z" />
    </svg>
  ),
  ball: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.9 0 3.6.6 5 1.7l-2.2 1.5-2.8-1.3-2.8 1.3L7 5.7A7.9 7.9 0 0 1 12 4Zm-7.6 8c.1-1.7.8-3.3 1.9-4.6l2.1 1.4.4 2.9-1.8 2.2-2.6-.7Zm7.6 8a8 8 0 0 1-5.3-2l.8-2.4 2.7-1.3 1.8 1.4 1.8-1.4 2.7 1.3.8 2.4A8 8 0 0 1 12 20Zm7.6-8-2.6.7-1.8-2.2.4-2.9 2.1-1.4a8 8 0 0 1 1.9 4.6Z" />
    </svg>
  ),
  film: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm4 0H6v2h2V6Zm0 4H6v2h2v-2Zm0 4H6v2h2v-2Zm10-8h-2v2h2V6Zm0 4h-2v2h2v-2Zm0 4h-2v2h2v-2ZM10 8h4v8h-4V8Z" />
    </svg>
  ),
  food: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3h2v7a2 2 0 0 1-2 2v9H6v-9a2 2 0 0 1-2-2V3h2v7h2V3Zm7 0c2.2 0 4 1.8 4 4v6h-2v8h-2v-8h-2V7c0-2.2 1.8-4 4-4Z" />
    </svg>
  ),
  work: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v4H2v-4a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2Zm0 4h6V5H9v2Zm-7 8h8v2H2v-2Zm12 0h8v2h-8v-2Z" />
    </svg>
  ),
  study: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm0 10L4.2 9 12 4.8 19.8 9 12 13Zm-7 4.2V12l7 3.8 7-3.8v5.2c0 1.1-3.1 3.8-7 3.8s-7-2.7-7-3.8Z" />
    </svg>
  ),
  travel: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 20v-2l7-3V4.5a2.5 2.5 0 1 1 5 0V15l7 3v2l-9-2-1 3h-2l-1-3-9 2Z" />
    </svg>
  ),
  music: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 3v12.5a3.5 3.5 0 1 1-2-3.2V7H9v8.5a3.5 3.5 0 1 1-2-3.2V3h12Z" />
    </svg>
  ),
  game: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 9h2v2h2v2H9v2H7v-2H5v-2h2V9Zm10 0h2v4h-2V9Zm-2 2h2v2h-2v-2ZM6.5 6h11A4.5 4.5 0 0 1 22 10.5v5A2.5 2.5 0 0 1 19.5 18H17l-1.5-2h-7L7 18H4.5A2.5 2.5 0 0 1 2 15.5v-5A4.5 4.5 0 0 1 6.5 6Z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v10h2h.7L9 14h11V6H4Z" />
    </svg>
  ),
};

export function EventIcon({ title }) {
  const key = iconKeyForTitle(title);
  return <span className={`eicon eicon-${key}`}>{ICONS[key] || ICONS.chat}</span>;
}

