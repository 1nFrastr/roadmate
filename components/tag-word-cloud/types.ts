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
  /** 冻结时的真实 DOM，供 Journey 过渡深拷贝 */
  element: HTMLElement;
  rect: DOMRectReadOnly;
  /** 祖先 scale 等造成的视口/布局比，过渡 clone 用 gsap scale 还原 */
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
  /** 允许选中 / 编辑自定义标签 */
  enableCustomTags?: boolean;
  selectedTagId?: string | null;
  onSelectTag?: (id: string | null) => void;
}

export interface TagWordCloudHandle {
  freezeAndSnapshot: () => TagSnapshot[];
  getContainerRect: () => DOMRect;
}
