// Phase 3 smoke test: points the automatic explorer at the-internet.herokuapp.com
// (a public page purpose-built for exactly this kind of automation testing, with
// dozens of links) and verifies it discovers multiple distinct states, records
// interactions/checkpoints through the *existing* recorder pipeline, respects
// safety boundaries (no external links, no form submits by default), and
// produces a coherent report — without any manual browser input.
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { SessionManager } from "../src/session-manager.js";
import { ExplorationEngine } from "../src/explorer/exploration-engine.js";
import type { ExplorationBoundaries } from "../src/explorer/safety.js";
import type { StateCheckpoint } from "../src/types.js";

const dataRoot = path.resolve("data", "test-sessions");
const rootUrl = "https://the-internet.herokuapp.com/";

async function main() {
  const manager = new SessionManager({
    url: rootUrl,
    headless: true,
    dataRoot,
    checkpointDebounceMs: 300,
  });

  const page = await manager.start();

  const boundaries: ExplorationBoundaries = {
    allowedDomains: [new URL(rootUrl).hostname],
    maxDepth: 1,
    maxActions: 8,
    allowFormSubmission: false,
  };

  const engine = new ExplorationEngine(manager, page, boundaries);
  const report = await engine.run(rootUrl);

  assert.equal(report.totalActionsAttempted, 8, "should stop at maxActions");
  const explored = report.entries.filter((e) => e.outcome === "explored");
  const failed = report.entries.filter((e) => e.outcome === "failed");
  assert.ok(explored.length >= 1, `expected at least one explored action, got ${explored.length}`);
  assert.ok(failed.length === 0, `expected no failed actions, got ${JSON.stringify(failed)}`);
  assert.ok(
    report.entries.every((e) => e.candidate.hostname === undefined || boundaries.allowedDomains.includes(e.candidate.hostname)),
    "every candidate with a resolvable hostname must be in-scope (explorer only discovers; safety.ts enforces skip for out-of-scope ones separately)",
  );

  const summary = await manager.stop();
  assert.ok(summary.counts.states >= 2, `expected >=2 states (root + at least one explored), got ${summary.counts.states}`);

  const statesRaw = await readFile(path.join(manager.store.dir, "states.json"), "utf-8");
  const states = JSON.parse(statesRaw) as StateCheckpoint[];
  const distinctUrls = new Set(states.map((s) => s.url));
  assert.ok(distinctUrls.size >= 2, `expected exploration to reach distinct URLs, got ${[...distinctUrls]}`);

  console.log(
    "PASS: actionsAttempted =",
    report.totalActionsAttempted,
    " explored =",
    explored.length,
    " duplicates =",
    report.entries.filter((e) => e.outcome === "duplicate").length,
    " skipped =",
    report.entries.filter((e) => e.outcome === "skipped").length,
    " states =",
    summary.counts.states,
    " distinct URLs =",
    distinctUrls.size,
  );
  await rm(manager.store.dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("EXPLORE SMOKE TEST FAILED:", err);
  process.exit(1);
});
