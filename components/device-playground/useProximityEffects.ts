"use client";

import gsap from "gsap";
import { useCallback, useRef } from "react";
import {
  DOCK_MAX_SCALE,
  DOCK_RADIUS,
  distanceToLedTimeScale,
  getLedConfig,
  LED_IDLE_OPACITY,
  LED_PROXIMITY_RANGE,
} from "./constants";
import { getDeviceCenter } from "./useDevicePhysics";
import type { DeviceState, LedConfig, Point } from "./types";

interface ProximityRefs {
  deviceElements: Map<string, HTMLDivElement | null>;
  ledElements: Map<string, HTMLDivElement | null>;
}

function getLedParts(ledStack: HTMLDivElement | null) {
  if (!ledStack) return { glow: null, core: null };
  return {
    glow: ledStack.querySelector<HTMLDivElement>(".device-led-glow"),
    core: ledStack.querySelector<HTMLDivElement>(".device-led-core"),
  };
}

function createLedTimeline(
  ledStack: HTMLDivElement,
  config: LedConfig,
): gsap.core.Timeline {
  const { glow, core } = getLedParts(ledStack);
  if (!glow || !core) {
    return gsap.timeline({ paused: true });
  }

  gsap.set([glow, core], { backgroundColor: config.color, transformOrigin: "center center" });

  const tl = gsap.timeline({ repeat: -1, yoyo: true, paused: false });
  tl.to(
    core,
    {
      opacity: 1,
      scale: 1.45,
      boxShadow: `0 0 14px ${config.color}, 0 0 28px ${config.color}, 0 0 42px ${config.color}`,
      duration: 0.5,
      ease: "power1.inOut",
    },
    0,
  );
  tl.to(
    glow,
    {
      opacity: 0.95,
      scale: 2.1,
      duration: 0.5,
      ease: "power1.inOut",
    },
    0,
  );

  return tl;
}

export function useProximityEffects(reducedMotion: boolean) {
  const ledTimelinesRef = useRef<Map<string, gsap.core.Timeline>>(new Map());
  const lastTimeScaleRef = useRef<Map<string, number>>(new Map());

  const killLedTimeline = useCallback((deviceId: string) => {
    const existing = ledTimelinesRef.current.get(deviceId);
    if (existing) {
      existing.kill();
      ledTimelinesRef.current.delete(deviceId);
    }
    lastTimeScaleRef.current.delete(deviceId);
  }, []);

  const ensureLedTimeline = useCallback(
    (device: DeviceState, ledStack: HTMLDivElement) => {
      const existing = ledTimelinesRef.current.get(device.id);
      if (existing) return existing;

      const config = getLedConfig(device.matchScore);
      const tl = createLedTimeline(ledStack, config);
      ledTimelinesRef.current.set(device.id, tl);
      return tl;
    },
    [],
  );

  const setLedFrequency = useCallback(
    (
      device: DeviceState,
      ledStack: HTMLDivElement,
      distance: number,
      mode: "idle" | "proximity" | "off",
    ) => {
      const config = getLedConfig(device.matchScore);
      const { glow, core } = getLedParts(ledStack);

      if (mode === "off" || reducedMotion) {
        killLedTimeline(device.id);
        if (core) {
          gsap.set(core, {
            opacity: mode === "off" ? LED_IDLE_OPACITY : 0.95,
            scale: 1,
            backgroundColor: config.color,
            boxShadow: mode === "off" ? "none" : `0 0 12px ${config.color}`,
          });
        }
        if (glow) {
          gsap.set(glow, {
            opacity: mode === "off" ? 0 : 0.5,
            scale: 1,
            backgroundColor: config.color,
          });
        }
        return;
      }

      const tl = ensureLedTimeline(device, ledStack);
      const timeScale = distanceToLedTimeScale(distance, config, mode);
      const urgency =
        mode === "proximity"
          ? Math.pow(gsap.utils.clamp(0, 1, 1 - distance / LED_PROXIMITY_RANGE), 2.2)
          : 0;

      const lastScale = lastTimeScaleRef.current.get(device.id);
      const shouldUpdate =
        mode === "proximity" ||
        lastScale === undefined ||
        Math.abs(lastScale - timeScale) > 0.06;

      if (shouldUpdate) {
        tl.timeScale(timeScale);
        lastTimeScaleRef.current.set(device.id, timeScale);
      }

      if (glow) {
        gsap.to(glow, {
          opacity: 0.12 + urgency * 0.83,
          scale: 1 + urgency * 1.2,
          duration: 0.12,
          overwrite: "auto",
        });
      }
      if (core) {
        gsap.to(core, {
          scale: 1 + urgency * 0.5,
          duration: 0.12,
          overwrite: "auto",
        });
      }
    },
    [ensureLedTimeline, killLedTimeline, reducedMotion],
  );

  const setLedDim = useCallback(
    (device: DeviceState, ledStack: HTMLDivElement | null) => {
      if (!ledStack) return;
      if (device.matchable) {
        setLedFrequency(device, ledStack, LED_PROXIMITY_RANGE, "idle");
        return;
      }
      setLedFrequency(device, ledStack, LED_PROXIMITY_RANGE, "off");
    },
    [setLedFrequency],
  );

  const resetAllEffects = useCallback(
    (devices: DeviceState[], refs: ProximityRefs) => {
      devices.forEach((device) => {
        const el = refs.deviceElements.get(device.id);
        if (el) {
          gsap.to(el, {
            scale: 1,
            duration: 0.3,
            ease: "power2.out",
            overwrite: "auto",
          });
        }

        const ledStack = refs.ledElements.get(device.id);
        if (device.matchable && ledStack) {
          setLedFrequency(device, ledStack, LED_PROXIMITY_RANGE, "idle");
        } else if (ledStack) {
          killLedTimeline(device.id);
          setLedDim(device, ledStack);
        }
      });
    },
    [killLedTimeline, setLedDim, setLedFrequency],
  );

  const startMatchableIdlePulse = useCallback(
    (devices: DeviceState[], refs: ProximityRefs) => {
      devices.forEach((device) => {
        if (!device.matchable) return;
        const ledStack = refs.ledElements.get(device.id);
        if (!ledStack) return;
        setLedFrequency(device, ledStack, LED_PROXIMITY_RANGE, "idle");
      });
    },
    [setLedFrequency],
  );

  const updateLedBlink = useCallback(
    (
      device: DeviceState,
      distance: number,
      ledStack: HTMLDivElement | null,
      isOwnerDragging: boolean,
    ) => {
      if (!ledStack || !device.matchable) return;

      if (!isOwnerDragging || distance > LED_PROXIMITY_RANGE) {
        setLedFrequency(device, ledStack, LED_PROXIMITY_RANGE, "idle");
        return;
      }

      setLedFrequency(device, ledStack, distance, "proximity");
    },
    [setLedFrequency],
  );

  const updateProximity = useCallback(
    (
      draggedId: string,
      draggedPos: Point,
      ownerId: string,
      devices: DeviceState[],
      refs: ProximityRefs,
    ) => {
      const draggedCenter = getDeviceCenter(draggedPos.x, draggedPos.y);
      const isOwnerDragging = draggedId === ownerId;

      devices.forEach((device) => {
        if (device.id === draggedId) return;

        const el = refs.deviceElements.get(device.id);
        if (!el) return;

        const x = gsap.getProperty(el, "x") as number;
        const y = gsap.getProperty(el, "y") as number;
        const center = getDeviceCenter(x, y);

        const dx = draggedCenter.x - center.x;
        const dy = draggedCenter.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!reducedMotion) {
          const scale = gsap.utils.clamp(
            1,
            DOCK_MAX_SCALE,
            gsap.utils.mapRange(DOCK_RADIUS, 0, 1, DOCK_MAX_SCALE, distance),
          );
          gsap.to(el, {
            scale,
            duration: 0.25,
            ease: "power2.out",
            overwrite: "auto",
          });
        }

        if (device.matchable) {
          const ledStack = refs.ledElements.get(device.id) ?? null;
          updateLedBlink(device, distance, ledStack, isOwnerDragging);
        }
      });
    },
    [reducedMotion, updateLedBlink],
  );

  const cleanup = useCallback(() => {
    ledTimelinesRef.current.forEach((tl) => tl.kill());
    ledTimelinesRef.current.clear();
    lastTimeScaleRef.current.clear();
  }, []);

  return {
    updateProximity,
    resetAllEffects,
    startMatchableIdlePulse,
    cleanup,
  };
}
