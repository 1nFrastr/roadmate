"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import Matter from "matter-js";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CANVAS_PADDING, PHYSICS } from "./constants";
import type { CanvasSize, TagLayout, TagSnapshot, TagWordCloudHandle, TagWordCloudProps } from "./types";
import type { TagSizePreset } from "./constants";
import {
  applyResizeRepulsion,
  bodyTopLeft,
  buildTagLayoutDraft,
  createTagLayouts,
  createTagPhysicsBody,
  getBodyDiameter,
  replaceTagPhysicsBody,
  separateOverlappingBodies,
  spawnDroppedTagPosition,
  stepPhysicsEngine,
  tagLayoutId,
} from "./utils";

gsap.registerPlugin(useGSAP, Draggable);

function buildTagIdsKey(tags: TagWordCloudProps["tags"]) {
  return tags.map((tag, index) => tagLayoutId(tag, index)).join("|");
}

function buildCanvasKey(canvasWidth: number, height: number, size: TagSizePreset) {
  return `${canvasWidth}:${height}:${size}`;
}

export const TagWordCloud = forwardRef<TagWordCloudHandle, TagWordCloudProps>(function TagWordCloud(
  {
    tags,
    height = PHYSICS.defaultHeight,
    className = "",
    emptyMessage = "暂无标签",
    interactive = true,
    size = "default",
    enableCustomTags = false,
    selectedTagId = null,
    onSelectTag,
  },
  ref,
) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  const dragPressRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggablesRef = useRef<Draggable[]>([]);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const frozenRef = useRef(false);
  const liveLayoutsRef = useRef<TagLayout[]>([]);
  const prevWeightsRef = useRef<Map<string, number>>(new Map());
  const prevTagIdsRef = useRef<string[]>([]);
  const prevCanvasKeyRef = useRef("");
  const physicsRef = useRef<{
    engine: Matter.Engine;
    bodies: Map<string, Matter.Body>;
    setBodyPosition: (id: string, x: number, y: number) => void;
    setBodyStatic: (id: string, isStatic: boolean) => void;
  } | null>(null);

  const [canvasWidth, setCanvasWidth] = useState(0);
  const [liveLayouts, setLiveLayouts] = useState<TagLayout[]>([]);
  const [physicsGeneration, setPhysicsGeneration] = useState(0);

  const canvasSize = useMemo<CanvasSize>(
    () => ({ width: canvasWidth, height }),
    [canvasWidth, height],
  );

  const tagIdsKey = useMemo(() => buildTagIdsKey(tags), [tags]);
  const canvasKey = useMemo(
    () => buildCanvasKey(canvasSize.width, height, size),
    [canvasSize.width, height, size],
  );

  const ready = liveLayouts.length > 0;

  useEffect(() => {
    liveLayoutsRef.current = liveLayouts;
  }, [liveLayouts]);

  useImperativeHandle(ref, () => ({
    freezeAndSnapshot: () => {
      frozenRef.current = true;
      draggablesRef.current.forEach((item) => item.kill());
      draggablesRef.current = [];

      if (runnerRef.current) {
        Matter.Runner.stop(runnerRef.current);
      }

      physicsRef.current?.bodies.forEach((body, id) => {
        physicsRef.current?.setBodyStatic(id, true);
      });

      const snapshots: TagSnapshot[] = [];
      liveLayoutsRef.current.forEach((layout) => {
        const element = tagRefs.current.get(layout.id);
        if (!element) return;
        snapshots.push({
          id: layout.id,
          name: layout.tag.name,
          rect: element.getBoundingClientRect(),
          hue: layout.hue,
          fontSize: layout.fontSize,
          weight: layout.tag.weight,
        });
      });

      return snapshots;
    },
    getContainerRect: () => {
      const element = canvasRef.current;
      if (!element) {
        return new DOMRect(0, 0, 0, 0);
      }
      return element.getBoundingClientRect();
    },
  }));

  useEffect(() => {
    if (tags.length === 0 && !enableCustomTags) return;

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
  }, [enableCustomTags, height, tags.length]);

  useEffect(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0 || tags.length === 0) {
      setLiveLayouts([]);
      prevTagIdsRef.current = [];
      prevWeightsRef.current = new Map();
      return;
    }

    const ids = tags.map((tag, index) => tagLayoutId(tag, index));
    const prevIds = prevTagIdsRef.current;
    const canvasChanged = prevCanvasKeyRef.current !== "" && prevCanvasKeyRef.current !== canvasKey;
    const removedIds = prevIds.filter((id) => !ids.includes(id));
    const addedIds = ids.filter((id) => !prevIds.includes(id));
    const isInitial = prevIds.length === 0;

    if (isInitial || canvasChanged) {
      const nextLayouts = createTagLayouts(tags, canvasSize, size);
      setLiveLayouts(nextLayouts);
      liveLayoutsRef.current = nextLayouts;
      prevWeightsRef.current = new Map(ids.map((id, index) => [id, tags[index]?.weight ?? 0]));
      setPhysicsGeneration((value) => value + 1);
    } else {
      const api = physicsRef.current;
      let layouts = liveLayoutsRef.current;

      if (removedIds.length > 0) {
        removedIds.forEach((id) => {
          if (!api) return;
          const body = api.bodies.get(id);
          if (body) {
            Matter.Composite.remove(api.engine.world, body);
            api.bodies.delete(id);
          }
          tagRefs.current.delete(id);
          prevWeightsRef.current.delete(id);
        });

        layouts = layouts
          .filter((layout) => !removedIds.includes(layout.id))
          .map((layout) => {
            const tagIndex = ids.indexOf(layout.id);
            const tag = tags[tagIndex];
            if (!tag) return layout;

            const draft = buildTagLayoutDraft(tag, tags, layout.id, size);
            const body = api?.bodies.get(layout.id);
            if (!body) return { ...layout, ...draft, tag };

            const diameter = getBodyDiameter(body);
            const position = bodyTopLeft(body, diameter, diameter);
            return { ...layout, ...draft, tag, x: position.x, y: position.y };
          });
      }

      if (addedIds.length > 0) {
        const appended: TagLayout[] = [];

        addedIds.forEach((id) => {
          const tagIndex = ids.indexOf(id);
          const tag = tags[tagIndex];
          if (!tag) return;

          const draft = buildTagLayoutDraft(tag, tags, id, size);
          const position = spawnDroppedTagPosition(draft.width, draft.height, canvasSize, size);
          const layout: TagLayout = { ...draft, x: position.x, y: position.y };
          appended.push(layout);
          prevWeightsRef.current.set(id, tag.weight);

          if (api) {
            const body = createTagPhysicsBody(Matter, layout, layout.x, layout.y);
            Matter.Body.set(body, { label: layout.id });
            Matter.Sleeping.set(body, false);
            api.bodies.set(layout.id, body);
            Matter.Composite.add(api.engine.world, body);
          }
        });

        layouts = [...layouts, ...appended];
      }

      if (removedIds.length > 0 || addedIds.length > 0) {
        liveLayoutsRef.current = layouts;
        setLiveLayouts(layouts);
      }
    }

    prevTagIdsRef.current = ids;
    prevCanvasKeyRef.current = canvasKey;
  }, [tagIdsKey, canvasKey, tags, canvasSize, size]);

  useEffect(() => {
    if (!ready || liveLayouts.length === 0 || frozenRef.current) return;

    const layouts = liveLayoutsRef.current;
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: PHYSICS.gravityY },
    });
    engine.gravity.scale = PHYSICS.gravityScale;
    engine.positionIterations = 14;
    engine.velocityIterations = 10;

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
      Matter.Sleeping.set(body, false);
      bodies.set(layout.id, body);
    });

    separateOverlappingBodies(Matter, Array.from(bodies.values()));

    Matter.Composite.add(engine.world, [...walls, ...Array.from(bodies.values())]);

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    runnerRef.current = runner;

    physicsRef.current = {
      engine,
      bodies,
      setBodyPosition(id, x, y) {
        const body = bodies.get(id);
        const layout = liveLayoutsRef.current.find((item) => item.id === id);
        if (!body || !layout) return;
        const diameter = layout.width;
        Matter.Body.setPosition(body, {
          x: x + diameter / 2,
          y: y + diameter / 2,
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
      if (!api || frozenRef.current) return;
      const draggingId = draggingIdRef.current;
      api.bodies.forEach((body, id) => {
        if (id === draggingId) return;
        const element = tagRefs.current.get(id);
        const layout = liveLayoutsRef.current.find((item) => item.id === id);
        if (!element || !layout) return;
        const diameter = getBodyDiameter(body);
        const position = bodyTopLeft(body, diameter, diameter);
        gsap.set(element, { x: position.x, y: position.y, rotation: body.angle });
      });
    };

    gsap.ticker.add(syncDomFromPhysics);
    syncDomFromPhysics();

    return () => {
      gsap.ticker.remove(syncDomFromPhysics);
      Matter.Runner.stop(runner);
      runnerRef.current = null;
      Matter.Engine.clear(engine);
      Matter.Composite.clear(engine.world, false);
      physicsRef.current = null;
    };
  }, [physicsGeneration, ready, canvasSize.width, height]);

  useEffect(() => {
    const api = physicsRef.current;
    if (!api || liveLayouts.length === 0) return;

    liveLayoutsRef.current.forEach((layout) => {
      if (api.bodies.has(layout.id)) return;
      const body = createTagPhysicsBody(Matter, layout, layout.x, layout.y);
      Matter.Body.set(body, { label: layout.id });
      Matter.Sleeping.set(body, false);
      api.bodies.set(layout.id, body);
      Matter.Composite.add(api.engine.world, body);
    });
  }, [physicsGeneration, liveLayouts.length, tagIdsKey]);

  useEffect(() => {
    const api = physicsRef.current;
    if (!api || liveLayouts.length === 0 || tags.length === 0) return;

    const changedIds: string[] = [];
    const nextWeightMap = new Map<string, number>();

    tags.forEach((tag, index) => {
      const id = tagLayoutId(tag, index);
      nextWeightMap.set(id, tag.weight);
      const prevWeight = prevWeightsRef.current.get(id);
      if (prevWeight !== undefined && prevWeight !== tag.weight) {
        changedIds.push(id);
      }
    });

    if (changedIds.length === 0) {
      prevWeightsRef.current = nextWeightMap;
      return;
    }

    const current = liveLayoutsRef.current;
    const next = current.map((layout) => {
      if (!changedIds.includes(layout.id)) return layout;

      const tag = tags.find((item, index) => tagLayoutId(item, index) === layout.id);
      if (!tag) return layout;

      const draft = buildTagLayoutDraft(tag, tags, layout.id, size);
      const oldBody = api.bodies.get(layout.id);
      let body = oldBody;
      if (oldBody) {
        const center = { x: oldBody.position.x, y: oldBody.position.y };
        body = replaceTagPhysicsBody(Matter, api.engine.world, oldBody, draft.width, draft.visualWeight);
        Matter.Body.setPosition(body, center);
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(body, 0);
        api.bodies.set(layout.id, body);
      }

      const element = tagRefs.current.get(layout.id);
      if (element) {
        element.style.width = `${draft.width}px`;
        element.style.height = `${draft.height}px`;
        element.style.fontSize = `${draft.fontSize}px`;
        element.style.opacity = `${0.88 + draft.visualWeight * 0.12}`;
      }

      const diameter = body ? getBodyDiameter(body) : draft.width;
      const position = body
        ? bodyTopLeft(body, diameter, diameter)
        : { x: layout.x, y: layout.y };

      return {
        ...layout,
        ...draft,
        tag,
        x: position.x,
        y: position.y,
      };
    });

    const allBodies = Array.from(api.bodies.values());
    changedIds.forEach((id) => {
      const body = api.bodies.get(id);
      if (body) applyResizeRepulsion(Matter, body, allBodies);
    });
    stepPhysicsEngine(Matter, api.engine, 24);

    const synced = next.map((layout) => {
      const body = api.bodies.get(layout.id);
      if (!body) return layout;
      const diameter = getBodyDiameter(body);
      const position = bodyTopLeft(body, diameter, diameter);
      return { ...layout, x: position.x, y: position.y };
    });

    liveLayoutsRef.current = synced;
    setLiveLayouts(synced);
    prevWeightsRef.current = nextWeightMap;
  }, [tags, liveLayouts.length, size]);

  useGSAP(
    () => {
      if (!ready || liveLayouts.length === 0 || !canvasRef.current || !interactive || frozenRef.current) {
        return;
      }

      const draggables: Draggable[] = [];
      const bounds = {
        minX: CANVAS_PADDING,
        minY: CANVAS_PADDING,
        maxX: canvasSize.width - CANVAS_PADDING,
        maxY: height - CANVAS_PADDING,
      };

      liveLayoutsRef.current.forEach((layout) => {
        const element = tagRefs.current.get(layout.id);
        if (!element) return;

        const body = physicsRef.current?.bodies.get(layout.id);
        const diameter = body ? getBodyDiameter(body) : layout.width;
        const position = body
          ? bodyTopLeft(body, diameter, diameter)
          : { x: layout.x, y: layout.y };

        gsap.set(element, { x: position.x, y: position.y, rotation: body?.angle ?? 0, scale: 1 });

        const [draggable] = Draggable.create(element, {
          type: "x,y",
          bounds,
          onPress() {
            draggingIdRef.current = layout.id;
            dragPressRef.current = {
              id: layout.id,
              x: gsap.getProperty(element, "x") as number,
              y: gsap.getProperty(element, "y") as number,
            };
            if (!layout.tag.custom) {
              onSelectTag?.(null);
            }
            physicsRef.current?.setBodyStatic(layout.id, true);
            const liftScale = layout.tag.custom ? 1.1 : 1.08;
            gsap.to(element, { scale: liftScale, duration: 0.12, overwrite: "auto" });
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

            const press = dragPressRef.current;
            dragPressRef.current = null;
            if (layout.tag.custom && press?.id === layout.id) {
              const moved = Math.hypot(x - press.x, y - press.y);
              if (moved < 6) {
                onSelectTag?.(selectedTagId === layout.id ? null : layout.id);
              }
            }

            const body = physicsRef.current?.bodies.get(layout.id);
            if (body) {
              Matter.Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2,
                y: 0,
              });
              Matter.Sleeping.set(body, false);
            }
          },
        });

        draggables.push(draggable);
      });

      draggablesRef.current = draggables;

      return () => {
        draggables.forEach((item) => item.kill());
        draggablesRef.current = [];
      };
    },
    {
      scope: canvasRef,
      dependencies: [ready, tagIdsKey, liveLayouts.length, canvasSize.width, height, interactive, onSelectTag, selectedTagId],
      revertOnUpdate: true,
    },
  );

  const isEmpty = tags.length === 0;

  if (isEmpty && !enableCustomTags) {
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
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onSelectTag?.(null);
        }
      }}
    >
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xs leading-relaxed text-zinc-500">
          {emptyMessage}
        </div>
      ) : null}
      {!isEmpty && liveLayouts.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">加载词云…</div>
      ) : null}
      {liveLayouts.map((layout) => {
        const isCustom = Boolean(layout.tag.custom);
        const isSelected = selectedTagId === layout.id;

        return (
          <div
            key={layout.id}
            ref={(element) => {
              if (element) tagRefs.current.set(layout.id, element);
              else tagRefs.current.delete(layout.id);
            }}
            className={`tag-word-cloud-item tag-word-cloud-shape tag-word-cloud-shape-circle absolute left-0 top-0 flex items-center justify-center px-2 text-center font-semibold leading-tight text-zinc-50 ${
              interactive ? "touch-none" : "pointer-events-none"
            } ${isCustom ? "tag-word-cloud-item--custom cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${
              isSelected ? "tag-word-cloud-item--selected" : ""
            }`}
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
        );
      })}
    </div>
  );
});
