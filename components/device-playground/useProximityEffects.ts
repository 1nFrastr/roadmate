"use client";

import gsap from "gsap";
import { useCallback, useRef } from "react";
import {
  devicesMatch,
  distanceToLedIntensity,
  distanceToLedTimeScale,
  DOCK_MAX_SCALE,
  DOCK_RADIUS,
  isMatchParticipant,
  isWithinLedMatchRange,
  LED_CONFIG,
  LED_IDLE_OPACITY,
  LED_SMOOTHING,
} from "./constants";
import { getDeviceCenter } from "./useDevicePhysics";
import type { DeviceState, Point } from "./types";

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

function getElementPosition(element: HTMLDivElement): Point {
  return {
    x: gsap.getProperty(element, "x") as number,
    y: gsap.getProperty(element, "y") as number,
  };
}

function createLedTimeline(ledStack: HTMLDivElement): gsap.core.Timeline {
  const { glow, core } = getLedParts(ledStack);
  if (!glow || !core) {
    return gsap.timeline({ paused: true });
  }

  gsap.set([glow, core], {
    backgroundColor: LED_CONFIG.color,
    transformOrigin: "center center",
  });

  const tl = gsap.timeline({ repeat: -1, yoyo: true, paused: false });
  tl.to(
    core,
    {
      opacity: 0.88,
      scale: 1.18,
      boxShadow: `0 0 6px ${LED_CONFIG.color}bb, 0 0 14px ${LED_CONFIG.color}66`,
      duration: 0.52,
      ease: "sine.inOut",
    },
    0,
  );
  tl.to(
    glow,
    {
      opacity: 0.68,
      scale: 1.38,
      duration: 0.52,
      ease: "sine.inOut",
    },
    0,
  );

  return tl;
}

function smoothToward(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

export function useProximityEffects(reducedMotion: boolean) {
  const ledTimelinesRef = useRef<Map<string, gsap.core.Timeline>>(new Map());
  const smoothedTimeScaleRef = useRef<Map<string, number>>(new Map());
  const smoothedIntensityRef = useRef<Map<string, number>>(new Map());

  const killLedTimeline = useCallback((deviceId: string) => {
    const existing = ledTimelinesRef.current.get(deviceId);
    if (existing) {
      existing.kill();
      ledTimelinesRef.current.delete(deviceId);
    }
    smoothedTimeScaleRef.current.delete(deviceId);
    smoothedIntensityRef.current.delete(deviceId);
  }, []);

  const ensureLedTimeline = useCallback((deviceId: string, ledStack: HTMLDivElement) => {
    const existing = ledTimelinesRef.current.get(deviceId);
    if (existing) return existing;

    const tl = createLedTimeline(ledStack);
    ledTimelinesRef.current.set(deviceId, tl);
    return tl;
  }, []);

  const setLedOff = useCallback(
    (deviceId: string, ledStack: HTMLDivElement) => {
      killLedTimeline(deviceId);
      const { glow, core } = getLedParts(ledStack);
      if (core) {
        gsap.set(core, {
          opacity: LED_IDLE_OPACITY,
          scale: 1,
          backgroundColor: LED_CONFIG.color,
          boxShadow: "none",
        });
      }
      if (glow) {
        gsap.set(glow, {
          opacity: 0,
          scale: 1,
          backgroundColor: LED_CONFIG.color,
        });
      }
    },
    [killLedTimeline],
  );

  const setLedFromDistance = useCallback(
    (deviceId: string, ledStack: HTMLDivElement, distance: number) => {
      if (reducedMotion) {
        setLedOff(deviceId, ledStack);
        return;
      }

      const { glow, core } = getLedParts(ledStack);
      const targetTimeScale = distanceToLedTimeScale(distance);
      const targetIntensity = distanceToLedIntensity(distance);

      const prevScale = smoothedTimeScaleRef.current.get(deviceId) ?? targetTimeScale;
      const prevIntensity = smoothedIntensityRef.current.get(deviceId) ?? targetIntensity;
      const timeScale = smoothToward(prevScale, targetTimeScale, LED_SMOOTHING);
      const intensity = smoothToward(prevIntensity, targetIntensity, LED_SMOOTHING);

      smoothedTimeScaleRef.current.set(deviceId, timeScale);
      smoothedIntensityRef.current.set(deviceId, intensity);

      const tl = ensureLedTimeline(deviceId, ledStack);
      tl.timeScale(timeScale);

      const glowOpacity = 0.1 + intensity * 0.58;
      const glowScale = 1 + intensity * 0.42;
      const coreScale = 1 + intensity * 0.16;

      if (glow) {
        gsap.to(glow, {
          opacity: glowOpacity,
          scale: glowScale,
          duration: 0.42,
          ease: "sine.out",
          overwrite: "auto",
        });
      }
      if (core) {
        gsap.to(core, {
          scale: coreScale,
          duration: 0.42,
          ease: "sine.out",
          overwrite: "auto",
        });
      }
    },
    [ensureLedTimeline, reducedMotion, setLedOff],
  );

  const findNearestMatchDistance = useCallback(
    (
      device: DeviceState,
      devices: DeviceState[],
      refs: ProximityRefs,
    ): number | null => {
      const element = refs.deviceElements.get(device.id);
      if (!element) return null;

      const pos = getElementPosition(element);
      const center = getDeviceCenter(pos.x, pos.y);

      let nearest = Infinity;

      devices.forEach((other) => {
        if (other.id === device.id || !devicesMatch(device, other)) return;

        const otherElement = refs.deviceElements.get(other.id);
        if (!otherElement) return;

        const otherPos = getElementPosition(otherElement);
        const otherCenter = getDeviceCenter(otherPos.x, otherPos.y);
        const dx = center.x - otherCenter.x;
        const dy = center.y - otherCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        nearest = Math.min(nearest, distance);
      });

      return nearest === Infinity ? null : nearest;
    },
    [],
  );

  const updateMatchLeds = useCallback(
    (devices: DeviceState[], refs: ProximityRefs) => {
      devices.forEach((device) => {
        const ledStack = refs.ledElements.get(device.id);
        if (!ledStack) return;

        if (!isMatchParticipant(device)) {
          setLedOff(device.id, ledStack);
          return;
        }

        const nearestDistance = findNearestMatchDistance(device, devices, refs);
        if (
          nearestDistance === null ||
          !isWithinLedMatchRange(nearestDistance)
        ) {
          setLedOff(device.id, ledStack);
          return;
        }

        setLedFromDistance(device.id, ledStack, nearestDistance);
      });
    },
    [findNearestMatchDistance, setLedFromDistance, setLedOff],
  );

  const updateDockProximity = useCallback(
    (
      draggedId: string,
      draggedPos: Point,
      devices: DeviceState[],
      refs: ProximityRefs,
    ) => {
      const draggedCenter = getDeviceCenter(draggedPos.x, draggedPos.y);

      devices.forEach((device) => {
        if (device.id === draggedId) return;

        const el = refs.deviceElements.get(device.id);
        if (!el) return;

        const pos = getElementPosition(el);
        const center = getDeviceCenter(pos.x, pos.y);
        const dx = draggedCenter.x - center.x;
        const dy = draggedCenter.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (reducedMotion) return;

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
      });
    },
    [reducedMotion],
  );

  const resetDockScales = useCallback((devices: DeviceState[], refs: ProximityRefs) => {
    devices.forEach((device) => {
      const el = refs.deviceElements.get(device.id);
      if (!el) return;
      gsap.to(el, {
        scale: 1,
        duration: 0.3,
        ease: "power2.out",
        overwrite: "auto",
      });
    });
  }, []);

  const cleanup = useCallback(() => {
    ledTimelinesRef.current.forEach((tl) => tl.kill());
    ledTimelinesRef.current.clear();
    smoothedTimeScaleRef.current.clear();
    smoothedIntensityRef.current.clear();
  }, []);

  return {
    updateMatchLeds,
    updateDockProximity,
    resetDockScales,
    cleanup,
  };
};
