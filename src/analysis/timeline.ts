import type { ConsoleEvent, DomMutationEvent, InteractionMeta, NetworkEvent, StateCheckpoint } from "../types.js";

export interface TimelineEntry {
  timestamp: number;
  kind: "state" | "interaction" | "network" | "console" | "mutation";
  id: string;
  summary: string;
}

/** Merges every recorded event kind into one chronological, human-scannable stream. */
export function buildTimeline(
  states: StateCheckpoint[],
  interactions: InteractionMeta[],
  networkEvents: NetworkEvent[],
  consoleEvents: ConsoleEvent[],
  mutations: DomMutationEvent[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...states.map((s) => ({
      timestamp: s.timestamp,
      kind: "state" as const,
      id: s.id,
      summary: `[${s.trigger}] ${s.title || s.url}`,
    })),
    ...interactions.map((i) => ({
      timestamp: i.timestamp,
      kind: "interaction" as const,
      id: i.id,
      summary: `${i.type} ${i.selector ?? ""}`.trim(),
    })),
    ...networkEvents.map((n) => ({
      timestamp: n.timestamp,
      kind: "network" as const,
      id: n.id,
      summary: `${n.method} ${n.status ?? "?"} ${n.url}`,
    })),
    ...consoleEvents.map((c) => ({
      timestamp: c.timestamp,
      kind: "console" as const,
      id: c.id,
      summary: `${c.level}: ${c.text}`,
    })),
    ...mutations.map((m) => ({
      timestamp: m.timestamp,
      kind: "mutation" as const,
      id: m.id,
      summary: `+${m.addedNodes}/-${m.removedNodes} nodes, ${m.attributeChanges} attr changes`,
    })),
  ];
  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries;
}
