import crypto from "node:crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(input) {
  return crypto.createHash("sha256").update(String(input)).digest("base64url");
}

