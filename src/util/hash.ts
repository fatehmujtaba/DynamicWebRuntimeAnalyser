import { createHash } from "node:crypto";

export function contentHash(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 24);
}
