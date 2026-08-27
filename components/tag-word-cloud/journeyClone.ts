import gsap from "gsap";
import type { TagSnapshot } from "./types";

/** Interactive-state classes stripped on transition clones; keep orb visual styles (including custom / shape) */
const STRIP_CLASSES = [
  "tag-word-cloud-item--selected",
  "cursor-grab",
  "active:cursor-grabbing",
  "cursor-pointer",
] as const;

/**
 * Viewport visual size / layout size, subtracting AABB inflation from the element's own GSAP scale and rotation.
 * Used when ancestors like IphonePreviewSlot apply transform: scale().
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
 * Deep-clone real tag DOM for the Journey transition overlay.
 * Style changes only need TagWordCloud render updates — no hand-kept clone structure.
 * Size stays in layout px (inline); visual scale is restored via gsap scale on the transition side.
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
