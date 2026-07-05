import { DEVICE_W } from "../constants";

export const DEVICE_DOCK_TRANSFORM_ORIGIN = "center center";
export const DEVICE_STAGE_TRANSFORM_ORIGIN = "center center";

/** 两设备圆盘重叠：中心距小于单台直径 */
export const PAIRING_OVERLAP_DISTANCE = DEVICE_W;

/** 配对倒计时中需拉远到此距离才取消（迟滞，避免边界抖动） */
export const PAIRING_OVERLAP_EXIT_DISTANCE = DEVICE_W * 1.08;

/** 重叠后保持接触多久触发匹配成功（毫秒） */
export const MATCH_CONFIRM_HOLD_MS = 1000;

/** Demo 用共同话题池（最多展示 3 条） */
export const PLACEHOLDER_MATCH_TOPICS = [
  "独立游戏",
  "黑胶唱片",
  "公路旅行",
  "精品咖啡",
  "胶片摄影",
  "City Walk",
  "科幻电影",
  "徒步露营",
] as const;

export function pickMatchTopics(count = 3): string[] {
  const pool = [...PLACEHOLDER_MATCH_TOPICS];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}
