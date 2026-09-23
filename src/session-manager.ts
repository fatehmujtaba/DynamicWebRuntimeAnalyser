import type { Page } from "playwright";
import { BrowserManager } from "./browser/browser-manager.js";
import { SessionStore } from "./storage/session-store.js";
import { NetworkRecorder } from "./recorder/network-recorder.js";
import { ConsoleRecorder } from "./recorder/console-recorder.js";
import { InteractionRecorder, type RawInteraction } from "./recorder/interaction-recorder.js";
import { DomMutationRecorder, type RawMutationBatch } from "./recorder/dom-mutation-recorder.js";
import { CheckpointRecorder } from "./recorder/checkpoint-recorder.js";
import { makeId, makeSessionId } from "./util/ids.js";
import type { InteractionMeta, SessionSummary, StateCheckpoint } from "./types.js";

/** A mutation batch below this size (nodes added/removed + attribute changes) is treated as noise. */
const MUTATION_CHECKPOINT_THRESHOLD = 3;

export interface SessionManagerOptions {
  url: string;
  headless: boolean;
  dataRoot: string;
  storageStatePath?: string;
  checkpointDebounceMs?: number;
}

/**
 * Orchestrates a single recording session: owns the browser, wires the
 * recorders to it, and decides *when* to take expensive full-state
 * checkpoints (navigation, interaction, manual) versus lightweight
 * continuous logging (network, console, interaction events).
 */
export class SessionManager {
  readonly sessionId = makeSessionId();
  readonly store: SessionStore;
  private readonly browserManager = new BrowserManager();
  private checkpoints!: CheckpointRecorder;
  private currentState?: StateCheckpoint;
  private pendingCheckpointTimer?: NodeJS.Timeout;
  private pendingReason?: {
    trigger: StateCheckpoint["trigger"];
    triggerInteractionId?: string;
    targetSelector?: string;
  };
  private captureQueue: Promise<void> = Promise.resolve();
  private startedAt = 0;
  private ready = false;
  private suppressNextNavigationCheckpoint = false;

  constructor(private readonly options: SessionManagerOptions) {
    this.store = new SessionStore(this.sessionId, options.dataRoot);
  }

  async start(): Promise<Page> {
    await this.store.init();
    const { page, context } = await this.browserManager.launch({
      headless: this.options.headless,
      storageStatePath: this.options.storageStatePath,
    });
    this.checkpoints = new CheckpointRecorder(this.store);
    this.startedAt = Date.now();

    new NetworkRecorder(context, this.store, () => this.currentState?.id).attach();

    const consoleRecorder = new ConsoleRecorder(context, this.store);
    consoleRecorder.attach();
    consoleRecorder.attachToPage(page);

    const interactions = new InteractionRecorder(context, (sourcePage, raw) => {
      void this.handleInteraction(sourcePage, raw);
    });
    interactions.attachToAllPages();
    await interactions.attachToPage(page);

    const mutations = new DomMutationRecorder(context, (sourcePage, batch) => {
      void this.handleMutationBatch(sourcePage, batch);
    });
    mutations.attachToAllPages();
    await mutations.attachToPage(page);

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame() || !this.ready) return;
      if (this.suppressNextNavigationCheckpoint) {
        this.suppressNextNavigationCheckpoint = false;
        return;
      }
      this.scheduleCheckpoint(page, "navigation");
    });

    await page.goto(this.options.url, { waitUntil: "domcontentloaded" });
    this.currentState = await this.checkpoints.capture(page, "initial");
    this.ready = true;

    return page;
  }

  private async handleInteraction(page: Page, raw: RawInteraction): Promise<void> {
    const interaction: InteractionMeta = {
      id: makeId("int"),
      timestamp: Date.now(),
      type: raw.type,
      selector: raw.selector,
      tag: raw.tag,
      role: raw.role,
      ariaLabel: raw.ariaLabel,
      text: raw.text,
      fromStateId: this.currentState?.id,
      rectBefore: raw.rectBefore,
      styleBefore: raw.styleBefore,
    };
    await this.store.appendInteraction(interaction);
    this.scheduleCheckpoint(page, "interaction", interaction.id, raw.selector);
  }

  private async handleMutationBatch(page: Page, batch: RawMutationBatch): Promise<void> {
    const significance = batch.addedNodes + batch.removedNodes + batch.attributeChanges;
    await this.store.appendDomMutation({
      id: makeId("mut"),
      timestamp: Date.now(),
      windowMs: batch.windowMs,
      addedNodes: batch.addedNodes,
      removedNodes: batch.removedNodes,
      attributeChanges: batch.attributeChanges,
      sampleSelectors: batch.sampleSelectors,
    });
    // Below threshold is routine noise (a class toggle, a blinking cursor) — not worth a checkpoint.
    // Above it, schedule one on the shared debounce timer: if this batch followed a click/hover, it
    // coalesces into that checkpoint; if not, it's likely async/background content worth capturing on its own.
    if (significance >= MUTATION_CHECKPOINT_THRESHOLD) {
      this.scheduleCheckpoint(page, "mutation");
    }
  }

  /** Serializes checkpoint captures so `stop()` can await every in-flight one before exporting. */
  private enqueueCapture(fn: () => Promise<StateCheckpoint>): Promise<void> {
    this.captureQueue = this.captureQueue.then(async () => {
      try {
        this.currentState = await fn();
      } catch (err) {
        console.error("[session-manager] checkpoint failed:", err);
      }
    });
    return this.captureQueue;
  }

  /**
   * Debounces checkpoint capture so a burst of events (a click that triggers
   * a cascade of DOM mutations, or a click that triggers navigation) collapses
   * into one checkpoint. Merges rather than overwrites: a trailing "mutation"
   * signal never clobbers a more specific pending interaction/navigation
   * reason, and an interaction's `triggerInteractionId`/selector survive even
   * if a later navigation event updates the trigger label — otherwise a click
   * that causes navigation would lose its link to the resulting state in the
   * graph.
   */
  private scheduleCheckpoint(
    page: Page,
    trigger: StateCheckpoint["trigger"],
    triggerInteractionId?: string,
    targetSelector?: string,
  ): void {
    const prior = this.pendingReason;
    this.pendingReason = {
      trigger: trigger === "mutation" && prior && prior.trigger !== "mutation" ? prior.trigger : trigger,
      triggerInteractionId: triggerInteractionId ?? prior?.triggerInteractionId,
      targetSelector: targetSelector ?? prior?.targetSelector,
    };

    if (this.pendingCheckpointTimer) clearTimeout(this.pendingCheckpointTimer);
    this.pendingCheckpointTimer = setTimeout(() => {
      this.pendingCheckpointTimer = undefined;
      const reason = this.pendingReason!;
      this.pendingReason = undefined;
      this.enqueueCapture(() =>
        this.checkpoints.capture(page, reason.trigger, reason.triggerInteractionId, reason.targetSelector),
      );
    }, this.options.checkpointDebounceMs ?? 600);
  }

  async manualCheckpoint(): Promise<void> {
    const page = this.browserManager.page;
    if (!page) return;
    await this.enqueueCapture(() => this.checkpoints.capture(page, "manual"));
  }

  get currentStateId(): string | undefined {
    return this.currentState?.id;
  }

  /** The exploration engine calls this right before a restoration `goto()` so replaying old ground doesn't pollute the session with near-duplicate root checkpoints. */
  suppressNextNavigation(): void {
    this.suppressNextNavigationCheckpoint = true;
  }

  /** Waits for any pending debounced checkpoint (and its in-flight capture) to finish. Used by the exploration engine to know when a state has settled before fingerprinting it. */
  async waitForIdle(): Promise<void> {
    while (this.pendingCheckpointTimer) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await this.captureQueue;
  }

  async stop(): Promise<SessionSummary> {
    if (this.pendingCheckpointTimer) clearTimeout(this.pendingCheckpointTimer);
    await this.captureQueue;
    await this.browserManager.saveStorageState(this.store.authStatePath);
    const summary = await this.store.finalize(this.options.url, this.startedAt, this.options.headless);
    await this.browserManager.close();
    return summary;
  }
}
