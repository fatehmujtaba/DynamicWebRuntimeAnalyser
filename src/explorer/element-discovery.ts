import type { Page } from "playwright";
import { BUILD_SELECTOR_JS } from "../util/injected-snippets.js";

export type CandidateKind = "link" | "button" | "tab" | "menuitem" | "other";

export interface CandidateElement {
  selector: string;
  tag: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  kind: CandidateKind;
  href?: string;
  hostname?: string;
  isFormSubmit: boolean;
}

// Scoped to the doc's stated targets (buttons, links, tabs, menu items, disclosure
// widgets) — deliberately excludes bare [tabindex] and <select> to avoid chasing
// non-semantic focus targets and native OS pickers Playwright can't reliably drive headless.
const DISCOVERY_SELECTOR =
  'a[href], button, input[type="submit"], input[type="button"], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], summary';

function buildDiscoveryScript(): string {
  return `
(function () {
  ${BUILD_SELECTOR_JS}

  var nodes = Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(DISCOVERY_SELECTOR)}));
  var seen = {};
  var results = [];

  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (el.disabled) continue;
    var rect = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    if (rect.width <= 0 || rect.height <= 0 || cs.visibility === "hidden" || cs.display === "none") continue;

    var selector = buildSelector(el);
    if (seen[selector]) continue;
    seen[selector] = true;

    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute("role") || undefined;
    var ariaLabel = el.getAttribute("aria-label") || undefined;
    var text = (el.textContent || "").trim().slice(0, 80) || undefined;

    var href;
    var hostname;
    if (tag === "a") {
      var raw = el.getAttribute("href");
      if (raw) {
        href = raw;
        try {
          hostname = new URL(raw, location.href).hostname;
        } catch (e) {}
      }
    }

    var form = el.closest ? el.closest("form") : null;
    var isFormSubmit = !!form && (el.type === "submit" || (tag === "button" && !el.getAttribute("type")));

    var kind = "other";
    if (tag === "a") kind = "link";
    else if (tag === "button" || role === "button" || (tag === "input" && (el.type === "submit" || el.type === "button"))) kind = "button";
    else if (role === "tab") kind = "tab";
    else if (role === "menuitem") kind = "menuitem";

    results.push({
      selector: selector,
      tag: tag,
      role: role,
      ariaLabel: ariaLabel,
      text: text,
      kind: kind,
      href: href,
      hostname: hostname,
      isFormSubmit: isFormSubmit,
    });
  }

  return results;
})();
`;
}

/** Surveys the current page for candidate interactive elements — read-only, activates nothing. */
export async function discoverCandidates(page: Page): Promise<CandidateElement[]> {
  return (await page.evaluate(buildDiscoveryScript())) as CandidateElement[];
}
