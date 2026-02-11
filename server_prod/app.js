import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";

import { bad, ok } from "./http.js";
import { attachUserFromSession } from "./middleware/session.js";
import { authRouter } from "./routes/auth.js";
import { groupsRouter } from "./routes/groups.js";
import { friendsRouter } from "./routes/friends.js";
import { weatherRouter } from "./routes/weather.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Railway/Vercel sit behind proxies and set X-Forwarded-* headers.
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "300kb" }));
  app.use(cookieParser());

  // CORS for separate frontend domain (Vercel) calling the API (Railway) with cookies.
  // Configure one or more exact origins via CORS_ORIGINS="https://a.com,https://b.com".
  const corsOriginsRaw = String(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "").trim();
  let corsOrigins = corsOriginsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // If not explicitly configured, default to allowing the configured public base URL.
  if (!corsOrigins.length) {
    const base = String(process.env.PUBLIC_BASE_URL || "").trim();
    if (base) {
      try {
        corsOrigins = [new URL(base).origin];
      } catch {
        // ignore invalid PUBLIC_BASE_URL
      }
    }
  }
  if (corsOrigins.length) {
    app.use((req, res, next) => {
      const origin = String(req.headers.origin || "");
      if (origin && corsOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "content-type");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      if (req.method === "OPTIONS") return res.status(204).send("");
      return next();
    });
  }

  // Serve the React build if present (Phase 5). Otherwise keep a tiny API landing page.
  const distDir = path.resolve(process.cwd(), "client", "dist");
  const distIndex = path.join(distDir, "index.html");
  const hasReactBuild = fs.existsSync(distIndex);

  if (!hasReactBuild) {
    app.get("/", (_req, res) => {
      res
        .status(200)
        .type("html")
        .send(
          [
            "<!doctype html>",
            "<meta charset='utf-8'/>",
            "<meta name='viewport' content='width=device-width, initial-scale=1'/>",
            "<title>Kifekoi API (prod)</title>",
            "<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:24px;line-height:1.35}code{background:#f3f3f3;padding:2px 6px;border-radius:6px}</style>",
            "<h1>Kifekoi: serveur (refactor prod)</h1>",
            "<p>Le frontend React n'est pas encore build. Ce serveur expose l'API sous <code>/api</code>.</p>",
            "<ul>",
            "<li><a href='/api/health'>/api/health</a></li>",
            "<li><a href='/api/version'>/api/version</a></li>",
            "</ul>",
            "<p>Dev: lance l'API <code>npm run dev:prod</code> et le client <code>npm run client:dev</code>.</p>",
          ].join(""),
        );
    });
  }

  // Default limiter for /api routes (auth routes have dedicated ones).
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false });
  app.use("/api", apiLimiter);

  app.use(attachUserFromSession);

  app.get("/api/health", (_req, res) => ok(res, { time: new Date().toISOString() }));
  app.get("/api/version", (_req, res) => ok(res, { name: "kifekoi", api: "prod", version: 1 }));

  app.use("/api/auth", authRouter());
  app.use("/api/groups", groupsRouter());
  app.use("/api/friends", friendsRouter());
  app.use("/api/weather", weatherRouter());

  // Placeholder until Phase 5 (React) replaces legacy frontend.
  app.use("/api", (_req, res) => bad(res, 404, "Route API introuvable."));

  // React SPA static hosting (only if client/dist exists).
  if (hasReactBuild) {
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
    app.get("*", (req, res) => {
      // Any non-API GET falls back to the SPA.
      if (req.path.startsWith("/api")) return bad(res, 404, "Route API introuvable.");
      res.status(200).sendFile(distIndex);
    });
  }

  return app;
}
