import type { DeviceState } from "../types";

export type PairingPhase = "idle" | "ready" | "holding" | "success";

export interface MatchedPair {
  owner: DeviceState;
  partner: DeviceState;
  matchScore: number;
  topics: string[];
}

export interface PairingAnchor {
  x: number;
  y: number;
}

export interface DeviceTransformSnapshot {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

export interface PairSuccessRestoreSnapshot {
  devices: Map<string, DeviceTransformSnapshot>;
  header: { opacity: number; y: number } | null;
  playgroundBackground: string;
}
