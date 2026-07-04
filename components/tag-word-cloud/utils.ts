import { CANVAS_PADDING, CUSTOM_TAG_WEIGHT_MAX, CUSTOM_TAG_WEIGHT_MIN, SPAWN_GAP, TAG_SIZE_BY_PRESET, type TagSizePreset } from "./constants";
import type { CanvasSize, TagLayout, WordCloudTag } from "./types";
import type Matter from "matter-js";

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function geometricScale(t: number, min: number, max: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return Math.round(min * Math.pow(max / min, clamped));
}

export function buildVisualWeights(tags: WordCloudTag[]): Map<string, number> {
  const inferred = tags.filter((tag) => !tag.custom);
  if (inferred.length === 0) return new Map();

  const weights = inferred.map((tag) => tag.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const map = new Map<string, number>();
  inferred.forEach((tag) => {
    const linear = (tag.weight - min) / range;
    const visual = 0.04 + Math.pow(linear, 0.55) * 0.96;
    map.set(tag.name, visual);
  });
  return map;
}

export function customTagVisualWeight(weight: number): number {
  const span = CUSTOM_TAG_WEIGHT_MAX - CUSTOM_TAG_WEIGHT_MIN || 1;
  const linear = (weight - CUSTOM_TAG_WEIGHT_MIN) / span;
  return 0.04 + Math.max(0, Math.min(1, linear)) * 0.96;
}

export function resolveTagVisualWeight(tag: WordCloudTag, tags: WordCloudTag[]): number {
  if (tag.custom) return customTagVisualWeight(tag.weight);
  return buildVisualWeights(tags).get(tag.name) ?? 0.5;
}

export function buildTagLayoutDraft(
  tag: WordCloudTag,
  tags: WordCloudTag[],
  id: string,
  preset: TagSizePreset = "default",
): Omit<TagLayout, "x" | "y"> {
  const visualWeight = resolveTagVisualWeight(tag, tags);
  const { width, height, fontSize } = measureTagBox(tag.name, visualWeight, preset);
  return {
    id,
    tag,
    shape: "circle",
    visualWeight,
    width,
    height,
    fontSize,
    hue: hashString(tag.name) % 360,
  };
}

export function tagLayoutId(tag: WordCloudTag, index: number): string {
  return tag.id ?? `tag-${index}-${tag.name}`;
}

export function measureTagBox(
  name: string,
  visualWeight: number,
  preset: TagSizePreset = "default",
) {
  const metrics = TAG_SIZE_BY_PRESET[preset];
  const t = Math.max(0, Math.min(1, visualWeight));
  const fontSize = geometricScale(t, metrics.minFont, metrics.maxFont);
  const textWidth = name.length * metrics.charWidth + metrics.paddingX * 2;
  const diameter = Math.max(geometricScale(t, metrics.minDiameter, metrics.maxDiameter), textWidth);
  const size = Math.min(diameter, metrics.maxDiameterCap);

  return {
    width: size,
    height: size,
    fontSize: Math.min(fontSize, Math.round(size * 0.34)),
  };
}

const BODY_OPTIONS = {
  frictionAir: 0.022,
  friction: 0.55,
  restitution: 0.04,
  slop: 0.01,
};

function packSpawnPositions(
  sizes: { width: number; height: number }[],
  canvas: CanvasSize,
  canvasPadding = CANVAS_PADDING,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  let rowX = canvasPadding;
  let rowY = canvasPadding;
  let rowMaxH = 0;
  let airRow = 0;

  sizes.forEach(({ width, height }) => {
    if (rowX + width + canvasPadding > canvas.width) {
      rowX = canvasPadding;
      rowY += rowMaxH + SPAWN_GAP;
      rowMaxH = 0;
    }

    if (rowY + height + canvasPadding > canvas.height) {
      rowX = canvasPadding;
      rowY = -(airRow + 1) * (height + SPAWN_GAP) - canvasPadding;
      rowMaxH = 0;
      airRow += 1;
    }

    positions.push({ x: rowX, y: rowY });
    rowX += width + SPAWN_GAP;
    rowMaxH = Math.max(rowMaxH, height);
  });

  return positions;
}

export function createTagLayouts(
  tags: WordCloudTag[],
  canvas: CanvasSize,
  preset: TagSizePreset = "default",
): TagLayout[] {
  if (canvas.width === 0 || canvas.height === 0 || tags.length === 0) return [];

  const canvasPadding = preset === "compact" ? 14 : CANVAS_PADDING;
  const drafts = tags.map((tag, index) => {
    const id = tagLayoutId(tag, index);
    return buildTagLayoutDraft(tag, tags, id, preset);
  });

  drafts.sort((a, b) => b.width * b.height - a.width * a.height);
  const positions = packSpawnPositions(
    drafts.map((item) => ({ width: item.width, height: item.height })),
    canvas,
    canvasPadding,
  );

  return drafts.map((item, index) => {
    const pos = positions[index] ?? { x: canvasPadding, y: canvasPadding };
    return {
      ...item,
      x: pos.x,
      y: pos.y,
    };
  });
}

export function spawnDroppedTagPosition(
  width: number,
  height: number,
  canvas: CanvasSize,
  preset: TagSizePreset = "default",
) {
  const padding = preset === "compact" ? 14 : CANVAS_PADDING;
  return {
    x: Math.max(padding, (canvas.width - width) / 2),
    y: -height - SPAWN_GAP,
  };
}

export function getBodyDiameter(body: Matter.Body): number {
  if (body.circleRadius) return body.circleRadius * 2;
  const bounds = body.bounds;
  return Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
}

export function stepPhysicsEngine(MatterApi: typeof Matter, engine: Matter.Engine, steps = 16) {
  const delta = 1000 / 60;
  for (let step = 0; step < steps; step += 1) {
    MatterApi.Engine.update(engine, delta);
  }
}

/** 替换圆形刚体（保持中心），确保碰撞半径与视觉尺寸一致 */
export function replaceTagPhysicsBody(
  MatterApi: typeof Matter,
  world: Matter.Composite,
  oldBody: Matter.Body,
  newDiameter: number,
  visualWeight: number,
): Matter.Body {
  const center = { x: oldBody.position.x, y: oldBody.position.y };
  const label = oldBody.label;

  MatterApi.Composite.remove(world, oldBody);

  const density = 0.001 + visualWeight * 0.004;
  const newBody = MatterApi.Bodies.circle(center.x, center.y, newDiameter / 2, {
    ...BODY_OPTIONS,
    density,
  });
  MatterApi.Body.set(newBody, { label });
  MatterApi.Body.setStatic(newBody, false);
  MatterApi.Composite.add(world, newBody);
  return newBody;
}

/** 缩放后给重叠球体冲量，让引擎继续模拟出可见位移 */
export function applyResizeRepulsion(
  MatterApi: typeof Matter,
  source: Matter.Body,
  bodies: Matter.Body[],
) {
  MatterApi.Sleeping.set(source, false);

  for (const body of bodies) {
    if (body.id === source.id || body.isStatic) continue;

    const collision = MatterApi.Collision.collides(source, body);
    const dx = body.position.x - source.position.x;
    const dy = body.position.y - source.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const overlap =
      collision?.depth ??
      getBodyDiameter(source) / 2 + getBodyDiameter(body) / 2 - dist;

    if (overlap <= 0.02) continue;

    MatterApi.Sleeping.set(body, false);
    const nx = dx / dist;
    const ny = dy / dist;
    const push = Math.min(9, overlap * 0.55 + 3.5);

    MatterApi.Body.setVelocity(body, {
      x: body.velocity.x + nx * push,
      y: body.velocity.y + ny * push,
    });
  }
}

export function bodyTopLeft(body: Matter.Body, width: number, height: number) {
  return {
    x: body.position.x - width / 2,
    y: body.position.y - height / 2,
  };
}

export function createTagPhysicsBody(
  MatterApi: typeof Matter,
  layout: TagLayout,
  x: number,
  y: number,
): Matter.Body {
  const cx = x + layout.width / 2;
  const cy = y + layout.height / 2;
  const density = 0.001 + layout.visualWeight * 0.004;
  const options = { ...BODY_OPTIONS, density };
  return MatterApi.Bodies.circle(cx, cy, layout.width / 2, options);
}

export function separateOverlappingBodies(MatterApi: typeof Matter, bodies: Matter.Body[]) {
  for (let pass = 0; pass < 24; pass += 1) {
    let moved = false;

    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const collision = MatterApi.Collision.collides(bodies[i], bodies[j]);
        if (!collision || collision.depth <= 0.01) continue;

        const normal = collision.normal;
        const shift = (collision.depth + SPAWN_GAP * 0.25) / 2;
        MatterApi.Body.translate(bodies[i], { x: -normal.x * shift, y: -normal.y * shift });
        MatterApi.Body.translate(bodies[j], { x: normal.x * shift, y: normal.y * shift });
        moved = true;
      }
    }

    if (!moved) break;
  }
}
