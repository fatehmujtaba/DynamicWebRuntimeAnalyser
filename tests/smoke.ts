// Phase 1+2 smoke test: drives a public test page (the-internet.herokuapp.com,
// built for exactly this kind of automation testing) to verify that clicks,
// hovers, and form input are captured as interactions, trigger new state
// checkpoints, and that the derived graph/timeline link everything together —
// without relying on manual browser input.
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { SessionManager } from "../src/session-manager.js";
import type { StateCheckpoint } from "../src/types.js";
import type { StateGraph } from "../src/analysis/state-graph.js";
import type { TimelineEntry } from "../src/analysis/timeline.js";

const dataRoot = path.resolve("data", "test-sessions");

async function main() {
  const manager = new SessionManager({
    url: "https://the-internet.herokuapp.com/login",
    headless: true,
    dataRoot,
    checkpointDebounceMs: 300,
  });

  const page = await manager.start();

  await page.hover("h2");
  await page.waitForTimeout(400); // let the hover dwell timer + debounced checkpoint fire

  await page.fill("#username", "tomsmith");
  await page.fill("#password", "SuperSecretPassword!");
  await page.click("button[type='submit']");
  await page.waitForTimeout(600);

  const summary = await manager.stop();

  assert.ok(summary.counts.states >= 3, `expected >=3 states, got ${summary.counts.states}`);
  assert.ok(summary.counts.interactions >= 2, `expected >=2 interactions (hover + click), got ${summary.counts.interactions}`);
  assert.ok(summary.counts.networkEvents >= 1, "expected network events to be recorded");

  const interactionsRaw = await readFile(path.join(manager.store.dir, "interactions.jsonl"), "utf-8");
  assert.ok(!interactionsRaw.includes("SuperSecretPassword"), "password value leaked into interactions log");
  assert.ok(interactionsRaw.includes('"type":"hover"'), "expected a hover interaction to be recorded");
  assert.ok(interactionsRaw.includes("styleBefore"), "expected hover interaction to carry a style/rect snapshot");

  const statesRaw = await readFile(path.join(manager.store.dir, "states.json"), "utf-8");
  const states = JSON.parse(statesRaw) as StateCheckpoint[];
  assert.ok(states.some((s) => s.url.includes("/secure")), "expected a post-login state on the /secure page");
  assert.ok(
    states.every((s) => Array.isArray(s.inlineStyleHashes)),
    "expected every state to record inline stylesheet hashes",
  );

  const graph = JSON.parse(await readFile(path.join(manager.store.dir, "graph.json"), "utf-8")) as StateGraph;
  assert.ok(graph.nodes.length === states.length, "graph node count should match states count");
  assert.ok(
    graph.edges.some((e) => e.toStateId !== undefined),
    "expected at least one edge to resolve to a resulting state",
  );

  const timeline = JSON.parse(await readFile(path.join(manager.store.dir, "timeline.json"), "utf-8")) as TimelineEntry[];
  assert.ok(timeline.length >= summary.counts.states + summary.counts.interactions, "timeline should merge all event kinds");
  const sorted = [...timeline].sort((a, b) => a.timestamp - b.timestamp);
  assert.deepEqual(timeline, sorted, "timeline should be chronologically sorted");

  console.log(
    "PASS: states =",
    summary.counts.states,
    " interactions =",
    summary.counts.interactions,
    " mutations =",
    summary.counts.domMutations,
    " graph edges =",
    graph.edges.length,
  );
  await rm(manager.store.dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
