import type { Page } from "playwright";
import type { SessionManager } from "../session-manager.js";
import { discoverCandidates, type CandidateElement } from "./element-discovery.js";
import { computeFingerprint } from "./state-fingerprint.js";
import { evaluateCandidate, type ExplorationBoundaries } from "./safety.js";
import { makeId } from "../util/ids.js";

export interface ExplorationTask {
  id: string;
  /** Selectors from the root, in click order, needed to reach and then activate this candidate. */
  path: string[];
  candidate: CandidateElement;
  depth: number;
}

export type ExplorationOutcome = "explored" | "skipped" | "failed" | "duplicate";

export interface ExplorationLogEntry {
  taskId: string;
  depth: number;
  selectorPath: string[];
  candidate: CandidateElement;
  outcome: ExplorationOutcome;
  reason?: string;
  resultingStateId?: string;
}

export interface ExplorationReport {
  rootUrl: string;
  boundaries: ExplorationBoundaries;
  totalActionsAttempted: number;
  discoveredStateCount: number;
  entries: ExplorationLogEntry[];
}

const RESTORE_SETTLE_MS = 300;
const POST_ACTION_SETTLE_MS = 400;
const ACTION_TIMEOUT_MS = 3000;

/**
 * Discovers interactive elements, queues them, clicks through non-destructive
 * ones (never form submits or anything text-matching a blocked pattern by
 * default), and skips anything already observed as a duplicate UI state.
 * Reuses the existing recorder pipeline for capture — this engine only
 * decides *what* to click and *when* a state has already been seen; it
 * never writes to the session store directly.
 */
export class ExplorationEngine {
  private readonly entries: ExplorationLogEntry[] = [];
  private readonly seenFingerprints = new Set<string>();
  private actionsAttempted = 0;

  constructor(
    private readonly manager: SessionManager,
    private readonly page: Page,
    private readonly boundaries: ExplorationBoundaries,
  ) {}

  async run(rootUrl: string): Promise<ExplorationReport> {
    const rootFingerprint = await computeFingerprint(this.page).catch(() => undefined);
    if (rootFingerprint) this.seenFingerprints.add(rootFingerprint);

    const queue: ExplorationTask[] = await this.discoverAsTasks([], 0);

    while (queue.length > 0 && this.actionsAttempted < this.boundaries.maxActions) {
      const task = queue.shift()!;
      this.actionsAttempted++;

      const verdict = evaluateCandidate(task.candidate, this.boundaries);
      if (verdict.skip) {
        this.record(task, "skipped", verdict.reason);
        continue;
      }

      const restored = await this.restoreTo(rootUrl, task.path.slice(0, -1));
      if (!restored) {
        this.record(task, "failed", "could not restore to the origin state needed to replay this action");
        continue;
      }

      const activated = await this.clickSafely(task.candidate.selector);
      if (!activated) {
        this.record(task, "failed", "target element not found or not clickable after restoration");
        continue;
      }
      await this.settle();

      const fingerprint = await computeFingerprint(this.page).catch(() => undefined);
      const resultingStateId = this.manager.currentStateId;

      if (fingerprint && this.seenFingerprints.has(fingerprint)) {
        this.record(task, "duplicate", "resulting UI state matches one already observed", resultingStateId);
        continue;
      }
      if (fingerprint) this.seenFingerprints.add(fingerprint);
      this.record(task, "explored", undefined, resultingStateId);

      if (task.depth + 1 < this.boundaries.maxDepth) {
        const children = await this.discoverAsTasks(task.path, task.depth + 1);
        queue.push(...children);
      }
    }

    await this.restoreTo(rootUrl, []);

    return {
      rootUrl,
      boundaries: this.boundaries,
      totalActionsAttempted: this.actionsAttempted,
      discoveredStateCount: this.seenFingerprints.size,
      entries: this.entries,
    };
  }

  private record(task: ExplorationTask, outcome: ExplorationOutcome, reason?: string, resultingStateId?: string): void {
    this.entries.push({
      taskId: task.id,
      depth: task.depth,
      selectorPath: task.path,
      candidate: task.candidate,
      outcome,
      reason,
      resultingStateId,
    });
  }

  private async discoverAsTasks(parentPath: string[], depth: number): Promise<ExplorationTask[]> {
    const candidates = await discoverCandidates(this.page).catch(() => [] as CandidateElement[]);
    return candidates.map((candidate) => ({
      id: makeId("task"),
      path: [...parentPath, candidate.selector],
      candidate,
      depth,
    }));
  }

  /**
   * Reliability over speed: always replays from a fresh load of the root
   * rather than trusting back-navigation to restore SPA state correctly
   * (per the architecture doc's guidance on authenticated/dynamic apps).
   */
  private async restoreTo(rootUrl: string, prefixPath: string[]): Promise<boolean> {
    try {
      this.manager.suppressNextNavigation();
      await this.page.goto(rootUrl, { waitUntil: "domcontentloaded" });
      await this.page.waitForTimeout(RESTORE_SETTLE_MS);
      for (const selector of prefixPath) {
        const activated = await this.clickSafely(selector);
        if (!activated) return false;
        await this.settle();
      }
      return true;
    } catch {
      return false;
    }
  }

  private async clickSafely(selector: string): Promise<boolean> {
    try {
      const locator = this.page.locator(selector).first();
      await locator.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
      await locator.click({ timeout: ACTION_TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  private async settle(): Promise<void> {
    await this.page.waitForTimeout(POST_ACTION_SETTLE_MS);
    await this.manager.waitForIdle();
  }
}
