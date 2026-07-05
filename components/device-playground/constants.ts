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
/** 圆形小屏直径 */
export const DEVICE_SCREEN_D = 85;
export const DEVICE_SCREEN_R = DEVICE_SCREEN_D / 2;
export const DEVICE_SHELL_RING = (DEVICE_D - DEVICE_SCREEN_D) / 2;
/** 屏外 LED 环外径（扣掉 bezel） */
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
/** 初始化布局时设备之间的最小间距 */
export const DEVICE_SPAWN_GAP = 16;
/** Matter.js 同组负值：设备彼此不碰撞，可自由叠放 */
export const DEVICE_COLLISION_GROUP = -1;
export const LED_IDLE_OPACITY = 0.04;
/** 匹配灯光有效距离：3 倍设备直径，超出则熄灭 */
export const LED_MATCH_RANGE = DEVICE_W * 3;
/** 暖琥珀信标色：暗色外壳上对比强，区别于 UI 里的青/绿语义 */
export const LED_COLOR = "#ffb020";
/** 碰一碰配对倒计时：常亮翠绿色，与近场琥珀频闪区分 */
export const LED_PAIRING_HOLD_COLOR = "#34d399";
export const LED_PULSE_BASE_CYCLE = 0.22;
export const LED_SMOOTHING = 0.09;

export const LED_CONFIG: LedConfig = {
  color: LED_COLOR,
  /** 最远有效距离：约 0.5 Hz 慢闪 */
  minDuration: 1.6,
  /** 紧贴时：约 6 Hz 急促频闪 */
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

/** 距离 → [0, 1]，0 为最远有效距离，1 为紧贴 */
export function distanceToProximity(distance: number): number {
  if (distance > LED_MATCH_RANGE) return 0;
  return Math.max(0, Math.min(1, 1 - distance / LED_MATCH_RANGE));
}

/** 距离 → 一次完整闪烁周期（秒）；越远越慢，曲线平缓 */
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

/** 距离 → 亮度 / 光晕强度 [0, 1] */
export function distanceToLedIntensity(distance: number): number {
  const proximity = distanceToProximity(distance);
  return Math.pow(proximity, 0.82);
}

export function isWithinLedMatchRange(distance: number): boolean {
  return distance <= LED_MATCH_RANGE;
}

/** 设备中心 → 目标中心，屏幕坐标系方位角（0°=上，顺时针） */
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
