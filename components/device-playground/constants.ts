import type { DeviceState, LedConfig } from "./types";

export function devicesMatch(a: DeviceState, b: DeviceState): boolean {
  if (a.id === b.id) return false;
  return (a.isOwner && b.matchable) || (b.isOwner && a.matchable);
}

export function isMatchParticipant(device: DeviceState): boolean {
  return device.isOwner || device.matchable;
}

export const DEVICE_D = 120;
export const DEVICE_W = DEVICE_D;
export const DEVICE_H = DEVICE_D;
export const DEVICE_R = DEVICE_D / 2;
/** Circular screen diameter */
export const DEVICE_SCREEN_D = 85;
export const DEVICE_SCREEN_R = DEVICE_SCREEN_D / 2;
export const DEVICE_SHELL_RING = (DEVICE_D - DEVICE_SCREEN_D) / 2;
/** Outer LED ring diameter beyond the screen (excluding bezel) */
export const DEVICE_RING_BEZEL = 4;
export const DEVICE_RING_OUTER = DEVICE_R - DEVICE_RING_BEZEL;
export const DEVICE_LED_STROKE = 3;
export const DEVICE_OWNER_HALO_INSET = 5;
export const TOTAL_DEVICES = 10;
export const MATCH_COUNT = 3;
export const OWNER_DEVICE_INDEX = 0;
export const DOCK_RADIUS = 225;
export const DOCK_MAX_SCALE = 1.35;
export const PLAYGROUND_PADDING = 24;
/** Minimum spacing between devices in the initial layout */
export const DEVICE_SPAWN_GAP = 16;
/** Matter.js same-group negative value: devices do not collide and may freely overlap */
export const DEVICE_COLLISION_GROUP = -1;
export const LED_IDLE_OPACITY = 0.04;
/** Match light effective range: 3× device diameter; beyond that LEDs turn off */
export const LED_MATCH_RANGE = DEVICE_W * 3;
/** Warm amber beacon: strong contrast on dark shells, distinct from cyan/green UI semantics */
export const LED_COLOR = "#ffb020";
/** Tap-to-pair countdown: solid emerald, distinct from near-field amber strobe */
export const LED_PAIRING_HOLD_COLOR = "#34d399";
export const LED_PULSE_BASE_CYCLE = 0.22;
export const LED_SMOOTHING = 0.09;

export const LED_CONFIG: LedConfig = {
  color: LED_COLOR,
  /** Farthest effective distance: ~0.5 Hz slow blink */
  minDuration: 1.6,
  /** Touching: ~6 Hz rapid strobe */
  maxDuration: 0.11,
};

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

/** Distance → [0, 1], where 0 is farthest effective range and 1 is touching */
export function distanceToProximity(distance: number): number {
  if (distance > LED_MATCH_RANGE) return 0;
  return Math.max(0, Math.min(1, 1 - distance / LED_MATCH_RANGE));
}

/** Distance → full blink period (seconds); farther = slower, gentle curve */
export function distanceToCycleDuration(distance: number): number {
  const proximity = distanceToProximity(distance);
  const urgency = Math.pow(proximity, 1.25);

  return (
    LED_CONFIG.minDuration -
    urgency * (LED_CONFIG.minDuration - LED_CONFIG.maxDuration)
  );
}

export function distanceToLedTimeScale(distance: number): number {
  return LED_PULSE_BASE_CYCLE / distanceToCycleDuration(distance);
}

/** Distance → brightness / glow intensity [0, 1] */
export function distanceToLedIntensity(distance: number): number {
  const proximity = distanceToProximity(distance);
  return Math.pow(proximity, 0.82);
}

export function isWithinLedMatchRange(distance: number): boolean {
  return distance <= LED_MATCH_RANGE;
}

/** Bearing from device center to target center in screen coords (0° = up, clockwise) */
export function bearingBetweenCenters(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export function randomMatchScore(): number {
  return Math.floor(Math.random() * 39) + 60;
}

export function pickMatchableIndices(
  count: number,
  total: number,
  excludeIndex: number = OWNER_DEVICE_INDEX,
): Set<number> {
  const indices = new Set<number>();
  const maxCount = Math.min(count, Math.max(0, total - 1));
  while (indices.size < maxCount) {
    const candidate = Math.floor(Math.random() * total);
    if (candidate === excludeIndex) continue;
    indices.add(candidate);
  }
  return indices;
}
