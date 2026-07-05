"use client";

import Matter from "matter-js";
import { useEffect, useRef } from "react";
import { DEVICE_COLLISION_GROUP, DEVICE_H, DEVICE_R, DEVICE_W, PLAYGROUND_PADDING } from "./constants";
import type { DeviceState, PlaygroundSize } from "./types";

export interface DevicePhysicsApi {
  engine: Matter.Engine;
  bodies: Map<string, Matter.Body>;
  setBodyPosition: (id: string, x: number, y: number) => void;
  setBodyStatic: (id: string, isStatic: boolean) => void;
}

export function useDevicePhysics(
  playgroundSize: PlaygroundSize,
  devices: DeviceState[],
  ready: boolean,
): React.RefObject<DevicePhysicsApi | null> {
  const apiRef = useRef<DevicePhysicsApi | null>(null);

  useEffect(() => {
    if (!ready || playgroundSize.width === 0 || playgroundSize.height === 0) {
      return;
    }

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 },
    });

    const wallThickness = 60;
    const { width, height } = playgroundSize;
    const walls = [
      Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width + wallThickness * 2, wallThickness, {
        isStatic: true,
      }),
      Matter.Bodies.rectangle(
        width / 2,
        height + wallThickness / 2,
        width + wallThickness * 2,
        wallThickness,
        { isStatic: true },
      ),
      Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height + wallThickness * 2, {
        isStatic: true,
      }),
      Matter.Bodies.rectangle(
        width + wallThickness / 2,
        height / 2,
        wallThickness,
        height + wallThickness * 2,
        { isStatic: true },
      ),
    ];

    const bodies = new Map<string, Matter.Body>();

    devices.forEach((device) => {
      const body = Matter.Bodies.circle(
        device.x + DEVICE_R,
        device.y + DEVICE_R,
        DEVICE_R,
        {
          frictionAir: 0.08,
          friction: 0.3,
          restitution: 0.15,
          collisionFilter: { group: DEVICE_COLLISION_GROUP },
        },
      );
      Matter.Body.set(body, { label: device.id });
      bodies.set(device.id, body);
    });

    Matter.Composite.add(engine.world, [...walls, ...Array.from(bodies.values())]);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    apiRef.current = {
      engine,
      bodies,
      setBodyPosition(id, x, y) {
        const body = bodies.get(id);
        if (!body) return;
        Matter.Body.setPosition(body, {
          x: x + DEVICE_R,
          y: y + DEVICE_R,
        });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
      },
      setBodyStatic(id, isStatic) {
        const body = bodies.get(id);
        if (!body) return;
        Matter.Body.setStatic(body, isStatic);
      },
    };

    return () => {
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Composite.clear(engine.world, false);
      apiRef.current = null;
    };
  }, [ready, playgroundSize.width, playgroundSize.height, devices]);

  return apiRef;
}

export function clampDevicePosition(
  x: number,
  y: number,
  playgroundSize: PlaygroundSize,
): { x: number; y: number } {
  const maxX = playgroundSize.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = playgroundSize.height - DEVICE_H - PLAYGROUND_PADDING;
  return {
    x: Math.max(PLAYGROUND_PADDING, Math.min(maxX, x)),
    y: Math.max(PLAYGROUND_PADDING, Math.min(maxY, y)),
  };
}

export function getDeviceCenter(x: number, y: number) {
  return {
    x: x + DEVICE_R,
    y: y + DEVICE_R,
  };
}

export function bodyToDevicePosition(body: Matter.Body) {
  return {
    x: body.position.x - DEVICE_R,
    y: body.position.y - DEVICE_R,
  };
}
