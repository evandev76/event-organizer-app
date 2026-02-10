import express from "express";
import { bad, ok } from "../http.js";

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "kifekoi/1.0" } });
    if (!r.ok) {
      let snippet = "";
      try {
        const text = await r.text();
        snippet = String(text || "").slice(0, 160);
      } catch {
        // ignore
      }
      throw new Error(`Upstream ${r.status}${snippet ? `: ${snippet}` : ""}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function ymdOk(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function isRainy({ precipSum, precipProbMax, weatherCode }) {
  if (Number.isFinite(precipSum) && precipSum >= 0.2) return true;
  if (Number.isFinite(precipProbMax) && precipProbMax >= 50) return true;
  if (Number.isFinite(weatherCode) && weatherCode >= 50) return true;
  return false;
}

export function weatherRouter() {
  const r = express.Router();

  // Geocode (best effort)
  r.get("/geocode", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return bad(res, 400, "q obligatoire.");
    try {
      const attempts = [];
      attempts.push(q);
      const noDigits = q.replace(/[0-9]/g, " ").replace(/\s+/g, " ").trim();
      if (noDigits && noDigits !== q) attempts.push(noDigits);

      let results = [];
      for (const name of attempts) {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=fr&format=json`;
        const data = await fetchJson(url);
        const rs = Array.isArray(data?.results) ? data.results : [];
        if (rs.length) {
          results = rs;
          break;
        }
      }

      if (!results.length) return bad(res, 404, "Lieu introuvable. Essaie juste la ville (ex: Paris, Lyon).");

      const mapped = results.map((x) => ({
        name: x.name,
        admin1: x.admin1 || "",
        country: x.country || "",
        lat: x.latitude,
        lon: x.longitude,
      }));
      return ok(res, { results: mapped });
    } catch (e) {
      return bad(res, 502, `Service meteo indisponible. (${e?.message || "erreur"})`);
    }
  });

  // One day icon (sun/rain)
  r.get("/day", async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const date = String(req.query.date || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(res, 400, "Coordonnees invalides.");
    if (!ymdOk(date)) return bad(res, 400, "date invalide.");

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      `&daily=precipitation_sum,precipitation_probability_max,weather_code` +
      `&start_date=${encodeURIComponent(date)}&end_date=${encodeURIComponent(date)}` +
      `&timezone=auto`;

    try {
      const data = await fetchJson(url);
      const precipSum = Number(data?.daily?.precipitation_sum?.[0] ?? 0);
      const precipProbMax = Number(data?.daily?.precipitation_probability_max?.[0] ?? 0);
      const weatherCode = Number(data?.daily?.weather_code?.[0] ?? 0);
      const rain = isRainy({ precipSum, precipProbMax, weatherCode });
      return ok(res, { weather: { icon: rain ? "rain" : "sun" } });
    } catch (e) {
      const msg = String(e?.message || "erreur");
      const status = msg.includes("Upstream 400") ? 400 : 502;
      return bad(res, status, `Service meteo indisponible. (${msg})`);
    }
  });

  // Range icons (one upstream call)
  r.get("/range", async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const start = String(req.query.start || "");
    const end = String(req.query.end || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(res, 400, "Coordonnees invalides.");
    if (!ymdOk(start) || !ymdOk(end)) return bad(res, 400, "start/end invalides.");

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      `&daily=precipitation_sum,precipitation_probability_max,weather_code` +
      `&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}` +
      `&timezone=auto`;

    try {
      const data = await fetchJson(url);
      const dates = data?.daily?.time || [];
      const precipSum = data?.daily?.precipitation_sum || [];
      const precipProbMax = data?.daily?.precipitation_probability_max || [];
      const weatherCode = data?.daily?.weather_code || [];
      if (!Array.isArray(dates) || dates.length === 0) return bad(res, 502, "Pas de donnees meteo.");

      const icons = {};
      for (let i = 0; i < dates.length; i++) {
        const ymd = String(dates[i] || "");
        if (!ymdOk(ymd)) continue;
        const rain = isRainy({
          precipSum: Number(precipSum[i] ?? 0),
          precipProbMax: Number(precipProbMax[i] ?? 0),
          weatherCode: Number(weatherCode[i] ?? 0),
        });
        icons[ymd] = rain ? "rain" : "sun";
      }

      return ok(res, { icons });
    } catch (e) {
      const msg = String(e?.message || "erreur");
      const status = msg.includes("Upstream 400") ? 400 : 502;
      return bad(res, status, `Service meteo indisponible. (${msg})`);
    }
  });

  return r;
}

