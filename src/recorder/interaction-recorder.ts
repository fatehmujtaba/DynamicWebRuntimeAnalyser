import type { BrowserContext, Page } from "playwright";
import { looksSensitive } from "../util/sanitize.js";
import { ELEMENT_STYLE_PROPS } from "../util/style-props.js";
import { BUILD_SELECTOR_JS } from "../util/injected-snippets.js";
import type { ElementRect, ElementStyleSnapshot } from "../types.js";

export interface RawInteraction {
  type: "click" | "input" | "hover" | "keydown";
  selector?: string;
  tag?: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  rectBefore?: ElementRect;
  styleBefore?: ElementStyleSnapshot;
}

const BINDING_NAME = "__analyzerReportInteraction";
const HOVER_DWELL_MS = 150;

/**
 * Detects clicks, field changes, dwell-filtered hovers, and Enter/Escape
 * keypresses inside the page and reports lightweight, sanitized element
 * metadata back to Node — never raw input values, so passwords and other
 * sensitive field contents are never captured. For click/hover, also grabs a
 * small computed-style + geometry snapshot of the target *before* any
 * resulting re-render, since that can't be reconstructed after the fact.
 */
export class InteractionRecorder {
  private readonly attached = new WeakSet<Page>();

  constructor(
    private readonly context: BrowserContext,
    private readonly onInteraction: (page: Page, data: RawInteraction) => void,
  ) {}

  attachToAllPages(): void {
    this.context.on("page", (page) => {
      void this.attachToPage(page);
    });
  }

  async attachToPage(page: Page): Promise<void> {
    if (this.attached.has(page)) return;
    this.attached.add(page);
    await page.exposeBinding(BINDING_NAME, (source, data: RawInteraction) => {
      this.onInteraction(source.page, sanitizeRaw(data));
    });
    await page.addInitScript(buildInjectedScript(BINDING_NAME, HOVER_DWELL_MS));
  }
}

function sanitizeRaw(data: RawInteraction): RawInteraction {
  if (looksSensitive(data.text) || looksSensitive(data.selector) || looksSensitive(data.ariaLabel)) {
    return { ...data, text: undefined };
  }
  return data;
}

// Built as a raw JS string (not a serialized TS function) so it runs in the
// page with zero dependency on the Node build's module/helper machinery —
// esbuild's dev transform can inject helper calls (e.g. `__name(...)`) into a
// function's `.toString()` output that Playwright would otherwise ship into
// the page, where those helpers don't exist and the whole listener silently
// throws before it ever attaches.
function buildInjectedScript(bindingName: string, hoverDwellMs: number): string {
  return `
(function () {
  var STYLE_PROPS = ${JSON.stringify(ELEMENT_STYLE_PROPS)};

  function describeTarget(el) {
    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute("role") || undefined;
    var ariaLabel = el.getAttribute("aria-label") || undefined;
    var isPassword = el.type === "password";
    var rawText = (el.textContent || "").trim().slice(0, 120);
    var text = isPassword ? undefined : (rawText || undefined);
    return { selector: buildSelector(el), tag: tag, role: role, ariaLabel: ariaLabel, text: text };
  }

  function styleSnapshot(el) {
    var rect = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    var style = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      style[STYLE_PROPS[i]] = cs[STYLE_PROPS[i]];
    }
    return {
      rectBefore: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styleBefore: style,
    };
  }

  ${BUILD_SELECTOR_JS}

  document.addEventListener("click", function (e) {
    var el = e.target;
    if (!el) return;
    var detail = describeTarget(el);
    var snap = styleSnapshot(el);
    detail.type = "click";
    detail.rectBefore = snap.rectBefore;
    detail.styleBefore = snap.styleBefore;
    window[${JSON.stringify(bindingName)}](detail);
  }, { capture: true });

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el) return;
    var detail = describeTarget(el);
    detail.type = "input";
    window[${JSON.stringify(bindingName)}](detail);
  }, { capture: true });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" && e.key !== "Enter") return;
    var el = e.target;
    var detail = el ? describeTarget(el) : {};
    detail.type = "keydown";
    detail.text = e.key;
    window[${JSON.stringify(bindingName)}](detail);
  }, { capture: true });

  var hoverTarget = null;
  var hoverTimer = null;

  document.addEventListener("mouseover", function (e) {
    var el = e.target;
    if (!el || el === hoverTarget) return;
    hoverTarget = el;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      if (hoverTarget !== el) return;
      var detail = describeTarget(el);
      var snap = styleSnapshot(el);
      detail.type = "hover";
      detail.rectBefore = snap.rectBefore;
      detail.styleBefore = snap.styleBefore;
      window[${JSON.stringify(bindingName)}](detail);
    }, ${JSON.stringify(hoverDwellMs)});
  }, { capture: true });

  document.addEventListener("mouseout", function (e) {
    if (e.target === hoverTarget) {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      hoverTarget = null;
    }
  }, { capture: true });
})();
`;
}
