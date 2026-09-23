#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import readline from "node:readline";
import { writeFile } from "node:fs/promises";
import { SessionManager } from "./session-manager.js";
import { ExplorationEngine } from "./explorer/exploration-engine.js";
import { DEFAULT_MAX_ACTIONS, DEFAULT_MAX_DEPTH, type ExplorationBoundaries } from "./explorer/safety.js";
import { renderExplorationReport } from "./analysis/exploration-report.js";

const program = new Command();

program
  .name("analyzer")
  .description("Records how a website behaves at runtime and exports an inspectable session.");

program
  .command("record <url>")
  .description("Launch a browser, record manual browsing, and export the session on stop")
  .option("--headless", "run without a visible browser window", false)
  .option("-o, --output <dir>", "root directory for session output", path.resolve("data"))
  .option("--storage-state <path>", "reuse a previously saved login (storageState.json)")
  .option("--checkpoint-debounce <ms>", "debounce window before capturing a state checkpoint", "600")
  .action(async (url: string, opts) => {
    const manager = new SessionManager({
      url,
      headless: Boolean(opts.headless),
      dataRoot: opts.output,
      storageStatePath: opts.storageState,
      checkpointDebounceMs: Number(opts.checkpointDebounce),
    });

    console.log(`Session: ${manager.sessionId}`);
    console.log(`Launching browser and navigating to ${url} ...`);
    const page = await manager.start();
    console.log(`Recording. Session output: ${manager.store.dir}`);
    console.log("Log in and browse the site normally.");
    console.log("Press ENTER in this terminal to capture a manual checkpoint at any time.");
    console.log("Type 'stop' + ENTER (or close the browser window) to end the recording and export.\n");

    let stopped = false;
    const stop = async (reason: string) => {
      if (stopped) return;
      stopped = true;
      rl.close();
      console.log(`\nStopping (${reason})...`);
      const summary = await manager.stop();
      console.log(`Exported session: ${manager.store.dir}`);
      console.log(
        `States: ${summary.counts.states}  Interactions: ${summary.counts.interactions}  ` +
          `Network events: ${summary.counts.networkEvents}  Console events: ${summary.counts.consoleEvents}  ` +
          `Resources: ${summary.counts.resources}`,
      );
      process.exit(0);
    };

    page.on("close", () => void stop("browser window closed"));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on("line", (line) => {
      if (line.trim().toLowerCase() === "stop") {
        void stop("user requested");
      } else {
        void manager.manualCheckpoint().then(() => console.log("Captured manual checkpoint."));
      }
    });
    // manualCheckpoint() and stop() both funnel through SessionManager's internal
    // capture queue, so stop() always waits for a checkpoint requested just before it.

    process.on("SIGINT", () => void stop("SIGINT"));
  });

program
  .command("explore <url>")
  .description("Automatically discover and click through interactive elements, recording each resulting state")
  .option("--headless", "run without a visible browser window", false)
  .option("-o, --output <dir>", "root directory for session output", path.resolve("data"))
  .option("--storage-state <path>", "reuse a previously saved login (storageState.json)")
  .option("--checkpoint-debounce <ms>", "debounce window before capturing a state checkpoint", "600")
  .option(
    "--allowed-domain <hostname>",
    "additional hostname considered in-scope for link-following (repeatable; the root URL's hostname is always included)",
    (val: string, prev: string[]) => prev.concat([val]),
    [] as string[],
  )
  .option("--max-depth <n>", "maximum exploration depth from the root page", String(DEFAULT_MAX_DEPTH))
  .option("--max-actions <n>", "maximum number of actions to attempt", String(DEFAULT_MAX_ACTIONS))
  .option("--allow-form-submission", "allow clicking native form-submit controls (off by default — see report for what was skipped)", false)
  .action(async (url: string, opts) => {
    const manager = new SessionManager({
      url,
      headless: Boolean(opts.headless),
      dataRoot: opts.output,
      storageStatePath: opts.storageState,
      checkpointDebounceMs: Number(opts.checkpointDebounce),
    });

    console.log(`Session: ${manager.sessionId}`);
    console.log(`Launching browser and navigating to ${url} ...`);
    const page = await manager.start();
    console.log(`Session output: ${manager.store.dir}`);

    const boundaries: ExplorationBoundaries = {
      allowedDomains: [new URL(url).hostname, ...(opts.allowedDomain as string[])],
      maxDepth: Number(opts.maxDepth),
      maxActions: Number(opts.maxActions),
      allowFormSubmission: Boolean(opts.allowFormSubmission),
    };
    console.log(
      `Boundaries: domains=[${boundaries.allowedDomains.join(", ")}] maxDepth=${boundaries.maxDepth} ` +
        `maxActions=${boundaries.maxActions} allowFormSubmission=${boundaries.allowFormSubmission}`,
    );

    console.log("\nIf login is required, log in now — exploration reuses whatever session is active.");
    console.log("Press ENTER when ready to begin automatic exploration.\n");
    await waitForEnter();

    console.log("Exploring...");
    const engine = new ExplorationEngine(manager, page, boundaries);
    const report = await engine.run(url);

    await writeFile(path.join(manager.store.dir, "exploration-report.json"), JSON.stringify(report, null, 2));
    await writeFile(path.join(manager.store.dir, "exploration-report.md"), renderExplorationReport(report));

    const counts = {
      explored: report.entries.filter((e) => e.outcome === "explored").length,
      duplicate: report.entries.filter((e) => e.outcome === "duplicate").length,
      skipped: report.entries.filter((e) => e.outcome === "skipped").length,
      failed: report.entries.filter((e) => e.outcome === "failed").length,
    };
    console.log(
      `Exploration complete. Attempted: ${report.totalActionsAttempted}  Explored: ${counts.explored}  ` +
        `Duplicates: ${counts.duplicate}  Skipped: ${counts.skipped}  Failed: ${counts.failed}`,
    );

    const summary = await manager.stop();
    console.log(`Exported session: ${manager.store.dir}`);
    console.log(
      `States: ${summary.counts.states}  Interactions: ${summary.counts.interactions}  ` +
        `Network events: ${summary.counts.networkEvents}  Console events: ${summary.counts.consoleEvents}  ` +
        `Resources: ${summary.counts.resources}`,
    );
    process.exit(0);
  });

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

program.parseAsync(process.argv);
