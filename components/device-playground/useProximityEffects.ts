"use client";

import gsap from "gsap";
import { useCallback, useRef } from "react";
import {
  bearingBetweenCenters,
  distanceToLedIntensity,
  distanceToLedTimeScale,
  distanceToProximity,
  DOCK_MAX_SCALE,
  DOCK_RADIUS,
  DEVICE_LED_STROKE,
  isWithinLedMatchRange,
  LED_CONFIG,
  LED_IDLE_OPACITY,
  LED_PAIRING_HOLD_COLOR,
  LED_SMOOTHING,
} from "./constants";
import { getDeviceCenter } from "./useDevicePhysics";
import type { DeviceState, Point } from "./types";
import type { PairingPhase } from "./match-pairing/types";

interface PairingLedState {
  phase: PairingPhase;
  ownerId: string;
  partnerId: string;
  holdProgress: number;
}

interface ProximityRefs {
  deviceElements: Map<string, HTMLDivElement | null>;
  ledElements: Map<string, HTMLDivElement | null>;
  pointerElements: Map<string, HTMLDivElement | null>;
}

function getLedParts(ledStack: HTMLDivElement | null) {
  if (!ledStack) {
    return { glow: null, core: null, track: null, progress: null };
  }
  return {
    glow: ledStack.querySelector<HTMLDivElement>(".device-led-glow"),
    core: ledStack.querySelector<HTMLDivElement>(".device-led-core"),
    track: ledStack.querySelector<HTMLDivElement>(".device-led-track"),
    progress: ledStack.querySelector<HTMLDivElement>(".device-led-progress"),
  };
}

function hidePairingRingLayers(
  track: HTMLDivElement | null,
  progress: HTMLDivElement | null,
) {
  if (track) gsap.set(track, { opacity: 0 });
  if (progress) gsap.set(progress, { opacity: 0, background: "transparent" });
}

function restoreProximityLedLayers(
  glow: HTMLDivElement | null,
  core: HTMLDivElement | null,
  track: HTMLDivElement | null,
  progress: HTMLDivElement | null,
) {
  hidePairingRingLayers(track, progress);
  const color = LED_CONFIG.color;

  if (glow) {
    gsap.set(glow, {
      background: "",
      backgroundColor: color,
      opacity: 0,
      transformOrigin: "center center",
    });
  }

  if (core) {
    gsap.set(core, {
      opacity: LED_IDLE_OPACITY,
      boxShadow: `inset 0 0 0 ${DEVICE_LED_STROKE}px ${color}`,
      transformOrigin: "center center",
    });
  }
}

function pairingArcBackground(progress: number, color: string): string {
  const sweep = Math.min(360, Math.max(0, progress * 360));
  if (sweep <= 0.5) return "transparent";
  return `conic-gradient(from -90deg, ${color} 0deg, ${color} ${sweep}deg, transparent ${sweep}deg)`;
}

function getElementPosition(element: HTMLDivElement): Point {
  return {
    x: gsap.getProperty(element, "x") as number,
    y: gsap.getProperty(element, "y") as number,
  };
}

function createLedTimeline(ledStack: HTMLDivElement): gsap.core.Timeline {
  const { glow, core, track, progress } = getLedParts(ledStack);
  if (!glow || !core) {
    return gsap.timeline({ paused: true });
  }

  hidePairingRingLayers(track, progress);

  const color = LED_CONFIG.color;
  const flashOn = 0.05;
  const flashOff = 0.17;
  const peakShadow = `inset 0 0 0 ${DEVICE_LED_STROKE}px ${color}, 0 0 12px ${color}cc, 0 0 28px ${color}66`;

  gsap.set(glow, {
    transformOrigin: "center center",
    opacity: 0,
    background: "",
    backgroundColor: color,
  });
  gsap.set(core, {
    opacity: LED_IDLE_OPACITY,
    boxShadow: `inset 0 0 0 ${DEVICE_LED_STROKE}px ${color}`,
    transformOrigin: "center center",
  });

  const tl = gsap.timeline({ repeat: -1, paused: false });
  tl.to(
    core,
    {
      opacity: 1,
      boxShadow: peakShadow,
      duration: flashOn,
      ease: "power4.out",
    },
    0,
  );
  tl.to(
    glow,
    {
      opacity: 0.88,
      duration: flashOn,
      ease: "power4.out",
    },
    0,
  );
  tl.to(
    core,
    {
      opacity: LED_IDLE_OPACITY,
      boxShadow: `inset 0 0 0 ${DEVICE_LED_STROKE}px ${color}`,
      duration: flashOff,
      ease: "power2.in",
    },
  );
  tl.to(
    glow,
    {
      opacity: 0,
      duration: flashOff,
      ease: "power2.in",
    },
    "<",
  );

  return tl;
}

function smoothToward(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function smoothAngle(current: number, target: number, factor: number): number {
  let diff = ((target - current + 540) % 360) - 180;
  return current + diff * factor;
}

export function useProximityEffects(reducedMotion: boolean) {
  const ledTimelinesRef = useRef<Map<string, gsap.core.Timeline>>(new Map());
  const smoothedTimeScaleRef = useRef<Map<string, number>>(new Map());
  const smoothedIntensityRef = useRef<Map<string, number>>(new Map());
  const pairingModeDevicesRef = useRef<Set<string>>(new Set());

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
      pairingModeDevicesRef.current.delete(deviceId);
      gsap.set(ledStack, { opacity: 1 });
      const { glow, core, track, progress } = getLedParts(ledStack);
      restoreProximityLedLayers(glow, core, track, progress);
    },
    [killLedTimeline],
  );

  const setLedPairingProgress = useCallback(
    (
      deviceId: string,
      ledStack: HTMLDivElement,
      progress: number,
      color = LED_PAIRING_HOLD_COLOR,
    ) => {
      if (reducedMotion) {
        setLedOff(deviceId, ledStack);
        return;
      }

      const enteringPairing = !pairingModeDevicesRef.current.has(deviceId);
      if (enteringPairing) {
        killLedTimeline(deviceId);
        smoothedTimeScaleRef.current.delete(deviceId);
        smoothedIntensityRef.current.delete(deviceId);
        pairingModeDevicesRef.current.add(deviceId);
      }

      const clamped = Math.min(1, Math.max(0, progress));
      const { glow, core, track, progress: progressEl } = getLedParts(ledStack);
      const arcBackground = pairingArcBackground(clamped, color);

      gsap.set(ledStack, { opacity: 1 });

      if (track) {
        gsap.set(track, {
          opacity: 1,
          boxShadow: `inset 0 0 0 ${DEVICE_LED_STROKE}px ${color}30`,
        });
      }

      if (progressEl) {
        gsap.set(progressEl, {
          opacity: clamped > 0 ? 1 : 0,
          background: arcBackground,
        });
      }

      if (glow) {
        gsap.set(glow, { opacity: 0, background: "", backgroundColor: "" });
      }

      if (core) {
        gsap.set(core, {
          opacity: 0,
          boxShadow: "none",
        });
      }
    },
    [killLedTimeline, reducedMotion, setLedOff],
  );

  const setLedFromDistance = useCallback(
    (deviceId: string, ledStack: HTMLDivElement, distance: number) => {
      if (reducedMotion) {
        setLedOff(deviceId, ledStack);
        return;
      }

      const targetTimeScale = distanceToLedTimeScale(distance);
      const targetIntensity = distanceToLedIntensity(distance);
      const { glow, core, track, progress } = getLedParts(ledStack);
      const leavingPairing = pairingModeDevicesRef.current.has(deviceId);

      if (leavingPairing) {
        pairingModeDevicesRef.current.delete(deviceId);
        killLedTimeline(deviceId);
        restoreProximityLedLayers(glow, core, track, progress);
      } else {
        hidePairingRingLayers(track, progress);
      }

      const prevScale = smoothedTimeScaleRef.current.get(deviceId) ?? targetTimeScale;
      const prevIntensity = smoothedIntensityRef.current.get(deviceId) ?? targetIntensity;
      const timeScale = smoothToward(prevScale, targetTimeScale, LED_SMOOTHING);
      const intensity = smoothToward(prevIntensity, targetIntensity, LED_SMOOTHING);

      smoothedTimeScaleRef.current.set(deviceId, timeScale);
      smoothedIntensityRef.current.set(deviceId, intensity);

      const hadTimeline = ledTimelinesRef.current.has(deviceId);
      if (!hadTimeline) {
        restoreProximityLedLayers(glow, core, track, progress);
      }

      const tl = ensureLedTimeline(deviceId, ledStack);
      if (!tl.isActive()) {
        tl.restart();
      }
      tl.timeScale(timeScale);

      // 用 stack 整体透明度做距离亮度包络，避免与 timeline 频闪属性冲突
      gsap.to(ledStack, {
        opacity: 0.28 + intensity * 0.72,
        duration: 0.22,
        ease: "power2.out",
        overwrite: "auto",
      });
    },
    [ensureLedTimeline, killLedTimeline, reducedMotion, setLedOff],
  );

  const activePairRef = useRef<{ ownerId: string; matchableId: string } | null>(null);
  const ledsSuppressedRef = useRef(false);
  const smoothedBearingRef = useRef<Map<string, number>>(new Map());

  const findNearestOwnerMatchPair = useCallback(
    (
      devices: DeviceState[],
      refs: ProximityRefs,
    ): { ownerId: string; matchableId: string; distance: number } | null => {
      const owner = devices.find((device) => device.isOwner);
      if (!owner) return null;

      const ownerElement = refs.deviceElements.get(owner.id);
      if (!ownerElement) return null;

      const ownerPos = getElementPosition(ownerElement);
      const ownerCenter = getDeviceCenter(ownerPos.x, ownerPos.y);

      let nearestMatchableId: string | null = null;
      let nearestDistance = Infinity;

      devices.forEach((device) => {
        if (!device.matchable) return;

        const element = refs.deviceElements.get(device.id);
        if (!element) return;

        const pos = getElementPosition(element);
        const center = getDeviceCenter(pos.x, pos.y);
        const dx = ownerCenter.x - center.x;
        const dy = ownerCenter.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestMatchableId = device.id;
        }
      });

      if (
        nearestMatchableId === null ||
        !isWithinLedMatchRange(nearestDistance)
      ) {
        return null;
      }

      return {
        ownerId: owner.id,
        matchableId: nearestMatchableId,
        distance: nearestDistance,
      };
    },
    [],
  );

  const syncPairTimelines = useCallback((ownerId: string, matchableId: string) => {
    const ownerTimeline = ledTimelinesRef.current.get(ownerId);
    const matchableTimeline = ledTimelinesRef.current.get(matchableId);
    if (!ownerTimeline || !matchableTimeline) return;

    const progress = ownerTimeline.progress();
    matchableTimeline.progress(progress);
    matchableTimeline.timeScale(ownerTimeline.timeScale());
  }, []);

  const updateMatchLeds = useCallback(
    (
      devices: DeviceState[],
      refs: ProximityRefs,
      enabled = true,
      pairingLedState: PairingLedState | null = null,
    ) => {
      if (!enabled) {
        if (!ledsSuppressedRef.current) {
          ledsSuppressedRef.current = true;
          activePairRef.current = null;
          devices.forEach((device) => {
            const ledStack = refs.ledElements.get(device.id);
            if (ledStack) setLedOff(device.id, ledStack);
          });
        }
        return;
      }

      ledsSuppressedRef.current = false;

      if (pairingLedState?.phase === "holding") {
        activePairRef.current = {
          ownerId: pairingLedState.ownerId,
          matchableId: pairingLedState.partnerId,
        };

        devices.forEach((device) => {
          const ledStack = refs.ledElements.get(device.id);
          if (!ledStack) return;

          if (
            device.id === pairingLedState.ownerId ||
            device.id === pairingLedState.partnerId
          ) {
            setLedPairingProgress(
              device.id,
              ledStack,
              pairingLedState.holdProgress,
            );
          } else {
            setLedOff(device.id, ledStack);
          }
        });
        return;
      }

      const activePair = findNearestOwnerMatchPair(devices, refs);
      const previousPair = activePairRef.current;
      const pairChanged =
        activePair?.ownerId !== previousPair?.ownerId ||
        activePair?.matchableId !== previousPair?.matchableId;

      if (activePair) {
        activePairRef.current = {
          ownerId: activePair.ownerId,
          matchableId: activePair.matchableId,
        };
      } else {
        activePairRef.current = null;
      }

      devices.forEach((device) => {
        const ledStack = refs.ledElements.get(device.id);
        if (!ledStack) return;

        if (
          !activePair ||
          (device.id !== activePair.ownerId && device.id !== activePair.matchableId)
        ) {
          setLedOff(device.id, ledStack);
          return;
        }

        setLedFromDistance(device.id, ledStack, activePair.distance);

        if (pairChanged) {
          const tl = ledTimelinesRef.current.get(device.id);
          tl?.progress(0);
        }
      });

      if (activePair && pairChanged) {
        syncPairTimelines(activePair.ownerId, activePair.matchableId);
      }
    },
    [findNearestOwnerMatchPair, setLedFromDistance, setLedOff, setLedPairingProgress, syncPairTimelines],
  );

  const updateMatchPointers = useCallback(
    (
      devices: DeviceState[],
      refs: ProximityRefs,
      enabled = true,
    ): { ownerId: string; matchableId: string } | null => {
      const activePair = findNearestOwnerMatchPair(devices, refs);

      devices.forEach((device) => {
        const pointer = refs.pointerElements.get(device.id);
        if (!pointer) return;

        const inActivePair =
          enabled &&
          activePair &&
          (device.id === activePair.ownerId || device.id === activePair.matchableId);

        if (!inActivePair) {
          gsap.to(pointer, {
            opacity: 0,
            scale: 0.85,
            duration: 0.25,
            ease: "power2.out",
            overwrite: "auto",
          });
          smoothedBearingRef.current.delete(device.id);
          return;
        }

        const partnerId =
          device.id === activePair.ownerId ? activePair.matchableId : activePair.ownerId;
        const selfEl = refs.deviceElements.get(device.id);
        const partnerEl = refs.deviceElements.get(partnerId);
        if (!selfEl || !partnerEl) return;

        const selfPos = getElementPosition(selfEl);
        const partnerPos = getElementPosition(partnerEl);
        const targetBearing = bearingBetweenCenters(
          getDeviceCenter(selfPos.x, selfPos.y),
          getDeviceCenter(partnerPos.x, partnerPos.y),
        );

        const prevBearing = smoothedBearingRef.current.get(device.id) ?? targetBearing;
        const bearing = reducedMotion
          ? targetBearing
          : smoothAngle(prevBearing, targetBearing, 0.14);
        smoothedBearingRef.current.set(device.id, bearing);

        const proximity = distanceToProximity(activePair.distance);
        gsap.set(pointer, { rotation: bearing, transformOrigin: "50% 50%" });
        gsap.to(pointer, {
          opacity: 0.28 + proximity * 0.72,
          scale: 0.86 + proximity * 0.2,
          duration: 0.18,
          ease: "power2.out",
          overwrite: "auto",
        });
      });

      return enabled && activePair
        ? {
            ownerId: activePair.ownerId,
            matchableId: activePair.matchableId,
          }
        : null;
    },
    [findNearestOwnerMatchPair, reducedMotion],
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
    smoothedBearingRef.current.clear();
    pairingModeDevicesRef.current.clear();
    activePairRef.current = null;
    ledsSuppressedRef.current = false;
  }, []);

  return {
    updateMatchLeds,
    updateMatchPointers,
    updateDockProximity,
    resetDockScales,
    cleanup,
  };
};
