import type { Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionStore } from "../storage/session-store.js";
import type { ElementRect, ElementStyleSnapshot, StateCheckpoint } from "../types.js";
import { makeId } from "../util/ids.js";
import { ELEMENT_STYLE_PROPS } from "../util/style-props.js";

/**
 * Captures a full UI-state snapshot (rendered DOM, screenshot, stylesheet
 * list, inline styles, and — when a target selector is known — the "after"
 * computed style/geometry of the element that was interacted with). This is
 * intentionally expensive and should only be called at meaningful checkpoints
 * (navigation, interaction, mutation, manual trigger) — never on every event.
 */
export class CheckpointRecorder {
  private nextIndex = 0;

  constructor(private readonly store: SessionStore) {}

  async capture(
    page: Page,
    trigger: StateCheckpoint["trigger"],
    triggerInteractionId?: string,
    targetSelector?: string,
  ): Promise<StateCheckpoint> {
    const id = makeId("state");
    const index = this.nextIndex++;
    const dir = this.store.stateDir({ id, index });
    await mkdir(dir, { recursive: true });

    const html = await captureContent(page);
    const [stylesheetHrefs, inlineStyles, title] = await Promise.all([
      page
        .evaluate(() =>
          Array.from(document.styleSheets)
            .map((s) => s.href)
            .filter((h): h is string => !!h),
        )
        .catch(() => [] as string[]),
      page
        .evaluate(() =>
          Array.from(document.querySelectorAll("style"))
            .map((s) => s.textContent ?? "")
            .filter((text) => text.trim().length > 0),
        )
        .catch(() => [] as string[]),
      page.title().catch(() => ""),
    ]);
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };

    const inlineStyleHashes = await Promise.all(
      inlineStyles.map((css) => this.store.artifacts.saveResource(Buffer.from(css, "utf-8"), "text/css")),
    );

    const domPath = path.join(dir, "dom.html");
    const screenshotPath = path.join(dir, "screenshot.png");
    await writeFile(domPath, html);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);

    let elementSnapshotPath: string | undefined;
    if (targetSelector) {
      const snapshot = await captureElementSnapshot(page, targetSelector);
      if (snapshot) {
        const snapshotPath = path.join(dir, "element-snapshot.json");
        await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
        elementSnapshotPath = path.relative(this.store.dir, snapshotPath);
      }
    }

    const checkpoint: StateCheckpoint = {
      id,
      index,
      timestamp: Date.now(),
      url: page.url(),
      title,
      trigger,
      triggerInteractionId,
      domPath: path.relative(this.store.dir, domPath),
      screenshotPath: path.relative(this.store.dir, screenshotPath),
      viewport: { ...viewport, deviceScaleFactor: 1 },
      stylesheetHrefs,
      inlineStyleHashes,
      elementSnapshotPath,
    };

    await this.store.addState(checkpoint);
    return checkpoint;
  }
}

/**
 * A checkpoint can be scheduled by a click that itself triggers navigation
 * (e.g. a form submit), so `page.content()` may race an in-flight navigation.
 * Retry once after the navigation settles rather than dropping the checkpoint.
 */
async function captureContent(page: Page): Promise<string> {
  try {
    return await page.content();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("navigating")) throw err;
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return page.content();
  }
}

async function captureElementSnapshot(
  page: Page,
  selector: string,
): Promise<{ selector: string; rectAfter: ElementRect; styleAfter: ElementStyleSnapshot } | undefined> {
  return page
    .evaluate(
      ({ selector, props }) => {
        const el = document.querySelector(selector);
        if (!el) return undefined;
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const style: Record<string, string> = {};
        for (const prop of props) style[prop] = cs[prop as keyof CSSStyleDeclaration] as string;
        return {
          selector,
          rectAfter: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styleAfter: style,
        };
      },
      { selector, props: ELEMENT_STYLE_PROPS },
    )
    .catch(() => undefined);
}
