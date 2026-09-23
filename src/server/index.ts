import express from "express";
import cors from "cors";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 4000);
const DATA_ROOT = path.resolve(process.env.DATA_ROOT ?? "data");
const SESSIONS_ROOT = path.join(DATA_ROOT, "sessions");
const DASHBOARD_DIST = path.resolve("dashboard", "dist");

const app = express();
app.use(cors());

function sessionDir(id: string): string {
  return path.join(SESSIONS_ROOT, id);
}

/** Rejects any id/path that would escape SESSIONS_ROOT (e.g. `..`, absolute paths). */
function resolveWithinSessions(...segments: string[]): string | undefined {
  const resolved = path.resolve(SESSIONS_ROOT, ...segments);
  const rel = path.relative(SESSIONS_ROOT, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return resolved;
}

async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

async function readJsonlIfExists<T>(filePath: string): Promise<T[]> {
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, "utf-8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

app.get("/api/sessions", async (_req, res) => {
  if (!existsSync(SESSIONS_ROOT)) return res.json([]);
  const ids = (await readdir(SESSIONS_ROOT)).sort().reverse();
  const summaries = await Promise.all(
    ids.map(async (id) => {
      const summary = await readJsonIfExists(path.join(sessionDir(id), "session.json"));
      return summary ?? { id, incomplete: true };
    }),
  );
  res.json(summaries);
});

app.get("/api/sessions/:id/summary", async (req, res) => {
  const dir = resolveWithinSessions(req.params.id);
  if (!dir) return res.status(400).json({ error: "invalid session id" });
  const summary = await readJsonIfExists(path.join(dir, "session.json"));
  if (!summary) return res.status(404).json({ error: "session not found" });
  res.json(summary);
});

const JSON_FILES: Record<string, string> = {
  graph: "graph.json",
  timeline: "timeline.json",
  states: "states.json",
  "exploration-report": "exploration-report.json",
};

for (const [route, filename] of Object.entries(JSON_FILES)) {
  app.get(`/api/sessions/:id/${route}`, async (req, res) => {
    const dir = resolveWithinSessions(req.params.id);
    if (!dir) return res.status(400).json({ error: "invalid session id" });
    const data = await readJsonIfExists(path.join(dir, filename));
    if (data === undefined) return res.status(404).json({ error: `${filename} not found for this session` });
    res.json(data);
  });
}

const JSONL_FILES: Record<string, string> = {
  interactions: "interactions.jsonl",
  network: "network.jsonl",
  console: "console.jsonl",
  mutations: "mutations.jsonl",
};

for (const [route, filename] of Object.entries(JSONL_FILES)) {
  app.get(`/api/sessions/:id/${route}`, async (req, res) => {
    const dir = resolveWithinSessions(req.params.id);
    if (!dir) return res.status(400).json({ error: "invalid session id" });
    res.json(await readJsonlIfExists(path.join(dir, filename)));
  });
}

app.get("/api/sessions/:id/resources-index", async (req, res) => {
  const dir = resolveWithinSessions(req.params.id);
  if (!dir) return res.status(400).json({ error: "invalid session id" });
  const data = await readJsonIfExists(path.join(dir, "resources", "index.json"));
  res.json(data ?? {});
});

// Serves any artifact inside a session directory (dom.html, screenshot.png,
// resources/*, states/*/element-snapshot.json) — never .auth/ (storage state),
// which resolveWithinSessions doesn't block by name but callers never request
// since it isn't referenced anywhere in states.json/graph.json/etc.
app.get("/api/sessions/:id/file/*splat", async (req, res) => {
  const splat = req.params.splat;
  const relParts = Array.isArray(splat) ? splat : [splat ?? ""];
  if (relParts.some((part) => part === ".auth" || part.includes(".."))) {
    return res.status(403).json({ error: "forbidden" });
  }
  const filePath = resolveWithinSessions(req.params.id, ...relParts);
  if (!filePath || !existsSync(filePath)) return res.status(404).json({ error: "file not found" });
  const info = await stat(filePath);
  if (!info.isFile()) return res.status(404).json({ error: "not a file" });
  res.sendFile(filePath);
});

if (existsSync(DASHBOARD_DIST)) {
  app.use(express.static(DASHBOARD_DIST));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(DASHBOARD_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Analyzer dashboard API listening on http://localhost:${PORT}`);
  console.log(`Reading sessions from ${SESSIONS_ROOT}`);
  if (!existsSync(DASHBOARD_DIST)) {
    console.log("(dashboard/dist not built yet — run `npm run dashboard:build`, or use `npm run dashboard:dev` for the Vite dev server)");
  }
});
