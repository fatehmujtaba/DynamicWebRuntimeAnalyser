export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A small, fixed subset of computed style properties — not the full CSSStyleDeclaration. */
export type ElementStyleSnapshot = Record<string, string>;

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
  /** Style/geometry of the target element captured client-side at the moment of interaction, before any resulting re-render. */
  rectBefore?: ElementRect;
  styleBefore?: ElementStyleSnapshot;
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
  viewport: Viewport;
  stylesheetHrefs: string[];
  /** Content-hash ids of inline <style> tag bodies, saved in the resources store. */
  inlineStyleHashes: string[];
  /** Present when this checkpoint was captured for a specific interaction target — computed style/geometry "after". */
  elementSnapshotPath?: string;
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
