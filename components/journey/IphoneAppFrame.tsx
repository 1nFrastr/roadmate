"use client";

import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { IPHONE_FRAME, IPHONE_FRAME_CHROME } from "./constants";

interface IphoneAppFrameProps {
  children: ReactNode;
  label?: string;
  className?: string;
  size?: "default" | "compact";
  showLabel?: boolean;
}

export const IphoneAppFrame = forwardRef<HTMLDivElement, IphoneAppFrameProps>(
  function IphoneAppFrame(
    { children, label = "Roadmate App", className = "", size = "default", showLabel = true },
    ref,
  ) {
    const spec = IPHONE_FRAME[size];
    const { frameBezel } = IPHONE_FRAME_CHROME;

    const frameStyle = {
      width: spec.outerWidth,
      height: spec.outerHeight,
      padding: frameBezel,
      borderRadius: spec.frameRadius,
      ["--iphone-screen-radius" as string]: `${spec.screenRadius}px`,
      ["--iphone-island-w" as string]: `${spec.islandWidth}px`,
      ["--iphone-island-h" as string]: `${spec.islandHeight}px`,
      ["--iphone-home-w" as string]: `${spec.homeIndicatorWidth}px`,
    } satisfies CSSProperties;

    return (
      <div className={`flex shrink-0 flex-col items-center gap-3 ${className}`}>
        {showLabel ? (
          <p className="shrink-0 text-xs uppercase tracking-widest text-zinc-500">{label}</p>
        ) : null}
        <div
          ref={ref}
          data-journey="iphone-frame"
          className={`iphone-app-frame iphone-app-frame--${size} relative shrink-0`}
          style={frameStyle}
        >
          <div
            className="iphone-app-screen relative overflow-hidden"
            style={{ height: spec.screenHeight }}
          >
            <div
              className="iphone-app-island pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-full"
              style={{ top: spec.islandTop }}
            />
            <div
              className="iphone-app-screen-content absolute inset-x-0 overflow-hidden"
              style={{ top: spec.safeTop, bottom: spec.safeBottom }}
            >
              {children}
            </div>
            <div
              className="iphone-app-home-indicator pointer-events-none absolute left-1/2 z-20 h-[4px] -translate-x-1/2 rounded-full"
              style={{ bottom: spec.homeBottom }}
            />
          </div>
        </div>
      </div>
    );
  },
);
