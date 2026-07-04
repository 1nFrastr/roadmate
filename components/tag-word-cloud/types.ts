export interface WordCloudTag {
  id?: string;
  name: string;
  weight: number;
  custom?: boolean;
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
  /** 允许选中 / 编辑自定义标签 */
  enableCustomTags?: boolean;
  selectedTagId?: string | null;
  onSelectTag?: (id: string | null) => void;
}

export interface TagWordCloudHandle {
  freezeAndSnapshot: () => TagSnapshot[];
  getContainerRect: () => DOMRect;
}
