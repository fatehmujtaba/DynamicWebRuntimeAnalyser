import { fileUrl } from "../api";
import type { StateCheckpoint } from "../types";

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
  if (!a || !b) return null;

  return (
    <div className="grid h-full grid-cols-2 divide-x divide-gray-800 overflow-auto">
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
