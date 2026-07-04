import { CANVAS_PADDING, SPAWN_GAP, TAG_SIZE } from "./constants";
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
  const weights = tags.map((tag) => tag.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const map = new Map<string, number>();
  tags.forEach((tag) => {
    const linear = (tag.weight - min) / range;
    const visual = 0.04 + Math.pow(linear, 0.55) * 0.96;
    map.set(tag.name, visual);
  });
  return map;
}

export function measureTagBox(name: string, visualWeight: number) {
  const t = Math.max(0, Math.min(1, visualWeight));
  const fontSize = geometricScale(t, TAG_SIZE.minFont, TAG_SIZE.maxFont);
  const textWidth = name.length * TAG_SIZE.charWidth + TAG_SIZE.paddingX * 2;
  const diameter = Math.max(geometricScale(t, 56, 168), textWidth);
  const size = Math.min(diameter, 168);

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
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  let rowX = CANVAS_PADDING;
  let rowY = CANVAS_PADDING;
  let rowMaxH = 0;
  let airRow = 0;

  sizes.forEach(({ width, height }) => {
    if (rowX + width + CANVAS_PADDING > canvas.width) {
      rowX = CANVAS_PADDING;
      rowY += rowMaxH + SPAWN_GAP;
      rowMaxH = 0;
    }

    if (rowY + height + CANVAS_PADDING > canvas.height) {
      rowX = CANVAS_PADDING;
      rowY = -(airRow + 1) * (height + SPAWN_GAP) - CANVAS_PADDING;
      rowMaxH = 0;
      airRow += 1;
    }

    positions.push({ x: rowX, y: rowY });
    rowX += width + SPAWN_GAP;
    rowMaxH = Math.max(rowMaxH, height);
  });

  return positions;
}

export function createTagLayouts(tags: WordCloudTag[], canvas: CanvasSize): TagLayout[] {
  if (canvas.width === 0 || canvas.height === 0 || tags.length === 0) return [];

  const visualWeights = buildVisualWeights(tags);
  const drafts = tags.map((tag, index) => {
    const visualWeight = visualWeights.get(tag.name) ?? 0.5;
    const { width, height, fontSize } = measureTagBox(tag.name, visualWeight);
    return {
      id: `tag-${index}-${tag.name}`,
      tag,
      shape: "circle" as const,
      visualWeight,
      width,
      height,
      fontSize,
      hue: hashString(tag.name) % 360,
    };
  });

  drafts.sort((a, b) => b.width * b.height - a.width * a.height);
  const positions = packSpawnPositions(
    drafts.map((item) => ({ width: item.width, height: item.height })),
    canvas,
  );

  return drafts.map((item, index) => {
    const pos = positions[index] ?? { x: CANVAS_PADDING, y: CANVAS_PADDING };
    return {
      ...item,
      x: pos.x,
      y: pos.y,
    };
  });
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
