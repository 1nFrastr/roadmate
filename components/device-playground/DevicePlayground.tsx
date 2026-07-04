"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import Matter from "matter-js";
import { useEffect, useRef, useState } from "react";
import { DeviceCard } from "./DeviceCard";
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
import {
  bodyToDevicePosition,
  useDevicePhysics,
} from "./useDevicePhysics";
import { useProximityEffects } from "./useProximityEffects";

gsap.registerPlugin(useGSAP, Draggable);

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

export function DevicePlayground() {
  const playgroundRef = useRef<HTMLDivElement>(null);
  const deviceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const ledRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const draggingIdRef = useRef<string | null>(null);

  const [playgroundSize, setPlaygroundSize] = useState<PlaygroundSize>({
    width: 0,
    height: 0,
  });
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const physicsApiRef = useDevicePhysics(playgroundSize, devices, initialized);
  const { updateProximity, resetAllEffects, startMatchableIdlePulse, cleanup } =
    useProximityEffects(reducedMotion);

  const ownerDevice = devices.find((device) => device.isOwner);
  const ownerId = ownerDevice?.id ?? `device-${OWNER_DEVICE_INDEX}`;

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
    setDevices(createInitialDevices(playgroundSize));
    setInitialized(true);
  }, [initialized, playgroundSize]);

  useEffect(() => {
    if (!initialized || devices.length === 0) return;

    const frame = requestAnimationFrame(() => {
      startMatchableIdlePulse(devices, {
        deviceElements: deviceRefs.current,
        ledElements: ledRefs.current,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [initialized, devices, startMatchableIdlePulse]);

  useEffect(() => {
    const api = physicsApiRef.current;
    if (!api || !initialized) return;

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
  }, [initialized, physicsApiRef]);

  useGSAP(
    () => {
      if (!initialized || devices.length === 0 || !playgroundRef.current) return;

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

        gsap.set(element, { x: device.x, y: device.y, scale: 1 });

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
            updateProximity(device.id, { x, y }, ownerId, devices, {
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
            resetAllEffects(devices, {
              deviceElements: deviceRefs.current,
              ledElements: ledRefs.current,
            });
            startMatchableIdlePulse(devices, {
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
      dependencies: [initialized, devices, playgroundSize.width, playgroundSize.height],
      revertOnUpdate: true,
    },
  );

  useEffect(() => cleanup, [cleanup]);

  const matchableCount = devices.filter((device) => device.matchable).length;

  return (
    <div className="relative flex h-full w-full flex-col">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-6 py-5">
        <p className="text-sm text-zinc-400">
          拖动带青色边框的「我的设备」靠近 match 设备 — LED 会随距离加速闪烁
        </p>
        {initialized ? (
          <p className="mt-1 font-mono text-xs text-zinc-600">
            我的设备: {ownerDevice?.label ?? "RM-01"} · {matchableCount} / {TOTAL_DEVICES}{" "}
            matchable
          </p>
        ) : null}
      </header>

      <div ref={playgroundRef} className="device-playground relative min-h-0 flex-1">
        {devices.map((device) => (
          <div
            key={device.id}
            ref={(element) => {
              if (element) deviceRefs.current.set(device.id, element);
              else deviceRefs.current.delete(device.id);
            }}
            className="absolute left-0 top-0 touch-none"
            style={{ transformOrigin: "center bottom" }}
          >
            <DeviceCard
              device={device}
              ledRef={(element) => {
                if (element) ledRefs.current.set(device.id, element);
                else ledRefs.current.delete(device.id);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
