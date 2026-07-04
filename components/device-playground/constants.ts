import type { LedConfig } from "./types";

export const DEVICE_W = 88;
export const DEVICE_H = 148;
export const TOTAL_DEVICES = 10;
export const MATCH_COUNT = 3;
export const OWNER_DEVICE_INDEX = 0;
export const DOCK_RADIUS = 180;
export const DOCK_MAX_SCALE = 1.35;
export const PLAYGROUND_PADDING = 24;
export const LED_IDLE_OPACITY = 0.15;
export const LED_PROXIMITY_RANGE = DOCK_RADIUS * 1.2;

export const DEVICE_LABELS = [
  "RM-01",
  "RM-02",
  "RM-03",
  "RM-04",
  "RM-05",
  "RM-06",
  "RM-07",
  "RM-08",
  "RM-09",
  "RM-10",
];

export function getLedConfig(matchScore: number): LedConfig {
  if (matchScore >= 85) {
    return { color: "#4ade80", minDuration: 0.06, maxDuration: 1.8 };
  }
  if (matchScore >= 72) {
    return { color: "#fbbf24", minDuration: 0.08, maxDuration: 2.0 };
  }
  return { color: "#60a5fa", minDuration: 0.1, maxDuration: 2.2 };
}

/** 距离 → GSAP timeline timeScale；越近越快，指数曲线拉开区分度 */
export function distanceToLedTimeScale(
  distance: number,
  config: LedConfig,
  mode: "idle" | "proximity",
): number {
  if (mode === "idle") {
    return 0.22;
  }

  const proximity = Math.max(0, Math.min(1, 1 - distance / LED_PROXIMITY_RANGE));
  const urgency = Math.pow(proximity, 2.4);

  const minScale = 0.35;
  const maxScale = 18 / config.minDuration;

  return minScale + urgency * (maxScale - minScale);
}

export function randomMatchScore(): number {
  return Math.floor(Math.random() * 39) + 60;
}

export function pickMatchableIndices(count: number, total: number): Set<number> {
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * total));
  }
  return indices;
}
