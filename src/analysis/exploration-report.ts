import type { ExplorationReport } from "../explorer/exploration-engine.js";

export function renderExplorationReport(report: ExplorationReport): string {
  const explored = report.entries.filter((e) => e.outcome === "explored");
  const skipped = report.entries.filter((e) => e.outcome === "skipped");
  const duplicates = report.entries.filter((e) => e.outcome === "duplicate");
  const failed = report.entries.filter((e) => e.outcome === "failed");

  const describeCandidate = (e: (typeof report.entries)[number]) =>
    `${e.candidate.kind} "${e.candidate.text ?? e.candidate.ariaLabel ?? e.candidate.selector}" (depth ${e.depth})`;

  const lines = [
    "# Exploration report",
    "",
    `- Root URL: ${report.rootUrl}`,
    `- Boundaries: allowedDomains=[${report.boundaries.allowedDomains.join(", ")}], maxDepth=${report.boundaries.maxDepth}, maxActions=${report.boundaries.maxActions}, allowFormSubmission=${report.boundaries.allowFormSubmission}`,
    `- Actions attempted: ${report.totalActionsAttempted}`,
    `- Distinct UI states discovered: ${report.discoveredStateCount}`,
    `- Explored: ${explored.length}  Duplicates (skipped further expansion): ${duplicates.length}  Skipped (boundary): ${skipped.length}  Failed: ${failed.length}`,
    "",
    "This reflects only what the explorer actually attempted. Elements that were never",
    "discovered (e.g. behind an unexplored interaction) are not represented here.",
    "",
    "## Explored",
    "",
    ...(explored.length
      ? explored.map((e) => `- ${describeCandidate(e)} → state ${e.resultingStateId ?? "(unrecorded)"}`)
      : ["(none)"]),
    "",
    "## Duplicate states (explored, but not expanded further)",
    "",
    ...(duplicates.length ? duplicates.map((e) => `- ${describeCandidate(e)}`) : ["(none)"]),
    "",
    "## Skipped (safety boundary)",
    "",
    ...(skipped.length ? skipped.map((e) => `- ${describeCandidate(e)} — ${e.reason}`) : ["(none)"]),
    "",
    "## Failed",
    "",
    ...(failed.length ? failed.map((e) => `- ${describeCandidate(e)} — ${e.reason}`) : ["(none)"]),
  ];
  return lines.join("\n");
}
