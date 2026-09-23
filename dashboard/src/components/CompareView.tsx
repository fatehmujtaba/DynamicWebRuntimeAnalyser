import { useEffect, useState } from "react";
import { diffLines } from "diff";
import { fetchText, fileUrl } from "../api";
import type { StateCheckpoint } from "../types";

const MAX_DIFF_LINES = 600;

export default function CompareView({
  sessionId,
  states,
  compareIds,
}: {
  sessionId: string;
  states: StateCheckpoint[];
  compareIds: string[];
}) {
  const [a, b] = compareIds.map((id) => states.find((s) => s.id === id)).filter((s): s is StateCheckpoint => !!s);
  const [tab, setTab] = useState<"screenshots" | "dom-diff" | "css-diff">("screenshots");

  if (!a || !b) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-gray-800 px-2">
        {(["screenshots", "dom-diff", "css-diff"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium uppercase tracking-wide ${
              tab === t ? "border-b-2 border-blue-400 text-blue-300" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.replace("-", " ")}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "screenshots" && <ScreenshotsPane sessionId={sessionId} a={a} b={b} />}
        {tab === "dom-diff" && <DomDiffPane sessionId={sessionId} a={a} b={b} />}
        {tab === "css-diff" && <CssDiffPane a={a} b={b} />}
      </div>
    </div>
  );
}

function ScreenshotsPane({ sessionId, a, b }: { sessionId: string; a: StateCheckpoint; b: StateCheckpoint }) {
  return (
    <div className="grid h-full grid-cols-2 divide-x divide-gray-800">
      {[a, b].map((s) => (
        <div key={s.id} className="p-4">
          <div className="mb-2 text-xs text-gray-400">
            <span className="font-mono">
              {s.index}. [{s.trigger}]
            </span>{" "}
            {s.title || s.url}
          </div>
          <img src={fileUrl(sessionId, s.screenshotPath)} alt={s.title} className="w-full rounded border border-gray-800" />
          <dl className="mt-3 space-y-1 text-xs text-gray-500">
            <div>
              <dt className="inline text-gray-600">URL: </dt>
              <dd className="inline break-all">{s.url}</dd>
            </div>
            <div>
              <dt className="inline text-gray-600">Viewport: </dt>
              <dd className="inline">
                {s.viewport.width}×{s.viewport.height}
              </dd>
            </div>
            <div>
              <dt className="inline text-gray-600">Stylesheets: </dt>
              <dd className="inline">{s.stylesheetHrefs.length}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

function DomDiffPane({ sessionId, a, b }: { sessionId: string; a: StateCheckpoint; b: StateCheckpoint }) {
  const [diffLinesResult, setDiffLinesResult] = useState<{ value: string; added?: boolean; removed?: boolean }[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDiffLinesResult(undefined);
    setError(undefined);
    Promise.all([fetchText(fileUrl(sessionId, a.domPath)), fetchText(fileUrl(sessionId, b.domPath))])
      .then(([domA, domB]) => setDiffLinesResult(diffLines(domA, domB)))
      .catch((err) => setError(String(err)));
  }, [sessionId, a.domPath, b.domPath]);

  if (error) return <p className="p-4 text-sm text-red-400">{error}</p>;
  if (!diffLinesResult) return <p className="p-4 text-sm text-gray-500">Computing diff…</p>;

  const changedLineCount = diffLinesResult.filter((p) => p.added || p.removed).length;
  if (changedLineCount === 0) {
    return <p className="p-4 text-sm text-gray-500">No differences in the rendered DOM.</p>;
  }

  let rendered = 0;
  const rows: { text: string; kind: "added" | "removed" | "context" }[] = [];
  outer: for (const part of diffLinesResult) {
    const kind = part.added ? "added" : part.removed ? "removed" : "context";
    for (const line of part.value.split("\n")) {
      if (line === "" && part.value.endsWith("\n")) continue;
      rows.push({ text: line, kind });
      if (kind !== "context") rendered++;
      if (rendered > MAX_DIFF_LINES) break outer;
    }
  }

  return (
    <div className="p-4">
      <p className="mb-2 text-xs text-gray-500">
        {changedLineCount} changed lines between state {a.index} and state {b.index}
        {rendered > MAX_DIFF_LINES ? ` (showing first ${MAX_DIFF_LINES})` : ""}.
      </p>
      <pre className="whitespace-pre-wrap break-all rounded bg-gray-900 p-3 font-mono text-xs">
        {rows.map((row, i) => (
          <div
            key={i}
            className={
              row.kind === "added"
                ? "bg-emerald-950 text-emerald-300"
                : row.kind === "removed"
                  ? "bg-red-950 text-red-300"
                  : "text-gray-500"
            }
          >
            {row.kind === "added" ? "+ " : row.kind === "removed" ? "- " : "  "}
            {row.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

function CssDiffPane({ a, b }: { a: StateCheckpoint; b: StateCheckpoint }) {
  const hrefDiff = setDiff(a.stylesheetHrefs, b.stylesheetHrefs);
  const inlineDiff = setDiff(a.inlineStyleHashes, b.inlineStyleHashes);

  return (
    <div className="space-y-6 p-4 text-sm">
      <DiffList title="Linked stylesheets" diff={hrefDiff} />
      <DiffList title="Inline stylesheets (by content hash)" diff={inlineDiff} />
      {hrefDiff.added.length === 0 &&
        hrefDiff.removed.length === 0 &&
        inlineDiff.added.length === 0 &&
        inlineDiff.removed.length === 0 && <p className="text-gray-500">No CSS resource differences.</p>}
    </div>
  );
}

function DiffList({ title, diff }: { title: string; diff: { added: string[]; removed: string[] } }) {
  if (diff.added.length === 0 && diff.removed.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <ul className="space-y-1 font-mono text-xs">
        {diff.added.map((v) => (
          <li key={`add-${v}`} className="text-emerald-300">
            + {v}
          </li>
        ))}
        {diff.removed.map((v) => (
          <li key={`rem-${v}`} className="text-red-300">
            - {v}
          </li>
        ))}
      </ul>
    </section>
  );
}

function setDiff(a: string[], b: string[]): { added: string[]; removed: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    added: b.filter((v) => !setA.has(v)),
    removed: a.filter((v) => !setB.has(v)),
  };
}
