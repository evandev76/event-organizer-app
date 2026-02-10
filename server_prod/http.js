export function nowIso() {
  return new Date().toISOString();
}

export function bad(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

export function ok(res, payload = {}) {
  return res.json({ ok: true, ...payload });
}

