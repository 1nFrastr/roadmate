"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import Matter from "matter-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_PADDING, PHYSICS } from "./constants";
import type { CanvasSize, TagLayout, TagWordCloudProps } from "./types";
import { createTagLayouts, createTagPhysicsBody, separateOverlappingBodies } from "./utils";

gsap.registerPlugin(useGSAP, Draggable);

function bodyToTagPosition(body: Matter.Body, layout: TagLayout) {
  return {
    x: body.position.x - layout.width / 2,
    y: body.position.y - layout.height / 2,
  };
}

export function TagWordCloud({
  tags,
  height = PHYSICS.defaultHeight,
  className = "",
  emptyMessage = "暂无标签",
}: TagWordCloudProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  const physicsRef = useRef<{
    engine: Matter.Engine;
    bodies: Map<string, Matter.Body>;
    setBodyPosition: (id: string, x: number, y: number) => void;
    setBodyStatic: (id: string, isStatic: boolean) => void;
  } | null>(null);

  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvasSize = useMemo<CanvasSize>(
    () => ({ width: canvasWidth, height }),
    [canvasWidth, height],
  );

  const layouts = useMemo(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0 || tags.length === 0) return [];
    return createTagLayouts(tags, canvasSize);
  }, [tags, canvasSize]);
  const ready = layouts.length > 0;

  useEffect(() => {
    if (tags.length === 0) return;

    const element = canvasRef.current;
    if (!element) return;

    const measure = () => {
      const nextWidth = element.clientWidth;
      if (nextWidth > 0) setCanvasWidth(nextWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [height, tags.length]);

  useEffect(() => {
    if (!ready || layouts.length === 0) return;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: PHYSICS.gravityY },
    });
    engine.gravity.scale = PHYSICS.gravityScale;
    engine.positionIterations = 12;
    engine.velocityIterations = 8;

    const wallThickness = 80;
    const { width } = canvasSize;
    const floorY = height + wallThickness / 2 - 6;
    const walls = [
      Matter.Bodies.rectangle(width / 2, floorY, width + wallThickness * 2, wallThickness, {
        isStatic: true,
        friction: 0.9,
        restitution: 0.05,
      }),
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

    layouts.forEach((layout) => {
      const body = createTagPhysicsBody(Matter, layout, layout.x, layout.y);
      Matter.Body.set(body, { label: layout.id });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.04);
      bodies.set(layout.id, body);
    });

    separateOverlappingBodies(Matter, Array.from(bodies.values()));

    Matter.Composite.add(engine.world, [...walls, ...Array.from(bodies.values())]);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    physicsRef.current = {
      engine,
      bodies,
      setBodyPosition(id, x, y) {
        const body = bodies.get(id);
        const layout = layouts.find((item) => item.id === id);
        if (!body || !layout) return;
        Matter.Body.setPosition(body, {
          x: x + layout.width / 2,
          y: y + layout.height / 2,
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

    const syncDomFromPhysics = () => {
      const api = physicsRef.current;
      if (!api) return;
      const draggingId = draggingIdRef.current;
      api.bodies.forEach((body, id) => {
        if (id === draggingId) return;
        const element = tagRefs.current.get(id);
        const layout = layouts.find((item) => item.id === id);
        if (!element || !layout) return;
        const position = bodyToTagPosition(body, layout);
        gsap.set(element, { x: position.x, y: position.y, rotation: body.angle });
      });
    };

    gsap.ticker.add(syncDomFromPhysics);
    syncDomFromPhysics();

    return () => {
      gsap.ticker.remove(syncDomFromPhysics);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Composite.clear(engine.world, false);
      physicsRef.current = null;
    };
  }, [ready, layouts, canvasSize, height]);

  useGSAP(
    () => {
      if (!ready || layouts.length === 0 || !canvasRef.current) return;

      const draggables: Draggable[] = [];
      const bounds = {
        minX: CANVAS_PADDING,
        minY: CANVAS_PADDING,
        maxX: canvasSize.width - CANVAS_PADDING,
        maxY: height - CANVAS_PADDING,
      };

      layouts.forEach((layout) => {
        const element = tagRefs.current.get(layout.id);
        if (!element) return;

        gsap.set(element, { x: layout.x, y: layout.y, rotation: 0, scale: 1 });

        const [draggable] = Draggable.create(element, {
          type: "x,y",
          bounds,
          onPress() {
            draggingIdRef.current = layout.id;
            physicsRef.current?.setBodyStatic(layout.id, true);
            gsap.to(element, { scale: 1.08, duration: 0.12, overwrite: "auto" });
            element.style.zIndex = "50";
          },
          onDrag() {
            const x = gsap.getProperty(element, "x") as number;
            const y = gsap.getProperty(element, "y") as number;
            physicsRef.current?.setBodyPosition(layout.id, x, y);
          },
          onRelease() {
            const x = gsap.getProperty(element, "x") as number;
            const y = gsap.getProperty(element, "y") as number;
            physicsRef.current?.setBodyPosition(layout.id, x, y);
            physicsRef.current?.setBodyStatic(layout.id, false);
            gsap.to(element, { scale: 1, duration: 0.12, overwrite: "auto" });
            element.style.zIndex = "";
            draggingIdRef.current = null;

            const body = physicsRef.current?.bodies.get(layout.id);
            if (body) {
              Matter.Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2,
                y: 0,
              });
            }
          },
        });

        draggables.push(draggable);
      });

      return () => {
        draggables.forEach((item) => item.kill());
      };
    },
    {
      scope: canvasRef,
      dependencies: [ready, layouts, canvasSize.width, height],
      revertOnUpdate: true,
    },
  );

  if (tags.length === 0) {
    return (
      <div
        className={`tag-word-cloud-empty flex items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 ${className}`}
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className={`tag-word-cloud relative w-full overflow-hidden rounded-xl border border-zinc-800 ${className}`}
      style={{ height }}
    >
      {layouts.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">加载词云…</div>
      ) : null}
      {layouts.map((layout) => (
        <div
          key={layout.id}
          ref={(element) => {
            if (element) tagRefs.current.set(layout.id, element);
            else tagRefs.current.delete(layout.id);
          }}
          className="tag-word-cloud-item tag-word-cloud-shape tag-word-cloud-shape-circle absolute left-0 top-0 flex touch-none cursor-grab items-center justify-center px-2 text-center font-semibold leading-tight text-zinc-50 active:cursor-grabbing"
          style={{
            width: layout.width,
            height: layout.height,
            transformOrigin: "center center",
            fontSize: layout.fontSize,
            opacity: 0.88 + layout.visualWeight * 0.12,
            ["--tag-hue" as string]: layout.hue,
          }}
        >
          {layout.tag.name}
        </div>
      ))}
    </div>
  );
}
