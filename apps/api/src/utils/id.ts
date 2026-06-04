import crypto from "node:crypto";

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
