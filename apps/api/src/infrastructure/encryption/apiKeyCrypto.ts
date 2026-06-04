import crypto from "node:crypto";
import { env } from "../../config/env.js";

function getKey() {
  const raw = env.ENCRYPTION_KEY;
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to deterministic development key derivation.
  }

  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptApiKey(apiKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptApiKey(payload: string) {
  const [ivRaw, tagRaw, textRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !textRaw) {
    throw new Error("Invalid encrypted API key payload");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(textRaw, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function maskApiKey(apiKey: string) {
  if (apiKey.length <= 12) {
    return `${apiKey.slice(0, 4)}****`;
  }

  return `${apiKey.slice(0, 4)}${"*".repeat(16)}${apiKey.slice(-4)}`;
}
