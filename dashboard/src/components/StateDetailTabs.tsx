import { useEffect, useState } from "react";
import { fetchText, fileUrl } from "../api";
import type { InteractionMeta, NetworkEvent, ResourceIndex, StateCheckpoint } from "../types";

type Tab = "screenshot" | "dom" | "css" | "network" | "events";
const TABS: Tab[] = ["screenshot", "dom", "css", "network", "events"];

interface ElementSnapshot {
  selector: string;
  rectAfter: { x: number; y: number; width: number; height: number };
  styleAfter: Record<string, string>;
}

export default function StateDetailTabs({
  sessionId,
  state,
  interactions,
  network,
  resourceIndex,
}: {
  sessionId: string;
  state: StateCheckpoint;
  interactions: InteractionMeta[];
  network: NetworkEvent[];
  resourceIndex: ResourceIndex;
}) {
  const [tab, setTab] = useState<Tab>("screenshot");

  const outgoing = interactions.filter((i) => i.fromStateId === state.id);
  const originating = interactions.find((i) => i.id === state.triggerInteractionId);
  const relatedNetwork = network.filter((n) => n.nearestStateId === state.id);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-gray-800 px-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium uppercase tracking-wide ${
              tab === t ? "border-b-2 border-blue-400 text-blue-300" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab === "screenshot" && <ScreenshotTab sessionId={sessionId} state={state} />}
        {tab === "dom" && <DomTab sessionId={sessionId} state={state} />}
        {tab === "css" && (
          <CssTab sessionId={sessionId} state={state} resourceIndex={resourceIndex} originating={originating} />
        )}
        {tab === "network" && <NetworkTab events={relatedNetwork} />}
        {tab === "events" && <EventsTab outgoing={outgoing} originating={originating} />}
      </div>
    </div>
  );
}

function ScreenshotTab({ sessionId, state }: { sessionId: string; state: StateCheckpoint }) {
  return (
    <div>
      <div className="mb-2 text-xs text-gray-500">
        {state.viewport.width}×{state.viewport.height} · {state.url}
      </div>
      <img
        src={fileUrl(sessionId, state.screenshotPath)}
        alt={state.title}
        className="max-w-full rounded border border-gray-800"
      />
    </div>
  );
}

function DomTab({ sessionId, state }: { sessionId: string; state: StateCheckpoint }) {
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setHtml(undefined);
    setError(undefined);
    fetchText(fileUrl(sessionId, state.domPath))
      .then(setHtml)
      .catch((err) => setError(String(err)));
  }, [sessionId, state.domPath]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (html === undefined) return <p className="text-sm text-gray-500">Loading…</p>;

  const MAX = 200_000;
  const truncated = html.length > MAX;
  return (
    <div>
      {truncated && <p className="mb-2 text-xs text-amber-400">Showing first {MAX.toLocaleString()} characters.</p>}
      <pre className="whitespace-pre-wrap break-all rounded bg-gray-900 p-3 font-mono text-xs text-gray-300">
        {truncated ? html.slice(0, MAX) : html}
      </pre>
    </div>
  );
}

function CssTab({
  sessionId,
  state,
  resourceIndex,
  originating,
}: {
  sessionId: string;
  state: StateCheckpoint;
  resourceIndex: ResourceIndex;
  originating?: InteractionMeta;
}) {
  const [snapshot, setSnapshot] = useState<ElementSnapshot | undefined>();

  useEffect(() => {
    setSnapshot(undefined);
    if (!state.elementSnapshotPath) return;
    fetchText(fileUrl(sessionId, state.elementSnapshotPath))
      .then((raw) => setSnapshot(JSON.parse(raw) as ElementSnapshot))
      .catch(() => setSnapshot(undefined));
  }, [sessionId, state.elementSnapshotPath]);

  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Linked stylesheets</h3>
        {state.stylesheetHrefs.length === 0 ? (
          <p className="text-gray-500">None</p>
        ) : (
          <ul className="space-y-1">
            {state.stylesheetHrefs.map((href) => (
              <li key={href} className="truncate font-mono text-xs text-gray-300">
                {href}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Inline stylesheets ({state.inlineStyleHashes.length})
        </h3>
        {state.inlineStyleHashes.length === 0 ? (
          <p className="text-gray-500">None</p>
        ) : (
          <div className="space-y-2">
            {state.inlineStyleHashes.map((hash) => (
              <InlineStylePreview key={hash} sessionId={sessionId} hash={hash} resourceIndex={resourceIndex} />
            ))}
          </div>
        )}
      </section>

      {(originating?.styleBefore || snapshot) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Computed style: before → after
          </h3>
          <p className="mb-2 text-xs text-gray-500">
            Target: <span className="font-mono">{originating?.selector ?? snapshot?.selector}</span>
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="border-b border-gray-800 pb-1 pr-4">Property</th>
                <th className="border-b border-gray-800 pb-1 pr-4">Before</th>
                <th className="border-b border-gray-800 pb-1">After</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(originating?.styleBefore ?? snapshot?.styleAfter ?? {}).map((prop) => {
                const before = originating?.styleBefore?.[prop];
                const after = snapshot?.styleAfter?.[prop];
                const changed = before !== undefined && after !== undefined && before !== after;
                return (
                  <tr key={prop} className={changed ? "text-amber-300" : "text-gray-300"}>
                    <td className="py-0.5 pr-4 font-mono text-gray-500">{prop}</td>
                    <td className="py-0.5 pr-4 font-mono">{before ?? "—"}</td>
                    <td className="py-0.5 font-mono">{after ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function InlineStylePreview({
  sessionId,
  hash,
  resourceIndex,
}: {
  sessionId: string;
  hash: string;
  resourceIndex: ResourceIndex;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>();
  const entry = resourceIndex[hash];

  const toggle = () => {
    setOpen((v) => !v);
    if (!text && entry) fetchText(fileUrl(sessionId, entry.path)).then(setText);
  };

  return (
    <div className="rounded border border-gray-800">
      <button onClick={toggle} className="w-full px-3 py-1.5 text-left font-mono text-xs text-gray-400 hover:bg-gray-900">
        {hash} {entry ? `(${entry.bytes} bytes)` : ""} {open ? "▾" : "▸"}
      </button>
      {open && (
        <pre className="whitespace-pre-wrap break-all border-t border-gray-800 bg-gray-900 p-3 font-mono text-xs text-gray-300">
          {text ?? "Loading…"}
        </pre>
      )}
    </div>
  );
}

function NetworkTab({ events }: { events: NetworkEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-gray-500">No network activity recorded around this state.</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="border-b border-gray-800 pb-1 pr-3">Method</th>
          <th className="border-b border-gray-800 pb-1 pr-3">Status</th>
          <th className="border-b border-gray-800 pb-1 pr-3">Type</th>
          <th className="border-b border-gray-800 pb-1 pr-3">Duration</th>
          <th className="border-b border-gray-800 pb-1">URL</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="text-gray-300">
            <td className="py-1 pr-3 font-mono">{e.method}</td>
            <td className="py-1 pr-3 font-mono">{e.status ?? "—"}</td>
            <td className="py-1 pr-3">{e.resourceType}</td>
            <td className="py-1 pr-3">{e.durationMs ? `${e.durationMs}ms` : "—"}</td>
            <td className="max-w-md truncate py-1 font-mono" title={e.url}>
              {e.url}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventsTab({ outgoing, originating }: { outgoing: InteractionMeta[]; originating?: InteractionMeta }) {
  return (
    <div className="space-y-6 text-sm">
      {originating && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Caused by</h3>
          <InteractionRow interaction={originating} />
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Interactions observed in this state ({outgoing.length})
        </h3>
        {outgoing.length === 0 ? (
          <p className="text-gray-500">None recorded.</p>
        ) : (
          <div className="space-y-2">
            {outgoing.map((i) => (
              <InteractionRow key={i.id} interaction={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InteractionRow({ interaction }: { interaction: InteractionMeta }) {
  return (
    <div className="rounded border border-gray-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs uppercase text-blue-300">
          {interaction.type}
        </span>
        {interaction.selector && <span className="font-mono text-xs text-gray-400">{interaction.selector}</span>}
      </div>
      {interaction.text && <p className="mt-1 truncate text-xs text-gray-500">"{interaction.text}"</p>}
    </div>
  );
}
