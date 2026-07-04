export interface TagSnapshot {
  id: string;
  name: string;
  rect: DOMRectReadOnly;
  hue: number;
  fontSize: number;
  weight: number;
}

export interface LandingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JourneyLandingPayload {
  landingRect: LandingRect;
  ownerDeviceId: string;
  tagNames: string[];
  startedAt: number;
}

export type JourneyPhase =
  | "idle"
  | "preparing"
  | "tags-inject"
  | "frame-morph"
  | "navigating"
  | "handoff"
  | "devices-enter"
  | "complete";

export interface JourneyTransitionSources {
  leftPanel: HTMLElement;
  iphoneFrame: HTMLElement;
  tagSnapshots: TagSnapshot[];
  injectPoint: { x: number; y: number };
}

export const JOURNEY_STORAGE_KEY = "roadmate:journey-landing";
