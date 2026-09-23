import type { TimelineEntry } from "../types";

const KIND_STYLES: Record<TimelineEntry["kind"], string> = {
  state: "bg-blue-900/50 text-blue-300",
  interaction: "bg-purple-900/50 text-purple-300",
  network: "bg-emerald-900/50 text-emerald-300",
  console: "bg-amber-900/50 text-amber-300",
  mutation: "bg-orange-900/50 text-orange-300",
};

export default function TimelineView({
  timeline,
  startedAt,
  onSelectState,
}: {
  timeline: TimelineEntry[];
  startedAt: number;
  onSelectState: (stateId: string) => void;
}) {
  if (timeline.length === 0) {
    return <p className="p-8 text-sm text-gray-500">No events recorded.</p>;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 text-xs text-gray-500">
        {timeline.length} events, merged chronologically. Click a state entry to open it.
      </p>
      <ol className="space-y-1">
        {timeline.map((entry, i) => {
          const relativeMs = entry.timestamp - startedAt;
          const clickable = entry.kind === "state";
          return (
            <li
              key={`${entry.kind}-${entry.id}-${i}`}
              onClick={clickable ? () => onSelectState(entry.id) : undefined}
              className={`flex items-baseline gap-3 rounded px-2 py-1 text-xs ${
                clickable ? "cursor-pointer hover:bg-gray-900" : ""
              }`}
            >
              <span className="w-16 flex-shrink-0 text-right font-mono text-gray-600">
                +{(relativeMs / 1000).toFixed(2)}s
              </span>
              <span className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono uppercase ${KIND_STYLES[entry.kind]}`}>
                {entry.kind}
              </span>
              <span className="truncate text-gray-300" title={entry.summary}>
                {entry.summary}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
