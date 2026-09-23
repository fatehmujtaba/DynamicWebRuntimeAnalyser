import { randomBytes } from "node:crypto";

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

export function makeSessionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `session-${stamp}`;
}
