import { mkdir, writeFile, appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ConsoleEvent,
  DomMutationEvent,
  InteractionMeta,
  NetworkEvent,
  SessionSummary,
  StateCheckpoint,
} from "../types.js";
import { ArtifactStore } from "./artifact-store.js";
import { buildStateGraph } from "../analysis/state-graph.js";
import { buildTimeline } from "../analysis/timeline.js";

/**
 * Owns the on-disk layout for a single recording session:
 *
 *   data/sessions/<id>/
 *     session.json         summary metadata (written on stop)
 *     states.json           all captured UI-state checkpoints
 *     interactions.jsonl     append-only interaction timeline
 *     network.jsonl          append-only network event log
 *     console.jsonl          append-only console/error log
 *     mutations.jsonl        append-only batched DOM-mutation log
 *     graph.json             derived: states as nodes, interactions as edges (written on stop)
 *     timeline.json          derived: every event kind merged chronologically (written on stop)
 *     states/<n>-<id>/dom.html, screenshot.png, element-snapshot.json
 *     resources/              content-addressed CSS/JS/HTML/image bodies
 *     .auth/storage-state.json  PRIVATE — never exported/summarized
 *     report.md               human-readable summary (written on stop)
 */
export class SessionStore {
  readonly dir: string;
  readonly artifacts: ArtifactStore;
  private readonly states: StateCheckpoint[] = [];
  private networkCount = 0;
  private interactionCount = 0;
  private consoleCount = 0;
  private mutationCount = 0;

  constructor(
    readonly sessionId: string,
    dataRoot: string,
  ) {
    this.dir = path.join(dataRoot, "sessions", sessionId);
    this.artifacts = new ArtifactStore(this.dir);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await mkdir(path.join(this.dir, "states"), { recursive: true });
    await mkdir(path.join(this.dir, ".auth"), { recursive: true });
    await this.artifacts.init();
  }

  get authStatePath(): string {
    return path.join(this.dir, ".auth", "storage-state.json");
  }

  stateDir(checkpoint: Pick<StateCheckpoint, "index" | "id">): string {
    return path.join(this.dir, "states", `${checkpoint.index}-${checkpoint.id}`);
  }

  async addState(checkpoint: StateCheckpoint): Promise<void> {
    this.states.push(checkpoint);
    await writeFile(path.join(this.dir, "states.json"), JSON.stringify(this.states, null, 2));
  }

  async appendInteraction(event: InteractionMeta): Promise<void> {
    this.interactionCount++;
    await appendFile(path.join(this.dir, "interactions.jsonl"), `${JSON.stringify(event)}\n`);
  }

  async appendNetworkEvent(event: NetworkEvent): Promise<void> {
    this.networkCount++;
    await appendFile(path.join(this.dir, "network.jsonl"), `${JSON.stringify(event)}\n`);
  }

  async appendConsoleEvent(event: ConsoleEvent): Promise<void> {
    this.consoleCount++;
    await appendFile(path.join(this.dir, "console.jsonl"), `${JSON.stringify(event)}\n`);
  }

  async appendDomMutation(event: DomMutationEvent): Promise<void> {
    this.mutationCount++;
    await appendFile(path.join(this.dir, "mutations.jsonl"), `${JSON.stringify(event)}\n`);
  }

  async finalize(url: string, startedAt: number, headless: boolean): Promise<SessionSummary> {
    const [interactions, networkEvents, consoleEvents, mutations] = await Promise.all([
      readJsonl<InteractionMeta>(path.join(this.dir, "interactions.jsonl")),
      readJsonl<NetworkEvent>(path.join(this.dir, "network.jsonl")),
      readJsonl<ConsoleEvent>(path.join(this.dir, "console.jsonl")),
      readJsonl<DomMutationEvent>(path.join(this.dir, "mutations.jsonl")),
    ]);

    const graph = buildStateGraph(this.states, interactions, networkEvents);
    const timeline = buildTimeline(this.states, interactions, networkEvents, consoleEvents, mutations);
    await writeFile(path.join(this.dir, "graph.json"), JSON.stringify(graph, null, 2));
    await writeFile(path.join(this.dir, "timeline.json"), JSON.stringify(timeline, null, 2));

    const summary: SessionSummary = {
      id: this.sessionId,
      url,
      startedAt,
      endedAt: Date.now(),
      browser: { name: "chromium", headless },
      counts: {
        states: this.states.length,
        interactions: this.interactionCount,
        networkEvents: this.networkCount,
        consoleEvents: this.consoleCount,
        domMutations: this.mutationCount,
        resources: this.artifacts.size,
      },
    };
    await this.artifacts.writeIndex();
    await writeFile(path.join(this.dir, "session.json"), JSON.stringify(summary, null, 2));
    await writeFile(path.join(this.dir, "report.md"), renderReport(summary, this.states, graph.edges.length));
    return summary;
  }
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const raw = await readFile(filePath, "utf-8").catch(() => "");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function renderReport(summary: SessionSummary, states: StateCheckpoint[], edgeCount: number): string {
  const durationSec = summary.endedAt ? ((summary.endedAt - summary.startedAt) / 1000).toFixed(1) : "?";
  const lines = [
    `# Session report: ${summary.id}`,
    "",
    `- URL: ${summary.url}`,
    `- Duration: ${durationSec}s`,
    `- UI states captured: ${summary.counts.states}`,
    `- Interactions recorded: ${summary.counts.interactions} (${edgeCount} linked to a resulting state)`,
    `- Network events: ${summary.counts.networkEvents}`,
    `- Console events: ${summary.counts.consoleEvents}`,
    `- DOM mutation batches: ${summary.counts.domMutations}`,
    `- Deduplicated resources: ${summary.counts.resources}`,
    "",
    "This report reflects only what was observed during this recording. ",
    "States that were never visited or elements that were never interacted with are not represented here.",
    "See graph.json for the full state graph and timeline.json for the merged chronological event stream.",
    "",
    "## States",
    "",
    ...states.map(
      (s) =>
        `${s.index}. [${s.trigger}] ${s.title || "(untitled)"} — ${s.url}\n   dom: ${s.domPath}\n   screenshot: ${s.screenshotPath}`,
    ),
  ];
  return lines.join("\n");
}
