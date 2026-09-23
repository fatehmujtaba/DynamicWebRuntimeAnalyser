import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSessions } from "../api";
import type { SessionSummary } from "../types";

export default function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    listSessions().then(setSessions).catch((err) => setError(String(err)));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold text-gray-100">Runtime Analyzer</h1>
      <p className="mt-1 text-sm text-gray-400">Recorded sessions in this analyzer's data directory.</p>

      {error && <p className="mt-6 text-sm text-red-400">Failed to load sessions: {error}</p>}
      {!sessions && !error && <p className="mt-6 text-sm text-gray-500">Loading…</p>}
      {sessions && sessions.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          No sessions yet. Run <code className="rounded bg-gray-800 px-1.5 py-0.5">npm run record -- &lt;url&gt;</code> or{" "}
          <code className="rounded bg-gray-800 px-1.5 py-0.5">npm run record -- explore &lt;url&gt;</code> to create one.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {sessions?.map((s) => (
          <li key={s.id}>
            <Link
              to={`/sessions/${s.id}`}
              className="block rounded-lg border border-gray-800 bg-gray-900/60 p-4 transition hover:border-gray-600 hover:bg-gray-900"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-200">{s.id}</span>
                <span className="text-xs text-gray-500">{s.startedAt ? new Date(s.startedAt).toLocaleString() : ""}</span>
              </div>
              <div className="mt-1 truncate text-sm text-gray-400">{s.url}</div>
              {s.counts && (
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>{s.counts.states} states</span>
                  <span>{s.counts.interactions} interactions</span>
                  <span>{s.counts.networkEvents} network</span>
                  <span>{s.counts.resources} resources</span>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
