"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import Matter from "matter-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveMatchRoadmatesEntrance } from "@/components/match-to-roadmates";
import {
  clearJourneyLanding,
  loadJourneyLanding,
  useJourneyTransitionOptional,
} from "@/components/journey";
import { JOURNEY_TIMINGS } from "@/components/journey/constants";
import { DeviceCard } from "./DeviceCard";
import {
  DEVICE_DOCK_TRANSFORM_ORIGIN,
  DEVICE_STAGE_TRANSFORM_ORIGIN,
} from "./match-pairing/constants";
import { useMatchPairing } from "./match-pairing/useMatchPairing";
import {
  DEVICE_H,
  DEVICE_LABELS,
  DEVICE_W,
  MATCH_COUNT,
  OWNER_DEVICE_INDEX,
  pickMatchableIndices,
  PLAYGROUND_PADDING,
  randomMatchScore,
  TOTAL_DEVICES,
} from "./constants";
import { loadProfiles } from "@/components/interest-lab/storage";
import type { JourneyLandingPayload } from "@/components/journey";
import {
  buildSyntheticNeighborProfiles,
  computeMatchScore,
  hashString,
  profileFromStored,
  type DeviceInterestProfile,
} from "./matchScoring";
import { bodyToDevicePosition, useDevicePhysics } from "./useDevicePhysics";
import { useProximityEffects } from "./useProximityEffects";
import type { DeviceState, PlaygroundSize } from "./types";

gsap.registerPlugin(useGSAP, Draggable);

export type PlaygroundEntrance = "default" | "journey";

interface DevicePlaygroundProps {
  entrance?: PlaygroundEntrance;
}

interface CreateDevicesOptions {
  ownerProfile?: DeviceInterestProfile | null;
  ownerPosition?: { x: number; y: number };
}

function resolveOwnerProfile(payload: JourneyLandingPayload | null): DeviceInterestProfile | null {
  if (payload?.ownerProfile?.tags.length) {
    return payload.ownerProfile;
  }

  const [latestProfile] = loadProfiles();
  if (!latestProfile) return null;
  return profileFromStored(latestProfile.tags, latestProfile.embeddings);
}

function buildDeviceInterestState(
  matchableSlot: number,
  matchable: boolean,
  ownerProfile: DeviceInterestProfile | null,
  neighborProfiles: DeviceInterestProfile[] | null,
): Pick<DeviceState, "interestProfile" | "matchScore"> {
  if (matchable && ownerProfile && neighborProfiles && matchableSlot >= 0) {
    const neighborProfile = neighborProfiles[matchableSlot]!;
    return {
      interestProfile: neighborProfile,
      matchScore: computeMatchScore(ownerProfile, neighborProfile),
    };
  }

  return {
    matchScore: matchable ? randomMatchScore() : 0,
  };
}

function createDevices(size: PlaygroundSize, options: CreateDevicesOptions = {}): DeviceState[] {
  const matchableIndices = pickMatchableIndices(MATCH_COUNT, TOTAL_DEVICES);
  const matchableList = [...matchableIndices].sort((a, b) => a - b);
  const maxX = size.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = size.height - DEVICE_H - PLAYGROUND_PADDING;
  const ownerProfile = options.ownerProfile ?? null;
  const profileSeed = ownerProfile
    ? hashString(ownerProfile.tags.map((tag) => tag.name).join("|"))
    : 0;
  const neighborProfiles = ownerProfile
    ? buildSyntheticNeighborProfiles(ownerProfile, profileSeed)
    : null;
  const ownerPos = options.ownerPosition
    ? clampDevicePosition(options.ownerPosition.x, options.ownerPosition.y, size)
    : null;

  return Array.from({ length: TOTAL_DEVICES }, (_, index) => {
    const isOwner = index === OWNER_DEVICE_INDEX;
    const matchable = matchableIndices.has(index);
    const matchableSlot = matchableList.indexOf(index);
    const interestState = isOwner && ownerProfile
      ? { interestProfile: ownerProfile, matchScore: 0 }
      : buildDeviceInterestState(matchableSlot, matchable, ownerProfile, neighborProfiles);

    return {
      id: `device-${index}`,
      label: DEVICE_LABELS[index],
      isOwner,
      matchable,
      ...interestState,
      x: isOwner && ownerPos
        ? ownerPos.x
        : PLAYGROUND_PADDING + Math.random() * Math.max(maxX - PLAYGROUND_PADDING, 1),
      y: isOwner && ownerPos
        ? ownerPos.y
        : PLAYGROUND_PADDING + Math.random() * Math.max(maxY - PLAYGROUND_PADDING, 1),
    };
  });
}

function clampDevicePosition(x: number, y: number, size: PlaygroundSize) {
  const maxX = size.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = size.height - DEVICE_H - PLAYGROUND_PADDING;
  return {
    x: Math.max(PLAYGROUND_PADDING, Math.min(x, maxX)),
    y: Math.max(PLAYGROUND_PADDING, Math.min(y, maxY)),
  };
}

function offscreenStart(index: number, size: PlaygroundSize) {
  const slots = [
    { x: -DEVICE_W - 24, y: size.height * 0.2 },
    { x: size.width + 24, y: size.height * 0.18 },
    { x: -DEVICE_W - 24, y: size.height * 0.55 },
    { x: size.width + 24, y: size.height * 0.48 },
    { x: size.width * 0.25, y: -DEVICE_H - 24 },
    { x: size.width * 0.55, y: -DEVICE_H - 24 },
    { x: size.width * 0.2, y: size.height + 24 },
    { x: size.width * 0.7, y: size.height + 24 },
    { x: size.width + 40, y: size.height * 0.72 },
  ];
  return slots[index % slots.length];
}

export function DevicePlayground({ entrance = "default" }: DevicePlaygroundProps) {
  const router = useRouter();
  const playgroundRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const deviceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const ledRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pointerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activePairIdsRef = useRef<{ ownerId: string; matchableId: string } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const draggablesRef = useRef<Draggable[]>([]);
  const stackZIndexRef = useRef(10);
  const devicesEnterRegisteredRef = useRef(false);
  const journey = useJourneyTransitionOptional();

  const [playgroundSize, setPlaygroundSize] = useState<PlaygroundSize>({
    width: 0,
    height: 0,
  });
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [journeyMode, setJourneyMode] = useState(false);
  const [handoffDone, setHandoffDone] = useState(entrance !== "journey");
  const [devicesEnterDone, setDevicesEnterDone] = useState(entrance !== "journey");
  const [playgroundReadySent, setPlaygroundReadySent] = useState(false);
  const [activePairIds, setActivePairIds] = useState<{
    ownerId: string;
    matchableId: string;
  } | null>(null);

  const entranceComplete = !journeyMode || (handoffDone && devicesEnterDone);

  const physicsApiRef = useDevicePhysics(playgroundSize, devices, initialized && entranceComplete);
  const { updateMatchLeds, updateMatchPointers, updateDockProximity, resetDockScales, cleanup } =
    useProximityEffects(reducedMotion);
  const pairingLockedRef = useRef(false);
  const wasPairingLockedRef = useRef(false);

  const {
    phase: pairingPhase,
    holdProgressRef: pairingHoldProgressRef,
    matchedPair,
    successScreenVisible,
    activePartnerId,
    dismissSuccess,
    goToRoadmates,
    pairingLocked,
  } = useMatchPairing({
    devices,
    deviceRefs,
    playgroundRef,
    headerRef,
    playgroundSize,
    reducedMotion,
    enabled: initialized && entranceComplete,
    pairingLockedRef,
  });

  const pairingPhaseRef = useRef(pairingPhase);
  const activePartnerIdRef = useRef(activePartnerId);

  useEffect(() => {
    pairingPhaseRef.current = pairingPhase;
    activePartnerIdRef.current = activePartnerId;
  }, [activePartnerId, pairingPhase]);

  useEffect(() => {
    pairingLockedRef.current = pairingLocked;
  }, [pairingLocked]);

  const syncPhysicsFromDom = useCallback(() => {
    const api = physicsApiRef.current;
    if (!api) return;

    deviceRefs.current.forEach((element, id) => {
      const x = gsap.getProperty(element, "x") as number;
      const y = gsap.getProperty(element, "y") as number;
      api.setBodyPosition(id, x, y);
      api.setBodyStatic(id, false);
    });
  }, [physicsApiRef]);

  useEffect(() => {
    if (!pairingLocked || !matchedPair) return;

    draggingIdRef.current = null;
    const api = physicsApiRef.current;
    if (!api) return;

    api.setBodyStatic(matchedPair.owner.id, true);
    api.setBodyStatic(matchedPair.partner.id, true);
  }, [matchedPair, pairingLocked, physicsApiRef]);

  useEffect(() => {
    if (wasPairingLockedRef.current && !pairingLocked) {
      syncPhysicsFromDom();
    }
    wasPairingLockedRef.current = pairingLocked;
  }, [pairingLocked, syncPhysicsFromDom]);

  const ownerDevice = devices.find((device) => device.isOwner);
  const ownerId = `device-${OWNER_DEVICE_INDEX}`;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const element = playgroundRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPlaygroundSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (initialized || playgroundSize.width === 0 || playgroundSize.height === 0) {
      return;
    }

    const payload = loadJourneyLanding();
    const ownerProfile = resolveOwnerProfile(payload);

    if (entrance === "journey" && payload) {
      const playgroundRect = playgroundRef.current?.getBoundingClientRect();
      if (playgroundRect) {
        const ownerX = payload.landingRect.x - playgroundRect.left;
        const ownerY = payload.landingRect.y - playgroundRect.top;
        setDevices(
          createDevices(playgroundSize, {
            ownerProfile,
            ownerPosition: { x: ownerX, y: ownerY },
          }),
        );
        setJourneyMode(true);
        setInitialized(true);
        return;
      }
    }

    setDevices(createDevices(playgroundSize, { ownerProfile }));
    setJourneyMode(false);
    setHandoffDone(true);
    setDevicesEnterDone(true);
    setInitialized(true);
  }, [entrance, initialized, playgroundSize]);

  useEffect(() => {
    if (!journeyMode || !initialized) return;

    devices.forEach((device, index) => {
      const element = deviceRefs.current.get(device.id);
      if (!element) return;

      if (device.isOwner) {
        gsap.set(element, { x: device.x, y: device.y, opacity: 1, scale: 1 });
        return;
      }

      const start = offscreenStart(index, playgroundSize);
      gsap.set(element, { x: start.x, y: start.y, opacity: 0, scale: 0.85 });
    });
  }, [devices, initialized, journeyMode, playgroundSize]);

  useEffect(() => {
    if (!journeyMode || !initialized || playgroundReadySent) return;

    const ownerEl = deviceRefs.current.get(ownerId);
    if (!ownerEl) return;

    const screenEl = ownerEl.querySelector<HTMLElement>(".device-screen");
    const screenRect = screenEl?.getBoundingClientRect();
    const injectTarget = screenRect
      ? {
          x: screenRect.left + screenRect.width / 2,
          y: screenRect.top + screenRect.height / 2,
        }
      : {
          x: ownerEl.getBoundingClientRect().left + DEVICE_W / 2,
          y: ownerEl.getBoundingClientRect().top + DEVICE_H * 0.42,
        };

    journey?.notifyPlaygroundReady(injectTarget);
    setPlaygroundReadySent(true);
    setHandoffDone(true);
    clearJourneyLanding();
  }, [initialized, journey, journeyMode, ownerId, playgroundReadySent]);

  const runDevicesEnter = useCallback(() => {
    const tl = gsap.timeline({
      onComplete: () => setDevicesEnterDone(true),
    });
    const others = devices.filter((device) => !device.isOwner);

    others.forEach((device, index) => {
      const element = deviceRefs.current.get(device.id);
      if (!element) return;

      tl.to(
        element,
        {
          x: device.x,
          y: device.y,
          opacity: 1,
          scale: 1,
          duration: JOURNEY_TIMINGS.devicesEnterDuration,
          ease: "power2.out",
        },
        index * JOURNEY_TIMINGS.devicesEnterStagger,
      );
    });

    return tl;
  }, [devices]);

  useEffect(() => {
    if (!journeyMode || !initialized || !journey || devicesEnterRegisteredRef.current) return;

    journey.triggerDevicesEnter(runDevicesEnter);
    devicesEnterRegisteredRef.current = true;
  }, [initialized, journey, journeyMode, runDevicesEnter]);

  useEffect(() => {
    if (!initialized || devices.length === 0) return;

    const tick = () => {
      const refs = {
        deviceElements: deviceRefs.current,
        ledElements: ledRefs.current,
        pointerElements: pointerRefs.current,
      };
      const enabled = !pairingLockedRef.current;
      const partnerId = activePartnerIdRef.current;
      const pairingLedState =
        pairingPhaseRef.current === "holding" && partnerId
          ? {
              phase: pairingPhaseRef.current,
              ownerId,
              partnerId,
              holdProgress: pairingHoldProgressRef.current,
            }
          : null;
      updateMatchLeds(devices, refs, enabled, pairingLedState);
      const pair = updateMatchPointers(devices, refs, enabled);
      const prev = activePairIdsRef.current;
      if (
        pair?.ownerId !== prev?.ownerId ||
        pair?.matchableId !== prev?.matchableId
      ) {
        activePairIdsRef.current = pair;
        setActivePairIds(pair);
      }
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [initialized, devices, ownerId, updateMatchLeds, updateMatchPointers]);

  useEffect(() => {
    const api = physicsApiRef.current;
    if (!api || !initialized || !entranceComplete) return;

    const syncDomFromPhysics = () => {
      if (pairingLockedRef.current) return;

      const draggingId = draggingIdRef.current;
      api.bodies.forEach((body, id) => {
        if (id === draggingId) return;
        const element = deviceRefs.current.get(id);
        if (!element) return;
        const position = bodyToDevicePosition(body);
        gsap.set(element, { x: position.x, y: position.y });
      });
    };

    Matter.Events.on(api.engine, "afterUpdate", syncDomFromPhysics);
    return () => {
      Matter.Events.off(api.engine, "afterUpdate", syncDomFromPhysics);
    };
  }, [entranceComplete, initialized, physicsApiRef]);

  useGSAP(
    () => {
      if (
        !initialized ||
        devices.length === 0 ||
        !playgroundRef.current ||
        !entranceComplete
      ) {
        return;
      }

      const draggables: Draggable[] = [];
      const bounds = {
        minX: PLAYGROUND_PADDING,
        minY: PLAYGROUND_PADDING,
        maxX: playgroundSize.width - DEVICE_W - PLAYGROUND_PADDING,
        maxY: playgroundSize.height - DEVICE_H - PLAYGROUND_PADDING,
      };

      devices.forEach((device) => {
        const element = deviceRefs.current.get(device.id);
        if (!element) return;

        const x = (gsap.getProperty(element, "x") as number) || device.x;
        const y = (gsap.getProperty(element, "y") as number) || device.y;
        gsap.set(element, { scale: 1, opacity: 1 });
        physicsApiRef.current?.setBodyPosition(device.id, x, y);
        physicsApiRef.current?.setBodyStatic(device.id, false);

        const [draggable] = Draggable.create(element, {
          type: "x,y",
          bounds,
          onPress() {
            if (pairingLockedRef.current) return;
            draggingIdRef.current = device.id;
            physicsApiRef.current?.setBodyStatic(device.id, true);
            gsap.to(element, { scale: 1.05, duration: 0.2, overwrite: "auto" });
            element.style.zIndex = String(++stackZIndexRef.current);
          },
          onDrag() {
            if (pairingLockedRef.current) return;
            const x = gsap.getProperty(element, "x") as number;
            const y = gsap.getProperty(element, "y") as number;
            physicsApiRef.current?.setBodyPosition(device.id, x, y);
            updateDockProximity(device.id, { x, y }, devices, {
              deviceElements: deviceRefs.current,
              ledElements: ledRefs.current,
              pointerElements: pointerRefs.current,
            });
          },
          onRelease() {
            if (pairingLockedRef.current) return;
            const x = gsap.getProperty(element, "x") as number;
            const y = gsap.getProperty(element, "y") as number;
            physicsApiRef.current?.setBodyPosition(device.id, x, y);
            physicsApiRef.current?.setBodyStatic(device.id, false);
            gsap.to(element, { scale: 1, duration: 0.2, overwrite: "auto" });
            draggingIdRef.current = null;
            resetDockScales(devices, {
              deviceElements: deviceRefs.current,
              ledElements: ledRefs.current,
              pointerElements: pointerRefs.current,
            });
          },
        });

        draggables.push(draggable);
      });

      draggablesRef.current = draggables;

      return () => {
        draggables.forEach((draggable) => draggable.kill());
        draggablesRef.current = [];
      };
    },
    {
      scope: playgroundRef,
      dependencies: [
        initialized,
        devices,
        playgroundSize.width,
        playgroundSize.height,
        entranceComplete,
      ],
      revertOnUpdate: true,
    },
  );

  useEffect(() => {
    draggablesRef.current.forEach((draggable) => {
      if (pairingLocked) draggable.disable();
      else draggable.enable();
    });
  }, [pairingLocked]);

  useEffect(() => cleanup, [cleanup]);

  const matchableCount = devices.filter((device) => device.matchable).length;

  const handleGoToRoadmates = useCallback(() => {
    goToRoadmates(() => {
      saveMatchRoadmatesEntrance();
      router.push("/roadmates");
    });
  }, [goToRoadmates, router]);

  return (
    <div className="relative flex h-full w-full flex-col">
      <header
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-6 py-5"
      >
        <div>
          <p className="text-sm text-zinc-400">
            {pairingLocked
              ? "配对成功 · 共同兴趣已同步到设备屏幕"
              : pairingPhase === "holding"
                ? "设备重叠 · 环带绿灯加载中，保持接触完成配对"
                : "匹配设备相距 3 个设备直径内 LED 亮起，越近越快越亮 · 重叠碰一碰可配对"}
          </p>
          {initialized ? (
            <p className="mt-1 font-mono text-xs text-zinc-600">
              我的设备: {ownerDevice?.label ?? "RM-01"} · {matchableCount} / {TOTAL_DEVICES}{" "}
              matchable
            </p>
          ) : null}
        </div>
        <Link
          href="/"
          className="pointer-events-auto rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-300 backdrop-blur transition hover:border-zinc-500 hover:text-white"
        >
          ← 兴趣 Lab
        </Link>
      </header>

      <div ref={playgroundRef} className="device-playground relative min-h-0 flex-1">
        {devices.map((device) => {
          const isPairParticipant =
            matchedPair &&
            (device.id === matchedPair.owner.id || device.id === matchedPair.partner.id);
          const showMatchSuccess = Boolean(successScreenVisible && isPairParticipant);
          const pointerVisible = Boolean(
            activePairIds &&
              (device.id === activePairIds.ownerId ||
                device.id === activePairIds.matchableId),
          );

          return (
          <div
            key={device.id}
            ref={(element) => {
              if (element) deviceRefs.current.set(device.id, element);
              else deviceRefs.current.delete(device.id);
            }}
            className="absolute left-0 top-0 touch-none"
            style={{
              transformOrigin:
                pairingLocked && isPairParticipant
                  ? DEVICE_STAGE_TRANSFORM_ORIGIN
                  : DEVICE_DOCK_TRANSFORM_ORIGIN,
              pointerEvents:
                pairingLocked && isPairParticipant ? "auto" : undefined,
            }}
          >
            <DeviceCard
              device={device}
              showMatchSuccess={showMatchSuccess}
              pointerVisible={pointerVisible}
              matchScore={matchedPair?.matchScore}
              matchTopics={matchedPair?.topics}
              ledRef={(element) => {
                if (element) ledRefs.current.set(device.id, element);
                else ledRefs.current.delete(device.id);
              }}
              pointerRef={
                device.isOwner || device.matchable
                  ? (element) => {
                      if (element) pointerRefs.current.set(device.id, element);
                      else pointerRefs.current.delete(device.id);
                    }
                  : undefined
              }
            />
          </div>
          );
        })}

        {pairingLocked && successScreenVisible ? (
          <>
            <button
              type="button"
              className="pair-success-backdrop absolute inset-0 z-[160] cursor-default border-0 bg-transparent p-0"
              onClick={dismissSuccess}
              aria-label="点击空白处返回"
            />
            <div className="pair-success-actions pointer-events-none absolute inset-x-0 bottom-20 z-[170] flex justify-center px-4">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleGoToRoadmates();
                }}
                className="pointer-events-auto rounded-full border border-emerald-400/40 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-200 shadow-[0_4px_24px_rgba(16,185,129,0.15)] backdrop-blur-sm transition hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-[0.98]"
              >
                查看路友 App →
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
