"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import Matter from "matter-js";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearJourneyLanding,
  loadJourneyLanding,
  useJourneyTransitionOptional,
} from "@/components/journey";
import { JOURNEY_TIMINGS } from "@/components/journey/constants";
import { DeviceCard } from "./DeviceCard";
import { MatchConfirmButton } from "./match-pairing/MatchConfirmButton";
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
import type { DeviceState, PlaygroundSize } from "./types";
import { bodyToDevicePosition, useDevicePhysics } from "./useDevicePhysics";
import { useProximityEffects } from "./useProximityEffects";

gsap.registerPlugin(useGSAP, Draggable);

export type PlaygroundEntrance = "default" | "journey";

interface DevicePlaygroundProps {
  entrance?: PlaygroundEntrance;
}

function createInitialDevices(size: PlaygroundSize): DeviceState[] {
  const matchableIndices = pickMatchableIndices(MATCH_COUNT, TOTAL_DEVICES);
  const maxX = size.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = size.height - DEVICE_H - PLAYGROUND_PADDING;

  return Array.from({ length: TOTAL_DEVICES }, (_, index) => ({
    id: `device-${index}`,
    label: DEVICE_LABELS[index],
    isOwner: index === OWNER_DEVICE_INDEX,
    matchable: matchableIndices.has(index),
    matchScore: matchableIndices.has(index) ? randomMatchScore() : 0,
    x: PLAYGROUND_PADDING + Math.random() * Math.max(maxX - PLAYGROUND_PADDING, 1),
    y: PLAYGROUND_PADDING + Math.random() * Math.max(maxY - PLAYGROUND_PADDING, 1),
  }));
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

function createJourneyDevices(size: PlaygroundSize, ownerX: number, ownerY: number): DeviceState[] {
  const matchableIndices = pickMatchableIndices(MATCH_COUNT, TOTAL_DEVICES);
  const maxX = size.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = size.height - DEVICE_H - PLAYGROUND_PADDING;
  const ownerPos = clampDevicePosition(ownerX, ownerY, size);

  return Array.from({ length: TOTAL_DEVICES }, (_, index) => {
    const isOwner = index === OWNER_DEVICE_INDEX;
    return {
      id: `device-${index}`,
      label: DEVICE_LABELS[index],
      isOwner,
      matchable: matchableIndices.has(index),
      matchScore: matchableIndices.has(index) ? randomMatchScore() : 0,
      x: isOwner
        ? ownerPos.x
        : PLAYGROUND_PADDING + Math.random() * Math.max(maxX - PLAYGROUND_PADDING, 1),
      y: isOwner
        ? ownerPos.y
        : PLAYGROUND_PADDING + Math.random() * Math.max(maxY - PLAYGROUND_PADDING, 1),
    };
  });
}

export function DevicePlayground({ entrance = "default" }: DevicePlaygroundProps) {
  const playgroundRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const deviceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const ledRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
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

  const entranceComplete = !journeyMode || (handoffDone && devicesEnterDone);

  const physicsApiRef = useDevicePhysics(playgroundSize, devices, initialized && entranceComplete);
  const { updateMatchLeds, updateDockProximity, resetDockScales, cleanup } =
    useProximityEffects(reducedMotion);

  const {
    phase: pairingPhase,
    holdProgress,
    anchor: pairingAnchor,
    matchedPair,
    successScreenVisible,
    startHold,
    endHold,
    dismissSuccess,
    pairingLocked,
  } = useMatchPairing({
    devices,
    deviceRefs,
    playgroundRef,
    headerRef,
    playgroundSize,
    reducedMotion,
    enabled: initialized && entranceComplete,
  });

  const pairingReady = pairingPhase === "ready" || pairingPhase === "holding";

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

    if (entrance === "journey") {
      const payload = loadJourneyLanding();
      if (payload) {
        const playgroundRect = playgroundRef.current?.getBoundingClientRect();
        if (playgroundRect) {
          const ownerX = payload.landingRect.x - playgroundRect.left;
          const ownerY = payload.landingRect.y - playgroundRect.top;
          setDevices(createJourneyDevices(playgroundSize, ownerX, ownerY));
          setJourneyMode(true);
          setInitialized(true);
          return;
        }
      }
    }

    setDevices(createInitialDevices(playgroundSize));
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
      updateMatchLeds(devices, {
        deviceElements: deviceRefs.current,
        ledElements: ledRefs.current,
      });
    };

    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [initialized, devices, updateMatchLeds]);

  useEffect(() => {
    const api = physicsApiRef.current;
    if (!api || !initialized || !entranceComplete) return;

    const syncDomFromPhysics = () => {
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
        !entranceComplete ||
        pairingLocked
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
            draggingIdRef.current = device.id;
            physicsApiRef.current?.setBodyStatic(device.id, true);
            gsap.to(element, { scale: 1.05, duration: 0.2, overwrite: "auto" });
            element.style.zIndex = "100";
          },
          onDrag() {
            const x = gsap.getProperty(element, "x") as number;
            const y = gsap.getProperty(element, "y") as number;
            physicsApiRef.current?.setBodyPosition(device.id, x, y);
            updateDockProximity(device.id, { x, y }, devices, {
              deviceElements: deviceRefs.current,
              ledElements: ledRefs.current,
            });
          },
          onRelease() {
            const x = gsap.getProperty(element, "x") as number;
            const y = gsap.getProperty(element, "y") as number;
            physicsApiRef.current?.setBodyPosition(device.id, x, y);
            physicsApiRef.current?.setBodyStatic(device.id, false);
            gsap.to(element, { scale: 1, duration: 0.2, overwrite: "auto" });
            element.style.zIndex = "";
            draggingIdRef.current = null;
            resetDockScales(devices, {
              deviceElements: deviceRefs.current,
              ledElements: ledRefs.current,
            });
          },
        });

        draggables.push(draggable);
      });

      return () => {
        draggables.forEach((draggable) => draggable.kill());
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
        pairingLocked,
      ],
      revertOnUpdate: true,
    },
  );

  useEffect(() => cleanup, [cleanup]);

  const matchableCount = devices.filter((device) => device.matchable).length;

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
              : pairingReady
                ? "设备已靠近 · 长按确认匹配完成配对"
                : "匹配设备相距 5 个设备宽度内 LED 亮起，越近越快越亮 · 碰一碰可确认配对"}
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

          return (
          <div
            key={device.id}
            ref={(element) => {
              if (element) deviceRefs.current.set(device.id, element);
              else deviceRefs.current.delete(device.id);
            }}
            className="absolute left-0 top-0 touch-none"
            style={{
              transformOrigin: "center bottom",
              pointerEvents:
                pairingLocked && isPairParticipant ? "auto" : undefined,
            }}
          >
            <DeviceCard
              device={device}
              showMatchSuccess={showMatchSuccess}
              matchScore={matchedPair?.matchScore}
              matchTopics={matchedPair?.topics}
              ledRef={(element) => {
                if (element) ledRefs.current.set(device.id, element);
                else ledRefs.current.delete(device.id);
              }}
            />
          </div>
          );
        })}

        <MatchConfirmButton
          visible={pairingReady}
          progress={holdProgress}
          x={pairingAnchor.x}
          y={pairingAnchor.y}
          onHoldStart={startHold}
          onHoldEnd={endHold}
        />

        {pairingLocked && successScreenVisible ? (
          <button
            type="button"
            className="pair-success-backdrop absolute inset-0 z-[160] cursor-default border-0 bg-transparent p-0"
            onClick={dismissSuccess}
            aria-label="点击空白处返回"
          >
            <span className="pair-success-dismiss-hint pointer-events-none absolute inset-x-0 bottom-8 text-center font-mono text-xs text-zinc-500/90">
              点击空白处返回
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
