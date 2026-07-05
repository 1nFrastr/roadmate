"use client";

import { forwardRef } from "react";
import {
  DEVICE_D,
  DEVICE_RING_OUTER,
  DEVICE_SCREEN_D,
  DEVICE_SCREEN_R,
  DEVICE_SHELL_RING,
  LED_COLOR,
  LED_IDLE_OPACITY,
} from "./constants";
import { MatchPointerArrow } from "./MatchPointerArrow";
import { MatchScoreCounter } from "./MatchScoreCounter";
import type { DeviceState } from "./types";

const LED_RING_MASK = `radial-gradient(circle, transparent ${
  DEVICE_SCREEN_R - 0.5
}px, #000 ${DEVICE_SCREEN_R + 0.5}px, #000 ${DEVICE_RING_OUTER}px, transparent ${
  DEVICE_RING_OUTER + 1
}px)`;

interface DeviceCardProps {
  device: DeviceState;
  ledRef?: React.Ref<HTMLDivElement>;
  pointerRef?: React.Ref<HTMLDivElement>;
  showMatchSuccess?: boolean;
  matchScore?: number;
  matchTopics?: string[];
}

function idleStatusText(device: DeviceState): string {
  if (device.isOwner) return "我的设备";
  if (device.matchable) return `match ${device.matchScore}%`;
  return "idle";
}

export const DeviceCard = forwardRef<HTMLDivElement, DeviceCardProps>(
  function DeviceCard(
    {
      device,
      ledRef,
      pointerRef,
      showMatchSuccess = false,
      matchScore,
      matchTopics = [],
    },
    ref,
  ) {
    const ledActive = device.matchable || device.isOwner;
    const ledColor = ledActive ? LED_COLOR : "#334155";
    const topics = matchTopics.slice(0, 3);
    const screenActive = showMatchSuccess || device.isOwner || device.matchable;
    const showPointer = ledActive && !showMatchSuccess;

    return (
      <div
        ref={ref}
        className={`device-tag relative select-none will-change-transform ${
          device.isOwner ? "device-tag-owner" : ""
        }`}
        style={{ width: DEVICE_D, height: DEVICE_D }}
      >
        {device.isOwner ? (
          <div className="device-tag-owner-halo pointer-events-none absolute -inset-[4px] rounded-full" />
        ) : null}

        <div
          className={`device-tag-shell absolute inset-0 overflow-hidden rounded-full ${
            device.isOwner ? "device-tag-shell-owner" : ""
          }`}
        >
          <div className="device-tag-gloss pointer-events-none absolute inset-0 z-[1] rounded-full" />

          {ledActive ? (
            <div
              ref={ledRef}
              className="device-tag-led-ring pointer-events-none absolute inset-0 z-[2] rounded-full"
              style={{
                WebkitMaskImage: LED_RING_MASK,
                maskImage: LED_RING_MASK,
              }}
              data-device-id={device.id}
            >
              <div
                className="device-led-glow absolute inset-0 rounded-full"
                style={{ backgroundColor: ledColor, opacity: 0 }}
              />
              <div
                className="device-led-core absolute inset-0 rounded-full"
                style={{
                  backgroundColor: "transparent",
                  boxShadow: `inset 0 0 0 2.5px ${ledColor}`,
                  opacity: LED_IDLE_OPACITY,
                }}
              />
            </div>
          ) : (
            <div
              ref={ledRef}
              className="device-tag-led-ring device-tag-led-ring-hidden pointer-events-none absolute inset-0 z-[2] opacity-0"
              data-device-id={device.id}
              aria-hidden
            />
          )}

          <div
            className={`device-tag-screen device-ink-screen absolute z-[3] overflow-hidden rounded-full ${
              showMatchSuccess
                ? "device-tag-screen-live"
                : screenActive
                  ? "device-tag-screen-standby"
                  : "device-tag-screen-off"
            }`}
            style={{
              width: DEVICE_SCREEN_D,
              height: DEVICE_SCREEN_D,
              top: DEVICE_SHELL_RING,
              left: DEVICE_SHELL_RING,
            }}
          >
            {showPointer ? <MatchPointerArrow ref={pointerRef} /> : null}

            {showMatchSuccess ? (
              <div className="device-match-success-screen flex h-full min-h-0 flex-col items-center justify-center gap-[2px] px-[4px] py-[3px]">
                <MatchScoreCounter value={matchScore ?? device.matchScore} compact ink />
                <ul className="flex w-full min-h-0 flex-col gap-[1px] overflow-hidden">
                  {topics.map((topic) => (
                    <li
                      key={topic}
                      className="device-ink-text-dim truncate text-center font-mono text-[6px] leading-[8px]"
                      title={topic}
                    >
                      {topic}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-[2px] px-[5px] text-center">
                <span className="device-ink-text-bright font-mono text-[8px] font-semibold leading-none">
                  {device.label}
                </span>
                <span className="device-ink-text-dim font-mono text-[6px] leading-none">
                  {idleStatusText(device)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
