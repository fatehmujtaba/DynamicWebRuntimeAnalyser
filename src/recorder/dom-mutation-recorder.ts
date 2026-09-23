import type { BrowserContext, Page } from "playwright";

export interface RawMutationBatch {
  windowMs: number;
  addedNodes: number;
  removedNodes: number;
  attributeChanges: number;
  sampleSelectors: string[];
}

const BINDING_NAME = "__analyzerReportMutation";
const BATCH_WINDOW_MS = 400;

/**
 * Observes DOM mutations via MutationObserver and reports batched summaries
 * (counts + a handful of sample selectors), not full diffs — mirrors the
 * "lightweight continuous events, expensive snapshots only at checkpoints"
 * rule from the recording architecture. Individual mutations (a class toggle,
 * a text node update) are common and cheap; only a batch is reported.
 */
export class DomMutationRecorder {
  private readonly attached = new WeakSet<Page>();

  constructor(
    private readonly context: BrowserContext,
    private readonly onMutationBatch: (page: Page, batch: RawMutationBatch) => void,
  ) {}

  attachToAllPages(): void {
    this.context.on("page", (page) => {
      void this.attachToPage(page);
    });
  }

  async attachToPage(page: Page): Promise<void> {
    if (this.attached.has(page)) return;
    this.attached.add(page);
    await page.exposeBinding(BINDING_NAME, (source, batch: RawMutationBatch) => {
      this.onMutationBatch(source.page, batch);
    });
    await page.addInitScript(buildInjectedScript(BINDING_NAME, BATCH_WINDOW_MS));
  }
}

function buildInjectedScript(bindingName: string, windowMs: number): string {
  return `
(function () {
  var added = 0;
  var removed = 0;
  var attrs = 0;
  var samples = [];
  var timer = null;

  function describe(node) {
    if (!node || node.nodeType !== 1) return null;
    var el = node;
    var id = el.id ? "#" + el.id : "";
    var cls = (el.getAttribute && el.getAttribute("class")) || "";
    var clsPart = cls ? "." + cls.trim().split(/\\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + id + clsPart;
  }

  function flush() {
    timer = null;
    if (added === 0 && removed === 0 && attrs === 0) return;
    window[${JSON.stringify(bindingName)}]({
      windowMs: ${JSON.stringify(windowMs)},
      addedNodes: added,
      removedNodes: removed,
      attributeChanges: attrs,
      sampleSelectors: samples.slice(0, 5),
    });
    added = 0;
    removed = 0;
    attrs = 0;
    samples = [];
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, ${JSON.stringify(windowMs)});
  }

  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "childList") {
        added += r.addedNodes.length;
        removed += r.removedNodes.length;
        var sample = describe(r.addedNodes[0]) || describe(r.target);
        if (sample && samples.indexOf(sample) === -1) samples.push(sample);
      } else if (r.type === "attributes") {
        attrs += 1;
      }
    }
    schedule();
  });

  function start() {
    if (!document.documentElement) return;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-expanded", "aria-hidden", "hidden", "open"],
    });
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
`;
}
