import { useMemo } from "react";
import { ReactFlow, Background, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StateGraph } from "../types";

const LEVEL_X = 240;
const ROW_Y = 110;

function layout(graph: StateGraph): { level: number; row: number }[] {
  const idToIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const children = new Map<number, number[]>();
  const hasIncoming = new Set<number>();

  for (const edge of graph.edges) {
    if (!edge.fromStateId || !edge.toStateId) continue;
    const from = idToIndex.get(edge.fromStateId);
    const to = idToIndex.get(edge.toStateId);
    if (from === undefined || to === undefined || from === to) continue;
    if (!children.has(from)) children.set(from, []);
    children.get(from)!.push(to);
    hasIncoming.add(to);
  }

  const level = new Array(graph.nodes.length).fill(-1);
  const roots = graph.nodes.map((_, i) => i).filter((i) => !hasIncoming.has(i));
  const queue: number[] = roots.length > 0 ? roots : [0];
  for (const r of queue) level[r] = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of children.get(current) ?? []) {
      if (level[child] !== -1) continue;
      level[child] = level[current] + 1;
      queue.push(child);
    }
  }

  // Anything unreached (disconnected components) gets appended after the deepest level.
  const maxLevel = Math.max(0, ...level.filter((l) => l >= 0));
  for (let i = 0; i < level.length; i++) {
    if (level[i] === -1) level[i] = maxLevel + 1;
  }

  const rowCounters = new Map<number, number>();
  return level.map((lvl) => {
    const row = rowCounters.get(lvl) ?? 0;
    rowCounters.set(lvl, row + 1);
    return { level: lvl, row };
  });
}

export default function GraphView({
  graph,
  selectedStateId,
  onSelect,
}: {
  graph: StateGraph;
  selectedStateId?: string;
  onSelect: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const positions = layout(graph);
    const nodes: Node[] = graph.nodes.map((n, i) => ({
      id: n.id,
      position: { x: positions[i].level * LEVEL_X, y: positions[i].row * ROW_Y },
      data: { label: `${n.index}. [${n.trigger}] ${n.title || n.url}` },
      style: {
        border: n.id === selectedStateId ? "2px solid #60a5fa" : "1px solid #374151",
        background: "#111827",
        color: "#e5e7eb",
        fontSize: 12,
        borderRadius: 8,
        padding: 8,
        width: 200,
      },
    }));

    const edges: Edge[] = graph.edges
      .filter((e) => e.fromStateId && e.toStateId)
      .map((e) => ({
        id: e.interactionId,
        source: e.fromStateId!,
        target: e.toStateId!,
        label: e.type + (e.selector ? `: ${e.selector.split(">").pop()?.trim()}` : ""),
        style: { stroke: "#4b5563" },
        labelStyle: { fill: "#9ca3af", fontSize: 10 },
        animated: false,
      }));

    return { nodes, edges };
  }, [graph, selectedStateId]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_evt, node) => onSelect(node.id)}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1f2937" gap={24} />
      </ReactFlow>
    </div>
  );
}
