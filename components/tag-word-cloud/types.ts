export interface WordCloudTag {
  name: string;
  weight: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export type TagShape = "circle";

export interface TagLayout {
  id: string;
  tag: WordCloudTag;
  shape: TagShape;
  visualWeight: number;
  width: number;
  height: number;
  x: number;
  y: number;
  fontSize: number;
  hue: number;
}

export interface TagSnapshot {
  id: string;
  name: string;
  rect: DOMRectReadOnly;
  hue: number;
  fontSize: number;
  weight: number;
}

export interface TagWordCloudProps {
  tags: WordCloudTag[];
  height?: number;
  className?: string;
  emptyMessage?: string;
  interactive?: boolean;
  size?: "default" | "compact";
}

export interface TagWordCloudHandle {
  freezeAndSnapshot: () => TagSnapshot[];
  getContainerRect: () => DOMRect;
}
