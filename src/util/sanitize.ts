const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
]);

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return out;
}

const MAX_TEXT_PREVIEW = 4000;

export function truncate(text: string, max = MAX_TEXT_PREVIEW): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}

const SENSITIVE_FIELD_HINTS = /pass|token|secret|ssn|card|cvv|auth/i;

export function looksSensitive(nameOrId: string | undefined): boolean {
  return !!nameOrId && SENSITIVE_FIELD_HINTS.test(nameOrId);
}

const SENSITIVE_JSON_KEY = /^(password|passwd|pwd|token|secret|api[_-]?key|authorization|cvv|ssn|card(number)?)$/i;

/** Best-effort redaction of credential-shaped fields in JSON or form-encoded request/response bodies. */
export function redactBodyText(text: string, contentType?: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) {
    try {
      const parsed = JSON.parse(text);
      const redacted = redactJsonValue(parsed);
      return truncate(JSON.stringify(redacted));
    } catch {
      // fall through to text-based redaction
    }
  }
  if (ct.includes("form-urlencoded")) {
    const redacted = text
      .split("&")
      .map((pair) => {
        const [key, ...rest] = pair.split("=");
        return SENSITIVE_JSON_KEY.test(decodeURIComponent(key ?? "")) ? `${key}=%5BREDACTED%5D` : pair;
      })
      .join("&");
    return truncate(redacted);
  }
  return truncate(text);
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_JSON_KEY.test(key) ? "[REDACTED]" : redactJsonValue(v);
    }
    return out;
  }
  return value;
}
