// One-off: seeds data/sessions/ with real recorded sessions for dashboard dev/testing. Not part of the test suite.
import path from "node:path";
import { SessionManager } from "../src/session-manager.js";
import { ExplorationEngine } from "../src/explorer/exploration-engine.js";
import type { ExplorationBoundaries } from "../src/explorer/safety.js";

const dataRoot = path.resolve("data");

async function seedLoginSession() {
  const manager = new SessionManager({
    url: "https://the-internet.herokuapp.com/login",
    headless: true,
    dataRoot,
    checkpointDebounceMs: 300,
  });
  const page = await manager.start();
  await page.hover("h2");
  await page.waitForTimeout(400);
  await page.fill("#username", "tomsmith");
  await page.fill("#password", "SuperSecretPassword!");
  await page.click("button[type='submit']");
  await page.waitForTimeout(600);
  const summary = await manager.stop();
  console.log("login session:", manager.store.dir, summary.counts);
}

async function seedExploreSession() {
  const rootUrl = "https://the-internet.herokuapp.com/";
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
  const { writeFile } = await import("node:fs/promises");
  const { renderExplorationReport } = await import("../src/analysis/exploration-report.js");
  await writeFile(path.join(manager.store.dir, "exploration-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(manager.store.dir, "exploration-report.md"), renderExplorationReport(report));
  const summary = await manager.stop();
  console.log("explore session:", manager.store.dir, summary.counts);
}

await seedLoginSession();
await seedExploreSession();
