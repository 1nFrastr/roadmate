import gsap from "gsap";
import type { TagSnapshot } from "./types";

/** 过渡克隆时去掉的交互态 class，保留球体视觉样式（含 custom / shape） */
const STRIP_CLASSES = [
  "tag-word-cloud-item--selected",
  "cursor-grab",
  "active:cursor-grabbing",
  "cursor-pointer",
] as const;

/**
 * 视口视觉尺寸 / 布局尺寸，扣除元素自身 GSAP scale 与旋转造成的 AABB 膨胀。
 * 用于 IphonePreviewSlot 等祖先 transform: scale() 场景。
 */
export function measureTagVisualScale(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const layoutW = element.offsetWidth;
  const layoutH = element.offsetHeight;
  if (layoutW <= 0 || layoutH <= 0) return 1;

  const gsapScale = (gsap.getProperty(element, "scale") as number) || 1;
  const rotation = Math.abs((gsap.getProperty(element, "rotation") as number) || 0);
  const rad = (rotation * Math.PI) / 180;
  const inflationW = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad));
  const inflationH = Math.abs(Math.sin(rad)) + Math.abs(Math.cos(rad));

  const baseW = layoutW * gsapScale * inflationW;
  const baseH = layoutH * gsapScale * inflationH;
  const scaleX = baseW > 0 ? rect.width / baseW : 1;
  const scaleY = baseH > 0 ? rect.height / baseH : 1;
  return (scaleX + scaleY) / 2;
}

/**
 * 深拷贝真实标签 DOM 用于 Journey 过渡 overlay。
 * 样式变更只需改 TagWordCloud 渲染，无需同步手写 clone 结构。
 * 尺寸保留布局 px（inline），视觉缩放由 transition 侧 gsap scale 还原。
 */
export function cloneTagElementForJourney(
  snap: Pick<TagSnapshot, "element" | "rect">,
  overlayEl: HTMLElement,
  zIndex: number,
): HTMLElement {
  const centerX = snap.rect.left + snap.rect.width / 2;
  const centerY = snap.rect.top + snap.rect.height / 2;

  const clone = snap.element.cloneNode(true) as HTMLElement;
  clone.classList.add("journey-tag-clone");
  STRIP_CLASSES.forEach((className) => clone.classList.remove(className));

  clone.style.position = "fixed";
  clone.style.left = `${centerX}px`;
  clone.style.top = `${centerY}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.zIndex = String(zIndex);
  clone.style.pointerEvents = "none";
  clone.style.transformOrigin = "center center";

  overlayEl.appendChild(clone);
  return clone;
}
