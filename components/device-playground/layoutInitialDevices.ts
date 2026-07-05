import {
  DEVICE_H,
  DEVICE_R,
  DEVICE_SPAWN_GAP,
  DEVICE_W,
  PLAYGROUND_PADDING,
  TOTAL_DEVICES,
} from "./constants";
import type { PlaygroundSize } from "./types";

const MIN_CENTER_DISTANCE = DEVICE_W + DEVICE_SPAWN_GAP;

function deviceCenter(pos: { x: number; y: number }) {
  return { x: pos.x + DEVICE_R, y: pos.y + DEVICE_R };
}

function positionsOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const ca = deviceCenter(a);
  const cb = deviceCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) < MIN_CENTER_DISTANCE;
}

function clampPosition(x: number, y: number, size: PlaygroundSize): { x: number; y: number } {
  const maxX = size.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = size.height - DEVICE_H - PLAYGROUND_PADDING;
  return {
    x: Math.max(PLAYGROUND_PADDING, Math.min(x, maxX)),
    y: Math.max(PLAYGROUND_PADDING, Math.min(y, maxY)),
  };
}

function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [indices[index], indices[swap]] = [indices[swap]!, indices[index]!];
  }
  return indices;
}

function randomPosition(size: PlaygroundSize): { x: number; y: number } {
  const maxX = size.width - DEVICE_W - PLAYGROUND_PADDING;
  const maxY = size.height - DEVICE_H - PLAYGROUND_PADDING;
  return clampPosition(
    PLAYGROUND_PADDING + Math.random() * Math.max(maxX - PLAYGROUND_PADDING, 1),
    PLAYGROUND_PADDING + Math.random() * Math.max(maxY - PLAYGROUND_PADDING, 1),
    size,
  );
}

function tryRejectionLayout(
  count: number,
  size: PlaygroundSize,
  reserved: Map<number, { x: number; y: number }>,
): { x: number; y: number }[] | null {
  const positions: { x: number; y: number }[] = [];
  const placed: { x: number; y: number }[] = [];

  for (let index = 0; index < count; index += 1) {
    const fixed = reserved.get(index);
    if (fixed) {
      positions[index] = fixed;
      placed.push(fixed);
      continue;
    }

    let found = false;
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const candidate = randomPosition(size);
      if (!placed.some((pos) => positionsOverlap(candidate, pos))) {
        positions[index] = candidate;
        placed.push(candidate);
        found = true;
        break;
      }
    }

    if (!found) return null;
  }

  return positions;
}

function gridLayout(
  count: number,
  size: PlaygroundSize,
  reserved: Map<number, { x: number; y: number }>,
): { x: number; y: number }[] {
  const pitch = MIN_CENTER_DISTANCE;
  const usableW = size.width - PLAYGROUND_PADDING * 2;
  const cols = Math.max(1, Math.floor((usableW + DEVICE_SPAWN_GAP) / pitch));
  const rows = Math.max(1, Math.ceil(count / cols));
  const maxJitter = Math.max(0, DEVICE_SPAWN_GAP * 0.35);

  const cellIndices = shuffleIndices(cols * rows);
  const positions: { x: number; y: number }[] = new Array(count);
  const placed: { x: number; y: number }[] = [];

  for (const [index, pos] of reserved) {
    positions[index] = pos;
    placed.push(pos);
  }

  let cellCursor = 0;
  for (let index = 0; index < count; index += 1) {
    if (positions[index]) continue;

    let assigned = false;
    while (cellCursor < cellIndices.length) {
      const cell = cellIndices[cellCursor]!;
      cellCursor += 1;
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      const jitterX = maxJitter > 0 ? (Math.random() - 0.5) * 2 * maxJitter : 0;
      const jitterY = maxJitter > 0 ? (Math.random() - 0.5) * 2 * maxJitter : 0;
      const candidate = clampPosition(
        PLAYGROUND_PADDING + col * pitch + jitterX,
        PLAYGROUND_PADDING + row * pitch + jitterY,
        size,
      );

      if (!placed.some((pos) => positionsOverlap(candidate, pos))) {
        positions[index] = candidate;
        placed.push(candidate);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const fallbackCol = index % cols;
      const fallbackRow = Math.floor(index / cols) % rows;
      const candidate = clampPosition(
        PLAYGROUND_PADDING + fallbackCol * pitch,
        PLAYGROUND_PADDING + fallbackRow * pitch,
        size,
      );
      positions[index] = candidate;
      placed.push(candidate);
    }
  }

  return positions;
}

/** 与 journey landing 一致：水平居中、垂直 55% */
export function getOwnerDefaultPosition(size: PlaygroundSize): { x: number; y: number } {
  return clampPosition(
    size.width * 0.5 - DEVICE_W / 2,
    size.height * 0.55 - DEVICE_H / 2,
    size,
  );
}

export function layoutInitialDevicePositions(
  size: PlaygroundSize,
  count = TOTAL_DEVICES,
  reserved: Map<number, { x: number; y: number }> = new Map(),
): { x: number; y: number }[] {
  return tryRejectionLayout(count, size, reserved) ?? gridLayout(count, size, reserved);
}
