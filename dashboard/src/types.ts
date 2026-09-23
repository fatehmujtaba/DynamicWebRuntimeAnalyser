// Mirrors the shapes written by the analyzer backend (src/types.ts, src/analysis/*)
// Kept as a plain duplicate rather than a cross-package import so the dashboard
// stays a self-contained Vite project with its own tsconfig.

export interface SessionSummary {
  id: string;
  url: string;
  startedAt: number;
  endedAt?: number;
  browser: { name: string; headless: boolean };
  counts: {
    states: number;
    interactions: number;
    networkEvents: number;
    consoleEvents: number;
    domMutations: number;
    resources: number;
  };
}

export interface StateCheckpoint {
  id: string;
  index: number;
  timestamp: number;
  url: string;
  title: string;
  trigger: "initial" | "navigation" | "interaction" | "manual" | "mutation";
  triggerInteractionId?: string;
  domPath: string;
  screenshotPath: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  stylesheetHrefs: string[];
  inlineStyleHashes: string[];
  elementSnapshotPath?: string;
}

export interface InteractionMeta {
  id: string;
  timestamp: number;
  type: "click" | "input" | "hover" | "keydown" | "navigation" | "manual";
  selector?: string;
  tag?: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  fromStateId?: string;
  rectBefore?: { x: number; y: number; width: number; height: number };
  styleBefore?: Record<string, string>;
}

export interface NetworkEvent {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyArtifact?: string;
  durationMs?: number;
  nearestStateId?: string;
}

export interface ConsoleEvent {
  id: string;
  timestamp: number;
  level: string;
  text: string;
  location?: string;
}

export interface DomMutationEvent {
  id: string;
  timestamp: number;
  windowMs: number;
  addedNodes: number;
  removedNodes: number;
  attributeChanges: number;
  sampleSelectors: string[];
}

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
  relatedNetworkEventIds: string[];
}

export interface StateGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TimelineEntry {
  timestamp: number;
  kind: "state" | "interaction" | "network" | "console" | "mutation";
  id: string;
  summary: string;
}

export interface ExplorationLogEntry {
  taskId: string;
  depth: number;
  selectorPath: string[];
  candidate: {
    selector: string;
    tag: string;
    role?: string;
    ariaLabel?: string;
    text?: string;
    kind: string;
    href?: string;
    hostname?: string;
    isFormSubmit: boolean;
  };
  outcome: "explored" | "skipped" | "failed" | "duplicate";
  reason?: string;
  resultingStateId?: string;
}

export interface ExplorationReport {
  rootUrl: string;
  boundaries: {
    allowedDomains: string[];
    maxDepth: number;
    maxActions: number;
    allowFormSubmission: boolean;
  };
  totalActionsAttempted: number;
  discoveredStateCount: number;
  entries: ExplorationLogEntry[];
}

export interface ResourceIndexEntry {
  path: string;
  contentType: string;
  bytes: number;
  truncated: boolean;
  relatedTo?: string;
}

export type ResourceIndex = Record<string, ResourceIndexEntry>;
