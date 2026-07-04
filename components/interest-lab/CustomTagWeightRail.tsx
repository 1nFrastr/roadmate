"use client";

import { type CSSProperties } from "react";
import { CUSTOM_TAG_WEIGHT_MAX, CUSTOM_TAG_WEIGHT_MIN } from "@/components/tag-word-cloud/constants";

interface CustomTagWeightRailProps {
  tagName: string;
  weight: number;
  onWeightChange: (weight: number) => void;
  onRemove: () => void;
  inScreen?: boolean;
}

/** iPhone 屏幕内滑轨占用高度（px） */
export const CUSTOM_TAG_RAIL_IN_SCREEN_HEIGHT = 58;

export function CustomTagWeightRail({
  tagName,
  weight,
  onWeightChange,
  onRemove,
  inScreen = false,
}: CustomTagWeightRailProps) {
  return (
    <div
      className={`custom-tag-rail shrink-0 ${
        inScreen
          ? "custom-tag-rail--in-screen h-[58px] border-b border-white/8 px-2.5 py-2"
          : "rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2.5 backdrop-blur-sm"
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${inScreen ? "mb-1.5" : "mb-2"}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="custom-tag-rail-dot h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className={`truncate font-medium text-zinc-100 ${inScreen ? "text-xs" : "text-sm"}`}>
            {tagName}
          </span>
          {!inScreen ? (
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-cyan-400/70">自定义</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onRemove}
            className={`rounded-md text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300 ${
              inScreen ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
            }`}
          >
            删除
          </button>
        </div>
      </div>
      <div className={`flex items-center ${inScreen ? "gap-2" : "gap-3"}`}>
        <span className="shrink-0 text-[9px] uppercase tracking-wider text-zinc-500">小</span>
        <input
          type="range"
          min={CUSTOM_TAG_WEIGHT_MIN}
          max={CUSTOM_TAG_WEIGHT_MAX}
          step={0.01}
          value={weight}
          onChange={(event) => onWeightChange(Number(event.target.value))}
          className="custom-tag-rail-slider min-w-0 flex-1"
          style={{ "--rail-progress": `${((weight - CUSTOM_TAG_WEIGHT_MIN) / (CUSTOM_TAG_WEIGHT_MAX - CUSTOM_TAG_WEIGHT_MIN)) * 100}%` } as CSSProperties}
        />
        <span className="shrink-0 text-[9px] uppercase tracking-wider text-zinc-500">大</span>
      </div>
    </div>
  );
}
