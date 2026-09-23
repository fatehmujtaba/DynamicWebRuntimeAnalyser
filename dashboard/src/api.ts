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
  TimelineEntry,
} from "./types";

async function getJson<T>(url: string): Promise<T | undefined> {
  const res = await fetch(url);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export const listSessions = () => getJson<SessionSummary[]>("/api/sessions").then((v) => v ?? []);
export const getSummary = (id: string) => getJson<SessionSummary>(`/api/sessions/${id}/summary`);
export const getGraph = (id: string) => getJson<StateGraph>(`/api/sessions/${id}/graph`);
export const getStates = (id: string) => getJson<StateCheckpoint[]>(`/api/sessions/${id}/states`).then((v) => v ?? []);
export const getTimeline = (id: string) => getJson<TimelineEntry[]>(`/api/sessions/${id}/timeline`).then((v) => v ?? []);
export const getInteractions = (id: string) =>
  getJson<InteractionMeta[]>(`/api/sessions/${id}/interactions`).then((v) => v ?? []);
export const getNetwork = (id: string) => getJson<NetworkEvent[]>(`/api/sessions/${id}/network`).then((v) => v ?? []);
export const getConsole = (id: string) => getJson<ConsoleEvent[]>(`/api/sessions/${id}/console`).then((v) => v ?? []);
export const getMutations = (id: string) =>
  getJson<DomMutationEvent[]>(`/api/sessions/${id}/mutations`).then((v) => v ?? []);
export const getExplorationReport = (id: string) => getJson<ExplorationReport>(`/api/sessions/${id}/exploration-report`);
export const getResourceIndex = (id: string) =>
  getJson<ResourceIndex>(`/api/sessions/${id}/resources-index`).then((v) => v ?? {});

export const fileUrl = (sessionId: string, relPath: string) =>
  `/api/sessions/${sessionId}/file/${relPath.split("/").map(encodeURIComponent).join("/")}`;

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}
