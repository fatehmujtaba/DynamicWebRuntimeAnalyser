import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fileUrl,
  getConsole,
  getExplorationReport,
  getGraph,
  getInteractions,
  getMutations,
  getNetwork,
  getResourceIndex,
  getStates,
  getSummary,
} from "../api";
import type {
  ConsoleEvent,
  DomMutationEvent,
  ExplorationReport,
  InteractionMeta,
  NetworkEvent,
  ResourceIndex,
  SessionSummary,
  StateCheckpoint,
  StateGraph,
} from "../types";
import GraphView from "../components/GraphView";
import StateDetailTabs from "../components/StateDetailTabs";
import CompareView from "../components/CompareView";

type SidebarMode = "list" | "graph";

export default function SessionView() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id!;

  const [summary, setSummary] = useState<SessionSummary>();
  const [graph, setGraph] = useState<StateGraph>();
  const [states, setStates] = useState<StateCheckpoint[]>();
  const [interactions, setInteractions] = useState<InteractionMeta[]>([]);
  const [network, setNetwork] = useState<NetworkEvent[]>([]);
  const [consoleEvents, setConsoleEvents] = useState<ConsoleEvent[]>([]);
  const [mutations, setMutations] = useState<DomMutationEvent[]>([]);
  const [resourceIndex, setResourceIndex] = useState<ResourceIndex>({});
  const [explorationReport, setExplorationReport] = useState<ExplorationReport | undefined>();

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("list");
  const [selectedId, setSelectedId] = useState<string>();
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showExplorationReport, setShowExplorationReport] = useState(false);

  useEffect(() => {
    getSummary(sessionId).then(setSummary);
    getGraph(sessionId).then(setGraph);
    getStates(sessionId).then((s) => {
      setStates(s);
      setSelectedId((prev) => prev ?? s[0]?.id);
    });
    getInteractions(sessionId).then(setInteractions);
    getNetwork(sessionId).then(setNetwork);
    getConsole(sessionId).then(setConsoleEvents);
    getMutations(sessionId).then(setMutations);
    getResourceIndex(sessionId).then(setResourceIndex);
    getExplorationReport(sessionId).then(setExplorationReport);
  }, [sessionId]);

  const selectedState = useMemo(() => states?.find((s) => s.id === selectedId), [states, selectedId]);

  const toggleCompare = (stateId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(stateId)) return prev.filter((x) => x !== stateId);
      if (prev.length >= 2) return [prev[1], stateId];
      return [...prev, stateId];
    });
  };

  if (!summary || !states || !graph) {
    return <p className="p-8 text-sm text-gray-500">Loading session…</p>;
  }

  const consoleErrorCount = consoleEvents.filter((c) => c.level === "error" || c.level === "exception").length;

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-800 px-6 py-4">
        <Link to="/" className="text-xs text-gray-500 hover:text-gray-300">
          ← Sessions
        </Link>
        <div className="mt-1 flex items-baseline justify-between">
          <div>
            <h1 className="font-mono text-sm text-gray-200">{sessionId}</h1>
            <p className="text-xs text-gray-500">{summary.url}</p>
          </div>
          <div className="flex gap-6 text-center">
            <Stat label="UI states" value={summary.counts.states} />
            <Stat label="Interactions" value={summary.counts.interactions} />
            <Stat label="API calls" value={summary.counts.networkEvents} />
            <Stat label="Mutations" value={summary.counts.domMutations} />
            {consoleErrorCount > 0 && <Stat label="Console errors" value={consoleErrorCount} tone="warn" />}
          </div>
        </div>
        {explorationReport && (
          <button
            onClick={() => setShowExplorationReport((v) => !v)}
            className="mt-2 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
          >
            Exploration report: {explorationReport.totalActionsAttempted} actions attempted{" "}
            {showExplorationReport ? "▾" : "▸"}
          </button>
        )}
        {showExplorationReport && explorationReport && <ExplorationSummary report={explorationReport} />}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 flex-col border-r border-gray-800">
          <div className="flex items-center justify-between gap-2 border-b border-gray-800 p-2">
            <div className="flex gap-1">
              <TabButton active={sidebarMode === "list"} onClick={() => setSidebarMode("list")}>
                States
              </TabButton>
              <TabButton active={sidebarMode === "graph"} onClick={() => setSidebarMode("graph")}>
                Graph
              </TabButton>
            </div>
            <button
              onClick={() => setCompareMode((v) => !v)}
              className={`rounded px-2 py-1 text-xs ${compareMode ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              Compare
            </button>
          </div>

          {sidebarMode === "graph" ? (
            <div className="min-h-0 flex-1">
              <GraphView graph={graph} selectedStateId={selectedId} onSelect={setSelectedId} />
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-auto p-2">
              {states.map((s) => (
                <li key={s.id} className="mb-2">
                  <div
                    className={`flex cursor-pointer items-center gap-2 rounded border p-2 ${
                      selectedId === s.id ? "border-blue-500 bg-blue-950/30" : "border-gray-800 hover:border-gray-600"
                    }`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    {compareMode && (
                      <input
                        type="checkbox"
                        checked={compareIds.includes(s.id)}
                        onChange={() => toggleCompare(s.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <img
                      src={fileUrl(sessionId, s.screenshotPath)}
                      alt=""
                      className="h-10 w-16 flex-shrink-0 rounded border border-gray-800 object-cover object-top"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs text-gray-200">{s.title || s.url}</div>
                      <div className="text-[10px] uppercase tracking-wide text-gray-500">
                        {s.index}. {s.trigger}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="min-h-0 flex-1">
          {compareMode && compareIds.length === 2 ? (
            <CompareView sessionId={sessionId} states={states} compareIds={compareIds} />
          ) : selectedState ? (
            <StateDetailTabs
              sessionId={sessionId}
              state={selectedState}
              interactions={interactions}
              network={network}
              resourceIndex={resourceIndex}
            />
          ) : (
            <p className="p-8 text-sm text-gray-500">
              {compareMode ? "Select two states in the sidebar to compare." : "Select a state."}
            </p>
          )}
        </main>
      </div>

      {mutations.length > 0 && (
        <footer className="border-t border-gray-800 px-6 py-1 text-[11px] text-gray-600">
          {mutations.length} DOM mutation batches observed during this session.
        </footer>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div>
      <div className={`text-lg font-semibold ${tone === "warn" ? "text-amber-400" : "text-gray-100"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
    >
      {children}
    </button>
  );
}

function ExplorationSummary({ report }: { report: ExplorationReport }) {
  const byOutcome = (outcome: string) => report.entries.filter((e) => e.outcome === outcome);
  return (
    <div className="mt-2 max-h-48 overflow-auto rounded border border-gray-800 p-3 text-xs">
      <p className="text-gray-500">
        domains=[{report.boundaries.allowedDomains.join(", ")}] maxDepth={report.boundaries.maxDepth} maxActions=
        {report.boundaries.maxActions} allowFormSubmission={String(report.boundaries.allowFormSubmission)}
      </p>
      {(["explored", "duplicate", "skipped", "failed"] as const).map((outcome) => (
        <div key={outcome} className="mt-2">
          <p className="font-semibold uppercase tracking-wide text-gray-400">
            {outcome} ({byOutcome(outcome).length})
          </p>
          {byOutcome(outcome).map((e) => (
            <p key={e.taskId} className="truncate text-gray-500">
              {e.candidate.kind} "{e.candidate.text ?? e.candidate.selector}"{e.reason ? ` — ${e.reason}` : ""}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
