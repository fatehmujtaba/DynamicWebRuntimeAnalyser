import type { BrowserContext, Page } from "playwright";
import type { SessionStore } from "../storage/session-store.js";
import type { ConsoleEvent } from "../types.js";
import { makeId } from "../util/ids.js";
import { truncate } from "../util/sanitize.js";

/** Captures console messages and uncaught runtime exceptions from every page in the context. */
export class ConsoleRecorder {
  constructor(
    private readonly context: BrowserContext,
    private readonly store: SessionStore,
  ) {}

  attach(): void {
    this.context.on("page", (page) => this.attachToPage(page));
  }

  attachToPage(page: Page): void {
    page.on("console", (msg) => {
      void this.store.appendConsoleEvent({
        id: makeId("console"),
        timestamp: Date.now(),
        level: msg.type(),
        text: truncate(msg.text()),
        location: msg.location()?.url,
      } satisfies ConsoleEvent);
    });

    page.on("pageerror", (error) => {
      void this.store.appendConsoleEvent({
        id: makeId("console"),
        timestamp: Date.now(),
        level: "exception",
        text: truncate(error.message),
      } satisfies ConsoleEvent);
    });
  }
}
