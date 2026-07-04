"use client";

import { forwardRef } from "react";
import {
  DEVICE_H,
  DEVICE_W,
  getLedConfig,
  LED_IDLE_OPACITY,
} from "./constants";
import type { DeviceState } from "./types";

interface DeviceCardProps {
  device: DeviceState;
  ledRef?: React.Ref<HTMLDivElement>;
}

export const DeviceCard = forwardRef<HTMLDivElement, DeviceCardProps>(
  function DeviceCard({ device, ledRef }, ref) {
    const ledConfig = device.matchable ? getLedConfig(device.matchScore) : null;
    const ledColor = ledConfig?.color ?? "#334155";

    return (
      <div
        ref={ref}
        className={`device-card relative select-none will-change-transform ${
          device.isOwner ? "device-card-owner" : ""
        }`}
        style={{ width: DEVICE_W, height: DEVICE_H }}
      >
        {device.isOwner ? (
          <div className="device-owner-ring pointer-events-none absolute -inset-[3px] rounded-[17px]" />
        ) : null}

        <div
          className={`device-shell absolute inset-0 overflow-hidden rounded-[14px] ${
            device.isOwner ? "device-shell-owner" : ""
          }`}
        >
          <div className="device-bezel absolute inset-[3px] rounded-[11px]" />

          <div
            ref={ledRef}
            className="device-led-stack absolute left-1/2 top-[7px] -translate-x-1/2"
            data-device-id={device.id}
          >
            <div
              className="device-led-glow absolute left-1/2 top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                backgroundColor: ledColor,
                opacity: device.matchable ? 0.08 : 0,
              }}
            />
            <div
              className="device-led-core relative mx-auto h-[10px] w-[10px] rounded-full"
              style={{
                backgroundColor: ledColor,
                opacity: device.matchable ? 0.35 : LED_IDLE_OPACITY,
                boxShadow: device.matchable
                  ? `0 0 10px ${ledColor}, 0 0 20px ${ledColor}66`
                  : "none",
              }}
            />
          </div>

          <div className="device-screen absolute left-[10px] right-[10px] top-[26px] bottom-[52px] overflow-hidden rounded-[4px]">
            <div className="flex h-full flex-col justify-between p-[6px]">
              <span
                className={`font-mono text-[8px] uppercase tracking-widest ${
                  device.isOwner ? "text-cyan-300/90" : "text-emerald-400/70"
                }`}
              >
                {device.isOwner ? "roadmate · you" : "roadmate"}
              </span>
              <div className="flex flex-col gap-[2px]">
                <span className="font-mono text-[11px] font-semibold text-zinc-100">
                  {device.label}
                </span>
                {device.isOwner ? (
                  <span className="font-mono text-[8px] text-cyan-300/80">我的设备</span>
                ) : device.matchable ? (
                  <span className="font-mono text-[8px] text-zinc-400">
                    match {device.matchScore}%
                  </span>
                ) : (
                  <span className="font-mono text-[8px] text-zinc-600">idle</span>
                )}
              </div>
            </div>
          </div>

          <div className="device-wheel absolute bottom-[8px] left-1/2 h-[36px] w-[36px] -translate-x-1/2 rounded-full" />
        </div>
      </div>
    );
  },
);
