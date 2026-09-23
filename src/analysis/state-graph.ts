import type { InteractionMeta, NetworkEvent, StateCheckpoint } from "../types.js";

export interface GraphNode {
  id: string;
  index: number;
  url: string;
  title: string;
  trigger: StateCheckpoint["trigger"];
  domPath: string;
  screenshotPath: string;
}

export interface GraphEdge {
  interactionId: string;
  type: InteractionMeta["type"];
  selector?: string;
  fromStateId?: string;
  toStateId?: string;
  timestamp: number;
  /** Requests observed within a small window around this interaction — temporal association only, not proven causation. */
  relatedNetworkEventIds: string[];
}

export interface StateGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const TEMPORAL_WINDOW_MS = 1000;

/**
 * Turns the flat, immutable per-event logs into the runtime state graph:
 * states as nodes, interactions as edges between the state they were
 * observed in and the state that resulted. This is what makes the recorded
 * session answerable ("what happens when you click Login?") instead of just
 * a pile of captured pages.
 */
export function buildStateGraph(
  states: StateCheckpoint[],
  interactions: InteractionMeta[],
  networkEvents: NetworkEvent[],
): StateGraph {
  const toStateByInteractionId = new Map<string, string>();
  for (const state of states) {
    if (state.triggerInteractionId) toStateByInteractionId.set(state.triggerInteractionId, state.id);
  }

  const nodes: GraphNode[] = states.map((s) => ({
    id: s.id,
    index: s.index,
    url: s.url,
    title: s.title,
    trigger: s.trigger,
    domPath: s.domPath,
    screenshotPath: s.screenshotPath,
  }));

  const edges: GraphEdge[] = interactions.map((interaction) => ({
    interactionId: interaction.id,
    type: interaction.type,
    selector: interaction.selector,
    fromStateId: interaction.fromStateId,
    toStateId: toStateByInteractionId.get(interaction.id),
    timestamp: interaction.timestamp,
    relatedNetworkEventIds: networkEvents
      .filter((n) => Math.abs(n.timestamp - interaction.timestamp) <= TEMPORAL_WINDOW_MS)
      .map((n) => n.id),
  }));

  return { nodes, edges };
}
