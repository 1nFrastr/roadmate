"use client";

import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  devicesMatch,
  DEVICE_H,
} from "../constants";
import { getDeviceCenter } from "../useDevicePhysics";
import type { DeviceState } from "../types";
import { computeCommonTopics } from "../matchScoring";
import {
  MATCH_CONFIRM_HOLD_MS,
  PAIRING_TOUCH_DISTANCE,
  PAIRING_TOUCH_EXIT_DISTANCE,
  pickMatchTopics,
} from "./constants";
import { runMatchToRoadmatesExitTransition } from "@/components/match-to-roadmates";
import {
  capturePairSuccessSnapshot,
  computeTouchGeometry,
  resetPlaygroundInteraction,
  runPairSuccessDismissTransition,
  runPairSuccessTransition,
} from "./runPairSuccessTransition";
import type { MatchedPair, PairingAnchor, PairingPhase, PairSuccessRestoreSnapshot } from "./types";

interface UseMatchPairingOptions {
  devices: DeviceState[];
  deviceRefs: React.RefObject<Map<string, HTMLDivElement>>;
  playgroundRef: React.RefObject<HTMLDivElement | null>;
  headerRef: React.RefObject<HTMLElement | null>;
  playgroundSize: { width: number; height: number };
  reducedMotion: boolean;
  enabled: boolean;
  pairingLockedRef: React.MutableRefObject<boolean>;
}

function getElementPosition(element: HTMLDivElement) {
  return {
    x: gsap.getProperty(element, "x") as number,
    y: gsap.getProperty(element, "y") as number,
  };
}

function distanceBetweenDevices(
  aEl: HTMLDivElement,
  bEl: HTMLDivElement,
): number {
  const aPos = getElementPosition(aEl);
  const bPos = getElementPosition(bEl);
  const aCenter = getDeviceCenter(aPos.x, aPos.y);
  const bCenter = getDeviceCenter(bPos.x, bPos.y);
  const dx = aCenter.x - bCenter.x;
  const dy = aCenter.y - bCenter.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function useMatchPairing({
  devices,
  deviceRefs,
  playgroundRef,
  headerRef,
  playgroundSize,
  reducedMotion,
  enabled,
  pairingLockedRef,
}: UseMatchPairingOptions) {
  const [phase, setPhase] = useState<PairingPhase>("idle");
  const [holdProgress, setHoldProgress] = useState(0);
  const [anchor, setAnchor] = useState<PairingAnchor>({ x: 0, y: 0 });
  const [matchedPair, setMatchedPair] = useState<MatchedPair | null>(null);
  const [successScreenVisible, setSuccessScreenVisible] = useState(false);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);

  const partnerIdRef = useRef<string | null>(null);
  const holdTweenRef = useRef<gsap.core.Tween | null>(null);
  const progressRef = useRef({ value: 0 });
  const transitionTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const restoreSnapshotRef = useRef<PairSuccessRestoreSnapshot | null>(null);
  const dismissingRef = useRef(false);
  const navigatingRef = useRef(false);
  const phaseRef = useRef<PairingPhase>("idle");
  /** dismiss 后设备仍紧挨时，抑制重新进入 ready，避免 pointer-events:none 锁死画布 */
  const pairingCooldownRef = useRef(false);

  const ownerDevice = devices.find((device) => device.isOwner);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const resetHold = useCallback(() => {
    holdTweenRef.current?.kill();
    holdTweenRef.current = null;
    progressRef.current.value = 0;
    setHoldProgress(0);
  }, []);

  const findTouchPartner = useCallback((maxDistance: number): {
    partner: DeviceState;
    anchor: PairingAnchor;
  } | null => {
    if (!ownerDevice) return null;

    const ownerEl = deviceRefs.current?.get(ownerDevice.id);
    if (!ownerEl) return null;

    let nearestDevice: DeviceState | undefined;
    let nearestDistance = Infinity;

    for (const device of devices) {
      if (!devicesMatch(ownerDevice, device)) continue;
      const candidateEl = deviceRefs.current?.get(device.id);
      if (!candidateEl) continue;

      const distance = distanceBetweenDevices(ownerEl, candidateEl);
      if (distance > maxDistance) continue;

      if (distance < nearestDistance) {
        nearestDevice = device;
        nearestDistance = distance;
      }
    }

    if (!nearestDevice) return null;

    const ownerPos = getElementPosition(ownerEl);
    const partnerEl = deviceRefs.current?.get(nearestDevice.id);
    if (!partnerEl) return null;

    const partnerPos = getElementPosition(partnerEl);
    const ownerCenter = getDeviceCenter(ownerPos.x, ownerPos.y);
    const partnerCenter = getDeviceCenter(partnerPos.x, partnerPos.y);

    return {
      partner: nearestDevice,
      anchor: {
        x: (ownerCenter.x + partnerCenter.x) / 2,
        y: Math.min(ownerPos.y, partnerPos.y) - DEVICE_H * 0.55,
      },
    };
  }, [deviceRefs, devices, ownerDevice]);

  const resetPairingState = useCallback(() => {
    const wasDismissing = dismissingRef.current;
    pairingLockedRef.current = false;
    dismissingRef.current = false;
    partnerIdRef.current = null;
    restoreSnapshotRef.current = null;
    setMatchedPair(null);
    setSuccessScreenVisible(false);
    setActivePartnerId(null);
    phaseRef.current = "idle";
    setPhase("idle");
    resetHold();
    if (wasDismissing) {
      pairingCooldownRef.current = true;
    }
  }, [resetHold]);

  const completePairing = useCallback(() => {
    if (!ownerDevice || !partnerIdRef.current || pairingLockedRef.current) return;

    const partner = devices.find((device) => device.id === partnerIdRef.current);
    if (!partner) return;

    pairingLockedRef.current = true;
    resetHold();
    phaseRef.current = "success";
    setPhase("success");

    const pair: MatchedPair = {
      owner: ownerDevice,
      partner,
      matchScore: partner.matchScore,
      topics:
        ownerDevice.interestProfile && partner.interestProfile
          ? computeCommonTopics(ownerDevice.interestProfile, partner.interestProfile, 3)
          : pickMatchTopics(3),
    };
    setMatchedPair(pair);

    const playgroundEl = playgroundRef.current;
    if (!playgroundEl || playgroundSize.width === 0) {
      setSuccessScreenVisible(true);
      return;
    }

    restoreSnapshotRef.current = capturePairSuccessSnapshot(
      playgroundEl,
      headerRef.current,
      deviceRefs.current ?? new Map(),
    );

    const deviceElements = deviceRefs.current ?? new Map();
    const touchGeometry = computeTouchGeometry(
      deviceElements,
      ownerDevice.id,
      partner.id,
    );

    transitionTimelineRef.current?.kill();
    transitionTimelineRef.current = runPairSuccessTransition({
      playgroundEl,
      headerEl: headerRef.current,
      deviceElements,
      ownerId: ownerDevice.id,
      partnerId: partner.id,
      touchGeometry,
      playgroundSize,
      reducedMotion,
      onRevealScreens: () => setSuccessScreenVisible(true),
    });
  }, [
    deviceRefs,
    devices,
    headerRef,
    ownerDevice,
    playgroundRef,
    playgroundSize,
    reducedMotion,
    resetHold,
  ]);

  const startHold = useCallback(() => {
    if (phaseRef.current !== "ready" || pairingLockedRef.current) return;

    phaseRef.current = "holding";
    setPhase("holding");
    resetHold();

    holdTweenRef.current = gsap.to(progressRef.current, {
      value: 1,
      duration: MATCH_CONFIRM_HOLD_MS / 1000,
      ease: "none",
      onUpdate: () => setHoldProgress(progressRef.current.value),
      onComplete: completePairing,
    });
  }, [completePairing, resetHold]);

  const endHold = useCallback(() => {
    if (phaseRef.current !== "holding" || pairingLockedRef.current) return;
    resetHold();
    phaseRef.current = "ready";
    setPhase("ready");
  }, [resetHold]);

  const goToRoadmates = useCallback(
    (onNavigate: () => void) => {
      if (phase !== "success" || navigatingRef.current || dismissingRef.current || !matchedPair) {
        return;
      }

      navigatingRef.current = true;
      transitionTimelineRef.current?.kill();
      setSuccessScreenVisible(false);

      const playgroundEl = playgroundRef.current;
      if (!playgroundEl) {
        onNavigate();
        return;
      }

      transitionTimelineRef.current = runMatchToRoadmatesExitTransition({
        playgroundEl,
        ownerEl: deviceRefs.current?.get(matchedPair.owner.id),
        partnerEl: deviceRefs.current?.get(matchedPair.partner.id),
        reducedMotion,
        onNavigate,
      });
    },
    [deviceRefs, matchedPair, phase, playgroundRef, reducedMotion],
  );

  const dismissSuccess = useCallback(() => {
    if (phase !== "success" || dismissingRef.current || navigatingRef.current || !matchedPair) {
      return;
    }

    dismissingRef.current = true;
    transitionTimelineRef.current?.kill();
    setSuccessScreenVisible(false);

    const playgroundEl = playgroundRef.current;
    const snapshot = restoreSnapshotRef.current;

    if (!playgroundEl || !snapshot) {
      resetPlaygroundInteraction(deviceRefs.current ?? new Map(), headerRef.current);
      resetPairingState();
      return;
    }

    transitionTimelineRef.current = runPairSuccessDismissTransition({
      playgroundEl,
      headerEl: headerRef.current,
      deviceElements: deviceRefs.current ?? new Map(),
      ownerId: matchedPair.owner.id,
      partnerId: matchedPair.partner.id,
      snapshot,
      reducedMotion,
      onComplete: resetPairingState,
    });
  }, [
    deviceRefs,
    headerRef,
    matchedPair,
    phase,
    playgroundRef,
    reducedMotion,
    resetPairingState,
  ]);

  useEffect(() => {
    if (!enabled || pairingLockedRef.current) return;

    const tick = () => {
      const currentPhase = phaseRef.current;
      if (currentPhase === "success" || pairingLockedRef.current) return;

      if (pairingCooldownRef.current) {
        const stillTouching = findTouchPartner(PAIRING_TOUCH_DISTANCE);
        if (stillTouching) {
          partnerIdRef.current = null;
          setActivePartnerId(null);
          if (currentPhase !== "idle") {
            phaseRef.current = "idle";
            setPhase("idle");
          }
          return;
        }
        pairingCooldownRef.current = false;
      }

      const maxDistance =
        currentPhase === "idle"
          ? PAIRING_TOUCH_DISTANCE
          : PAIRING_TOUCH_EXIT_DISTANCE;

      const touch = findTouchPartner(maxDistance);
      if (!touch) {
        partnerIdRef.current = null;
        setActivePartnerId(null);
        if (currentPhase === "holding") {
          return;
        }
        if (currentPhase === "ready") {
          phaseRef.current = "idle";
          setPhase("idle");
        }
        return;
      }

      partnerIdRef.current = touch.partner.id;
      setActivePartnerId(touch.partner.id);
      // 长按期间冻结锚点，避免按钮随设备微动触发 pointerleave 误取消
      if (currentPhase !== "holding") {
        setAnchor(touch.anchor);
      }

      if (currentPhase === "idle") {
        phaseRef.current = "ready";
        setPhase("ready");
      }
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [enabled, findTouchPartner]);

  useEffect(() => {
    return () => {
      holdTweenRef.current?.kill();
      transitionTimelineRef.current?.kill();
    };
  }, []);

  return {
    phase,
    holdProgress,
    anchor,
    matchedPair,
    successScreenVisible,
    startHold,
    endHold,
    dismissSuccess,
    goToRoadmates,
    pairingLocked: phase === "success",
  };
}
