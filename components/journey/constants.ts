import { DEVICE_H, DEVICE_W } from "@/components/device-playground/constants";

export const JOURNEY_TIMINGS = {
  leftPanelExit: 0.4,
  tagBloomStart: 0.08,
  tagBloomBurstDuration: 0.34,
  tagBloomSettleDuration: 0.42,
  tagBloomStagger: 0.032,
  tagBloomRandomDelay: 0.14,
  tagBloomScaleMin: 2.2,
  tagBloomScaleMax: 4.4,
  /** 爆发落点区域（相对视口） */
  tagBurstPadX: 0.04,
  tagBurstPadTop: 0.05,
  /** 落点不超过 origin.y 之上多少 px（避免往手机下方飞） */
  tagBurstOriginClearance: 40,
  tagInjectGap: 0.05,
  tagInjectDuration: 0.68,
  tagInjectScale: 0.05,
  navigateAtMin: 2.05,
  navigateLead: 0.15,
  handoffDuration: 0.55,
  devicesEnterDuration: 0.45,
  devicesEnterStagger: 0.06,
  totalApprox: 2.8,
} as const;

export const JOURNEY_EASE = {
  out: "power2.inOut",
  burst: "power4.out",
  bloom: "sine.out",
  inject: "power3.in",
  enter: "power2.out",
} as const;

export const LANDING_VIEWPORT = {
  /** 主控设备 landing 点：水平居中，垂直 55% */
  xRatio: 0.5,
  yRatio: 0.55,
  width: DEVICE_W,
  height: DEVICE_H,
} as const;

export function computeLandingRect(viewportWidth: number, viewportHeight: number) {
  return {
    x: viewportWidth * LANDING_VIEWPORT.xRatio - LANDING_VIEWPORT.width / 2,
    y: viewportHeight * LANDING_VIEWPORT.yRatio - LANDING_VIEWPORT.height / 2,
    width: LANDING_VIEWPORT.width,
    height: LANDING_VIEWPORT.height,
  };
}

/** iPhone 14 逻辑分辨率 390×844 */
const IPHONE_LOGICAL_WIDTH = 390;
const IPHONE_LOGICAL_HEIGHT = 844;
const FRAME_BEZEL = 10;
const REFERENCE_OUTER_WIDTH = 320;
const ISLAND_TOP = 12;
const ISLAND_CLEARANCE = 10;
const HOME_BOTTOM = 10;
const HOME_CLEARANCE = 10;

export interface IphoneFrameSpec {
  outerWidth: number;
  outerHeight: number;
  screenWidth: number;
  screenHeight: number;
  contentHeight: number;
  safeTop: number;
  safeBottom: number;
  frameRadius: number;
  screenRadius: number;
  islandWidth: number;
  islandHeight: number;
  islandTop: number;
  homeIndicatorWidth: number;
  homeBottom: number;
}

function buildIphoneFrameSpec(outerWidth: number): IphoneFrameSpec {
  const scale = outerWidth / REFERENCE_OUTER_WIDTH;
  const screenWidth = outerWidth - FRAME_BEZEL * 2;
  const screenHeight = Math.round(screenWidth * (IPHONE_LOGICAL_HEIGHT / IPHONE_LOGICAL_WIDTH));
  const islandHeight = Math.round(26 * scale);
  const islandTop = Math.round(ISLAND_TOP * scale);
  const homeBottom = Math.round(HOME_BOTTOM * scale);
  const safeTop = islandTop + islandHeight + Math.round(ISLAND_CLEARANCE * scale);
  const safeBottom = homeBottom + 4 + Math.round(HOME_CLEARANCE * scale);
  const contentHeight = screenHeight - safeTop - safeBottom;

  return {
    outerWidth,
    outerHeight: screenHeight + FRAME_BEZEL * 2,
    screenWidth,
    screenHeight,
    contentHeight,
    safeTop,
    safeBottom,
    frameRadius: Math.round(44 * scale),
    screenRadius: Math.round(36 * scale),
    islandWidth: Math.round(96 * scale),
    islandHeight,
    islandTop,
    homeIndicatorWidth: Math.round(100 * scale),
    homeBottom,
  };
}

/** iPhone 预览框固定尺寸（px），比例按 iPhone 14 逻辑分辨率推导 */
export const IPHONE_FRAME = {
  /** Interest Lab 侧栏预览 */
  compact: buildIphoneFrameSpec(300),
  default: buildIphoneFrameSpec(320),
} as const;

export const IPHONE_FRAME_CHROME = {
  frameBezel: FRAME_BEZEL,
} as const;
