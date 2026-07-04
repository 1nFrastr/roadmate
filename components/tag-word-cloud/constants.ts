export const TAG_SIZE = {
  minWidth: 44,
  maxWidth: 280,
  minHeight: 44,
  maxHeight: 140,
  minFont: 11,
  maxFont: 40,
  paddingX: 14,
  charWidth: 8,
  minDiameter: 56,
  maxDiameter: 168,
  maxDiameterCap: 168,
} as const;

export const TAG_SIZE_COMPACT = {
  minFont: 10,
  maxFont: 26,
  paddingX: 11,
  charWidth: 7,
  minDiameter: 38,
  maxDiameter: 102,
  maxDiameterCap: 102,
} as const;

export type TagSizePreset = "default" | "compact";

export const TAG_SIZE_BY_PRESET = {
  default: TAG_SIZE,
  compact: TAG_SIZE_COMPACT,
} as const;

export const PHYSICS = {
  gravityY: 1.4,
  gravityScale: 0.0014,
  defaultHeight: 520,
} as const;

export const CANVAS_PADDING = 24;
export const SPAWN_GAP = 12;

/** 自定义标签滑轨权重范围，与绝对尺寸映射一致 */
export const CUSTOM_TAG_WEIGHT_MIN = 0.15;
export const CUSTOM_TAG_WEIGHT_MAX = 1;
