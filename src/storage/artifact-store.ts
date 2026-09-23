import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { contentHash } from "../util/hash.js";

const MAX_RESOURCE_BYTES = 2 * 1024 * 1024;

/**
 * Content-addressed store for large/repeated artifacts (JS, CSS, HTML, images).
 * Identical bodies (e.g. a shared vendor bundle loaded on every page) are
 * written once and referenced by hash from multiple network events.
 */
export class ArtifactStore {
  private readonly resourcesDir: string;
  private readonly index = new Map<
    string,
    { path: string; contentType: string; bytes: number; truncated: boolean; relatedTo?: string }
  >();

  constructor(private readonly sessionDir: string) {
    this.resourcesDir = path.join(sessionDir, "resources");
  }

  async init(): Promise<void> {
    await mkdir(this.resourcesDir, { recursive: true });
  }

  /**
   * Saves a resource body by content hash, deduping identical bodies. Returns the hash id.
   * `relatedTo` links a derived artifact (e.g. a source map) back to the hash of the resource it belongs to.
   */
  async saveResource(body: Buffer, contentType: string, extHint?: string, relatedTo?: string): Promise<string> {
    const truncated = body.length > MAX_RESOURCE_BYTES;
    const stored = truncated ? body.subarray(0, MAX_RESOURCE_BYTES) : body;
    const hash = contentHash(stored);
    if (this.index.has(hash)) return hash;

    const ext = extHint ?? extensionForContentType(contentType);
    const filePath = path.join(this.resourcesDir, `${hash}${ext}`);
    if (!existsSync(filePath)) {
      await writeFile(filePath, stored);
    }
    this.index.set(hash, {
      path: path.relative(this.sessionDir, filePath),
      contentType,
      bytes: stored.length,
      truncated,
      relatedTo,
    });
    return hash;
  }

  async writeIndex(): Promise<void> {
    const obj = Object.fromEntries(this.index.entries());
    await writeFile(path.join(this.resourcesDir, "index.json"), JSON.stringify(obj, null, 2));
  }

  get size(): number {
    return this.index.size;
  }
}

function extensionForContentType(contentType: string): string {
  const ct = contentType.split(";")[0].trim();
  const map: Record<string, string> = {
    "text/css": ".css",
    "text/html": ".html",
    "application/javascript": ".js",
    "text/javascript": ".js",
    "application/json": ".json",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
  };
  return map[ct] ?? ".bin";
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}
