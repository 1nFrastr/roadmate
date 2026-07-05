import type { InterestProfileSlice } from "@/components/interest-lab/types";
import type { TagSnapshot } from "@/components/tag-word-cloud/types";

export type { TagSnapshot };

export interface LandingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 标签 inject 落点（视口坐标，一般为 owner 设备屏幕中心） */
export interface InjectTarget {
  x: number;
  y: number;
}

export interface JourneyLandingPayload {
  landingRect: LandingRect;
  ownerDeviceId: string;
  tagNames: string[];
  ownerProfile?: InterestProfileSlice;
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
  header: HTMLElement;
  leftPanel: HTMLElement;
  previewAside: HTMLElement;
  iphoneFrame: HTMLElement;
  tagSnapshots: TagSnapshot[];
}

export const JOURNEY_STORAGE_KEY = "roadmate:journey-landing";
