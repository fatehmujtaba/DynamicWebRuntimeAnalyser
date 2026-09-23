/**
 * Shared raw-JS source fragments for browser-context scripts (addInitScript /
 * page.evaluate). Kept as strings — not TS functions — for the same reason
 * documented in interaction-recorder.ts: serializing a TS function reference
 * can carry esbuild dev-mode helper calls (e.g. `__name(...)`) into the page,
 * where they don't exist and the whole script silently throws.
 */

/** Defines `buildSelector(el)` — a short, human-readable CSS path (id > class > nth-of-type, capped at 5 ancestors). */
export const BUILD_SELECTOR_JS = `
  function buildSelector(el) {
    var parts = [];
    var node = el;
    for (var depth = 0; node && depth < 5; depth++) {
      var part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(part + "#" + node.id);
        break;
      }
      var cls = (node.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }
`;
