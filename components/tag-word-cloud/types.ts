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
  /** Frozen live DOM for Journey transition deep-cloning */
  element: HTMLElement;
  rect: DOMRectReadOnly;
  /** Viewport/layout ratio from ancestor scale etc.; transition clones restore via gsap scale */
  visualScale: number;
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
  /** Allow selecting / editing custom tags */
  enableCustomTags?: boolean;
  selectedTagId?: string | null;
  onSelectTag?: (id: string | null) => void;
}

export interface TagWordCloudHandle {
  freezeAndSnapshot: () => TagSnapshot[];
  getContainerRect: () => DOMRect;
}
