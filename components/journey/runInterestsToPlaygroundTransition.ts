import gsap from "gsap";
import { computeLandingRect, JOURNEY_EASE, JOURNEY_TIMINGS } from "./constants";
import type { LandingRect, JourneyTransitionSources, TagSnapshot } from "./types";

export interface TransitionCallbacks {
  onNavigate: (landingRect: LandingRect) => void;
  onHandoffReady: () => Promise<void>;
  onDevicesEnter: () => void;
  onComplete: () => void;
}

function tagCenter(snap: TagSnapshot) {
  return {
    x: snap.rect.left + snap.rect.width / 2,
    y: snap.rect.top + snap.rect.height / 2,
  };
}

function computeBurstOrigin(sources: JourneyTransitionSources, tags: TagSnapshot[]) {
  const frameRect = sources.iphoneFrame.getBoundingClientRect();
  if (frameRect.width > 0 && frameRect.height > 0) {
    return {
      x: frameRect.left + frameRect.width / 2,
      y: frameRect.top + frameRect.height * 0.52,
    };
  }

  if (tags.length === 0) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  const sum = tags.reduce(
    (acc, snap) => {
      const center = tagCenter(snap);
      return { x: acc.x + center.x, y: acc.y + center.y };
    },
    { x: 0, y: 0 },
  );

  return { x: sum.x / tags.length, y: sum.y / tags.length };
}

function computeBurstScale(snap: TagSnapshot, viewportMin: number) {
  const weightT = gsap.utils.clamp(0, 1, snap.weight);
  const targetDiameter =
    gsap.utils.mapRange(0, 1, viewportMin * 0.11, viewportMin * 0.22, weightT) +
    gsap.utils.random(-14, 18);
  const scale = targetDiameter / snap.rect.width;
  return gsap.utils.clamp(
    JOURNEY_TIMINGS.tagBloomScaleMin,
    JOURNEY_TIMINGS.tagBloomScaleMax,
    scale,
  );
}

interface BurstPlan {
  offsetX: number;
  offsetY: number;
  rotation: number;
  bloomScale: number;
  peakScale: number;
  burstDuration: number;
  settleDuration: number;
}

/** 网格分区 + shuffle，把标签散满屏幕，避免扎堆 */
function planBurstLayout(
  tags: TagSnapshot[],
  viewportW: number,
  viewportH: number,
  origin: { x: number; y: number },
  viewportMin: number,
): BurstPlan[] {
  const bloomScales = tags.map((snap) => computeBurstScale(snap, viewportMin));
  const count = tags.length;
  const aspect = viewportW / Math.max(viewportH, 1);
  const cols = Math.max(3, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.max(2, Math.ceil(count / cols));

  const padX = viewportW * JOURNEY_TIMINGS.tagBurstPadX;
  const padTop = viewportH * JOURNEY_TIMINGS.tagBurstPadTop;
  const minX = padX;
  const maxX = viewportW - padX;
  const minY = padTop;
  const rawMaxY = Math.min(
    viewportH * 0.84,
    origin.y - JOURNEY_TIMINGS.tagBurstOriginClearance,
  );
  const maxY = Math.max(minY + 80, rawMaxY);

  const cellW = (maxX - minX) / cols;
  const cellH = (maxY - minY) / rows;
  const slots = Array.from({ length: cols * rows }, (_, index) => index);
  gsap.utils.shuffle(slots);

  return tags.map((snap, index) => {
    const slot = slots[index % slots.length] ?? index;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const bloomScale = bloomScales[index] * gsap.utils.random(0.84, 1.12);
    const half = (snap.rect.width * bloomScale) / 2;
    const center = tagCenter(snap);

    const targetX = minX + (col + gsap.utils.random(0.06, 0.94)) * cellW;
    const targetY = minY + (row + gsap.utils.random(0.06, 0.94)) * cellH;
    const clampedX = gsap.utils.clamp(minX + half, maxX - half, targetX);
    const clampedY = gsap.utils.clamp(minY + half, maxY - half, targetY);

    return {
      offsetX: clampedX - center.x,
      offsetY: clampedY - center.y,
      rotation: gsap.utils.random(-38, 38),
      bloomScale,
      peakScale: bloomScale * gsap.utils.random(1.05, 1.12),
      burstDuration: gsap.utils.random(0.26, 0.4),
      settleDuration: gsap.utils.random(0.3, 0.5),
    };
  });
}

function createTagClone(overlayEl: HTMLElement, snap: TagSnapshot, zIndex: number): HTMLElement {
  const center = tagCenter(snap);
  const clone = document.createElement("div");
  clone.className =
    "tag-word-cloud-item tag-word-cloud-shape tag-word-cloud-shape-circle journey-tag-clone flex items-center justify-center px-2 text-center font-semibold leading-tight text-zinc-50";
  clone.textContent = snap.name;
  clone.style.position = "fixed";
  clone.style.left = `${center.x}px`;
  clone.style.top = `${center.y}px`;
  clone.style.width = `${snap.rect.width}px`;
  clone.style.height = `${snap.rect.height}px`;
  clone.style.fontSize = `${snap.fontSize}px`;
  clone.style.setProperty("--tag-hue", String(snap.hue));
  clone.style.zIndex = String(zIndex);
  clone.style.pointerEvents = "none";
  clone.style.transformOrigin = "center center";
  overlayEl.appendChild(clone);
  return clone;
}

export function runInterestsToPlaygroundTransition(
  overlayEl: HTMLElement,
  sources: JourneyTransitionSources,
  callbacks: TransitionCallbacks,
  reducedMotion: boolean,
): gsap.core.Timeline {
  const landing = computeLandingRect(window.innerWidth, window.innerHeight);
  const convergePoint = {
    x: landing.x + landing.width / 2,
    y: landing.y + landing.height / 2,
  };

  if (reducedMotion) {
    callbacks.onNavigate(landing);
    callbacks.onComplete();
    return gsap.timeline();
  }

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const viewportMin = Math.min(viewportW, viewportH);
  const sortedTags = [...sources.tagSnapshots].sort((a, b) => b.weight - a.weight);
  const burstOrigin = computeBurstOrigin(sources, sortedTags);
  const burstPlans = planBurstLayout(
    sortedTags,
    viewportW,
    viewportH,
    burstOrigin,
    viewportMin,
  );

  const frameRoot = sources.iphoneFrame.parentElement ?? sources.iphoneFrame;
  const tl = gsap.timeline({ onComplete: callbacks.onComplete });
  const tagClones: HTMLElement[] = [];

  sortedTags.forEach((snap, index) => {
    tagClones.push(createTagClone(overlayEl, snap, 101 + index));
  });

  gsap.set(frameRoot, { opacity: 0 });
  gsap.set(sources.iphoneFrame, { opacity: 0 });

  tagClones.forEach((clone) => {
    gsap.set(clone, {
      xPercent: -50,
      yPercent: -50,
      scale: gsap.utils.random(0.55, 0.78),
      opacity: 0.88,
      rotation: gsap.utils.random(-12, 12),
    });
  });

  tl.to(
    sources.header,
    {
      opacity: 0,
      y: -20,
      duration: JOURNEY_TIMINGS.headerExit,
      ease: JOURNEY_EASE.out,
    },
    0,
  );

  tl.to(
    sources.leftPanel,
    {
      opacity: 0,
      x: -48,
      duration: JOURNEY_TIMINGS.leftPanelExit,
      ease: JOURNEY_EASE.out,
    },
    0,
  );

  tl.to(
    sources.previewAside,
    {
      opacity: 0,
      x: 48,
      duration: JOURNEY_TIMINGS.previewAsideExit,
      ease: JOURNEY_EASE.out,
    },
    0,
  );

  let latestConvergeEnd: number = JOURNEY_TIMINGS.tagBloomStart;

  tagClones.forEach((clone, index) => {
    const snap = sortedTags[index];
    const center = tagCenter(snap);
    const plan = burstPlans[index];
    const bloomDelay =
      index * JOURNEY_TIMINGS.tagBloomStagger +
      gsap.utils.random(0, JOURNEY_TIMINGS.tagBloomRandomDelay);
    const bloomStart = JOURNEY_TIMINGS.tagBloomStart + bloomDelay;
    const bloomDuration = plan.burstDuration + plan.settleDuration;
    const moveDuration = bloomDuration;

    tl.to(
      clone,
      {
        x: plan.offsetX,
        y: plan.offsetY,
        rotation: plan.rotation,
        opacity: 1,
        duration: moveDuration,
        ease: JOURNEY_EASE.burst,
        boxShadow: `0 0 28px hsla(${snap.hue}, 78%, 62%, 0.55)`,
      },
      bloomStart,
    );

    tl.to(
      clone,
      {
        scale: plan.peakScale,
        duration: plan.burstDuration,
        ease: JOURNEY_EASE.burst,
      },
      bloomStart,
    );

    tl.to(
      clone,
      {
        scale: plan.bloomScale,
        duration: plan.settleDuration,
        ease: JOURNEY_EASE.bloom,
      },
      bloomStart + plan.burstDuration,
    );

    const injectDelay = bloomDelay + bloomDuration + gsap.utils.random(0, JOURNEY_TIMINGS.tagInjectGap);
    const injectStart = JOURNEY_TIMINGS.tagBloomStart + injectDelay;
    const dx = convergePoint.x - center.x;
    const dy = convergePoint.y - center.y;

    tl.to(
      clone,
      {
        x: dx,
        y: dy,
        scale: JOURNEY_TIMINGS.tagInjectScale,
        opacity: 0,
        rotation: gsap.utils.random(-8, 8),
        duration: JOURNEY_TIMINGS.tagInjectDuration * gsap.utils.random(0.88, 1.08),
        ease: JOURNEY_EASE.inject,
        boxShadow: "0 0 18px rgba(34,211,238,0.65)",
      },
      injectStart,
    );

    latestConvergeEnd = Math.max(latestConvergeEnd, injectStart + JOURNEY_TIMINGS.tagInjectDuration);
  });

  const navigateAt = Math.max(
    JOURNEY_TIMINGS.navigateAtMin,
    latestConvergeEnd - JOURNEY_TIMINGS.navigateLead,
  );

  tl.add(() => {
    callbacks.onNavigate(landing);
  }, navigateAt);

  tl.add(() => {
    void callbacks.onHandoffReady();
  }, navigateAt + 0.06);

  tl.add(() => {
    callbacks.onDevicesEnter();
  }, navigateAt + JOURNEY_TIMINGS.handoffDuration * 0.35);

  tl.add(() => {
    tagClones.forEach((el) => el.remove());
    gsap.set(frameRoot, { opacity: 1 });
    gsap.set(sources.iphoneFrame, { opacity: 1, scale: 1, x: 0, y: 0, rotation: 0 });
    gsap.set(sources.header, { opacity: 1, y: 0 });
    gsap.set(sources.leftPanel, { opacity: 1, x: 0 });
    gsap.set(sources.previewAside, { opacity: 1, x: 0 });
  });

  return tl;
}
