import type { Page } from "playwright";
import { contentHash } from "../util/hash.js";

interface StateSignature {
  path: string;
  title: string;
  dialogOpen: boolean;
  dialogLabel: string;
  interactiveCount: number;
  signature: string[];
}

// Deliberately avoids raw innerText/full-HTML hashing (doc guidance: timestamps and
// rotating content make functionally-identical states look different). Uses only
// structural signals: route, visible interactive elements' tag/role/stable-label
// (id/name/aria-label — never free text, which is more likely to be dynamic), and
// whether a dialog is open.
const FINGERPRINT_SCRIPT = `
(function () {
  function stableLabel(el) {
    var aria = el.getAttribute("aria-label");
    if (aria) return "aria:" + aria;
    var id = el.id;
    if (id && !/\\d{3,}/.test(id)) return "id:" + id;
    var name = el.getAttribute("name");
    if (name) return "name:" + name;
    return "";
  }

  var nodes = Array.prototype.slice.call(document.querySelectorAll(
    'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], input[type="submit"]'
  ));
  var visible = nodes.filter(function (el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  var signature = visible
    .map(function (el) {
      return el.tagName.toLowerCase() + ":" + (el.getAttribute("role") || "") + ":" + stableLabel(el);
    })
    .sort();

  var dialog = document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]');

  return {
    path: location.pathname,
    title: document.title,
    dialogOpen: !!dialog,
    dialogLabel: dialog ? (dialog.getAttribute("aria-label") || dialog.id || "dialog") : "",
    interactiveCount: visible.length,
    signature: signature,
  };
})();
`;

/** A stable hash identifying the current UI state, for duplicate-state detection during exploration. */
export async function computeFingerprint(page: Page): Promise<string> {
  const signature = (await page.evaluate(FINGERPRINT_SCRIPT)) as StateSignature;
  return contentHash(JSON.stringify(signature));
}
