import type { BrowserContext, Response } from "playwright";
import type { SessionStore } from "../storage/session-store.js";
import type { NetworkEvent } from "../types.js";
import { makeId } from "../util/ids.js";
import { sanitizeHeaders, redactBodyText } from "../util/sanitize.js";

const CAPTURABLE_BODY_TYPES = ["text/css", "javascript", "text/html", "json", "text/plain", "svg"];

/**
 * Records request/response metadata for every request seen on the context
 * (covers popups/new windows too, since events are attached at the context level).
 * Only text-ish bodies (CSS/JS/HTML/JSON) are persisted; images/fonts/media are
 * logged as metadata only to keep sessions lightweight.
 */
export class NetworkRecorder {
  constructor(
    private readonly context: BrowserContext,
    private readonly store: SessionStore,
    private readonly getNearestStateId: () => string | undefined,
  ) {}

  attach(): void {
    this.context.on("response", (response) => {
      void this.handleResponse(response).catch((err) => {
        console.error("[network-recorder] failed to record response:", err);
      });
    });
  }

  private async handleResponse(response: Response): Promise<void> {
    const request = response.request();
    const headers = await request.allHeaders();
    let responseHeaders: Record<string, string> = {};
    try {
      responseHeaders = await response.allHeaders();
    } catch {
      // response may already be gone
    }

    const timing = request.timing();
    const event: NetworkEvent = {
      id: makeId("net"),
      timestamp: Date.now(),
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      status: response.status(),
      requestHeaders: sanitizeHeaders(headers),
      responseHeaders: sanitizeHeaders(responseHeaders),
      durationMs: timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : undefined,
      nearestStateId: this.getNearestStateId(),
    };

    const postData = request.postData();
    if (postData) {
      event.requestBodyPreview = redactBodyText(postData, headers["content-type"]);
    }

    const contentType = responseHeaders["content-type"] ?? "";
    if (CAPTURABLE_BODY_TYPES.some((t) => contentType.includes(t))) {
      try {
        const body = await response.body();
        const hash = await this.store.artifacts.saveResource(body, contentType);
        event.responseBodyArtifact = hash;
        if (contentType.includes("javascript")) {
          await this.captureSourceMap(body.toString("utf-8"), request.url(), hash);
        }
      } catch {
        // body unavailable (e.g. redirect, aborted, opaque response) — metadata is still recorded
      }
    }

    await this.store.appendNetworkEvent(event);
  }

  /** Best-effort: most production JS ships without a source map, so any failure here is expected and silent. */
  private async captureSourceMap(jsBody: string, jsUrl: string, jsHash: string): Promise<void> {
    const match = /\/\/[#@]\s*sourceMappingURL=(\S+)/.exec(jsBody);
    if (!match) return;
    const mappingUrl = match[1];

    if (mappingUrl.startsWith("data:")) {
      const base64 = mappingUrl.split(",")[1];
      if (!base64) return;
      const buf = Buffer.from(base64, "base64");
      await this.store.artifacts.saveResource(buf, "application/json", ".map", jsHash).catch(() => undefined);
      return;
    }

    try {
      const absoluteUrl = new URL(mappingUrl, jsUrl).toString();
      const res = await fetch(absoluteUrl);
      if (!res.ok) return;
      const buf = Buffer.from(await res.arrayBuffer());
      await this.store.artifacts.saveResource(buf, "application/json", ".map", jsHash);
    } catch {
      // source map not reachable — not an error condition
    }
  }
}
