"use client";

import gsap from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { devicesMatch } from "../constants";
import { getDeviceCenter } from "../useDevicePhysics";
import type { DeviceState } from "../types";
import { computeCommonTopics } from "../matchScoring";
import {
  MATCH_CONFIRM_HOLD_MS,
  PAIRING_OVERLAP_DISTANCE,
  PAIRING_OVERLAP_EXIT_DISTANCE,
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
import type { MatchedPair, PairingPhase, PairSuccessRestoreSnapshot } from "./types";

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
  const holdProgressRef = useRef(0);
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
  /** dismiss 后设备仍重叠时，抑制重新进入 holding，避免 pointer-events:none 锁死画布 */
  const pairingCooldownRef = useRef(false);

  const ownerDevice = devices.find((device) => device.isOwner);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const resetHold = useCallback(() => {
    holdTweenRef.current?.kill();
    holdTweenRef.current = null;
    progressRef.current.value = 0;
    holdProgressRef.current = 0;
  }, []);

  const findOverlapPartner = useCallback((maxCenterDistance: number): DeviceState | null => {
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
      if (distance >= maxCenterDistance) continue;

      if (distance < nearestDistance) {
        nearestDevice = device;
        nearestDistance = distance;
      }
    }

    return nearestDevice ?? null;
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
  }, [pairingLockedRef, resetHold]);

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
    pairingLockedRef,
  ]);

  const startHold = useCallback(() => {
    if (phaseRef.current !== "idle" || pairingLockedRef.current || !partnerIdRef.current) {
      return;
    }

    phaseRef.current = "holding";
    setPhase("holding");
    resetHold();

    holdTweenRef.current = gsap.to(progressRef.current, {
      value: 1,
      duration: MATCH_CONFIRM_HOLD_MS / 1000,
      ease: "none",
      onUpdate: () => {
        holdProgressRef.current = progressRef.current.value;
      },
      onComplete: completePairing,
    });
  }, [completePairing, pairingLockedRef, resetHold]);

  const endHold = useCallback(() => {
    if (phaseRef.current !== "holding" || pairingLockedRef.current) return;
    resetHold();
    phaseRef.current = "idle";
    setPhase("idle");
  }, [pairingLockedRef, resetHold]);

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
        const stillOverlapping = findOverlapPartner(PAIRING_OVERLAP_DISTANCE);
        if (stillOverlapping) {
          partnerIdRef.current = null;
          setActivePartnerId(null);
          if (currentPhase !== "idle") {
            resetHold();
            phaseRef.current = "idle";
            setPhase("idle");
          }
          return;
        }
        pairingCooldownRef.current = false;
      }

      const maxCenterDistance =
        currentPhase === "idle"
          ? PAIRING_OVERLAP_DISTANCE
          : PAIRING_OVERLAP_EXIT_DISTANCE;

      const partner = findOverlapPartner(maxCenterDistance);
      if (!partner) {
        partnerIdRef.current = null;
        setActivePartnerId(null);
        if (currentPhase === "holding") {
          endHold();
        }
        return;
      }

      if (partnerIdRef.current && partnerIdRef.current !== partner.id && currentPhase === "holding") {
        endHold();
      }

      partnerIdRef.current = partner.id;
      setActivePartnerId(partner.id);

      if (currentPhase === "idle") {
        startHold();
      }
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [enabled, endHold, findOverlapPartner, pairingLockedRef, resetHold, startHold]);

  useEffect(() => {
    return () => {
      holdTweenRef.current?.kill();
      transitionTimelineRef.current?.kill();
    };
  }, []);

  return {
    phase,
    holdProgressRef,
    matchedPair,
    successScreenVisible,
    activePartnerId,
    dismissSuccess,
    goToRoadmates,
    pairingLocked: phase === "success",
  };
}
