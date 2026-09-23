import type { CandidateElement } from "./element-discovery.js";

export interface ExplorationBoundaries {
  /** Hostnames considered in-scope. Links pointing elsewhere are not followed. */
  allowedDomains: string[];
  maxDepth: number;
  maxActions: number;
  allowFormSubmission: boolean;
}

export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_MAX_ACTIONS = 20;

// Two independent layers, since a risky action isn't always a native form submit
// (an SPA "Delete account" button wired to a JS handler has no <form> at all):
// text-pattern matching catches the JS-handler case, isFormSubmit catches native
// submits regardless of button wording. Per the architecture doc's default posture:
// no payments, account creation/deletion, messages sent, or arbitrary form submits.
const BLOCKED_TEXT_PATTERNS: RegExp[] = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bunsubscribe\b/i,
  /\bcancel\b/i,
  /\bdeactivate\b/i,
  /\bpay\b/i,
  /\bpayment\b/i,
  /\bcheckout\b/i,
  /\bpurchase\b/i,
  /\bbuy\b/i,
  /\border\b/i,
  /\bconfirm\b/i,
  /log\s?out/i,
  /sign\s?out/i,
  /\bsend\b/i,
  /\bsubmit\b/i,
];

export type CandidateVerdict = { skip: false } | { skip: true; reason: string };

export function evaluateCandidate(candidate: CandidateElement, boundaries: ExplorationBoundaries): CandidateVerdict {
  const label = `${candidate.text ?? ""} ${candidate.ariaLabel ?? ""}`.trim();
  const matchedPattern = BLOCKED_TEXT_PATTERNS.find((p) => p.test(label));
  if (matchedPattern) {
    return { skip: true, reason: `matches blocked action pattern (${matchedPattern.source}): "${label}"` };
  }

  if (candidate.isFormSubmit && !boundaries.allowFormSubmission) {
    return { skip: true, reason: "form submission disabled by default" };
  }

  if (candidate.hostname && !boundaries.allowedDomains.includes(candidate.hostname)) {
    return { skip: true, reason: `link targets out-of-scope domain: ${candidate.hostname}` };
  }

  return { skip: false };
}
