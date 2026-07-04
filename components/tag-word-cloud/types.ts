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

export interface TagWordCloudProps {
  tags: WordCloudTag[];
  height?: number;
  className?: string;
  emptyMessage?: string;
}
