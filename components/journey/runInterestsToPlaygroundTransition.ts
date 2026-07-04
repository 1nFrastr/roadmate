import gsap from "gsap";
import { computeLandingRect, JOURNEY_EASE, JOURNEY_TIMINGS } from "./constants";
import type { InjectTarget, LandingRect, JourneyTransitionSources, TagSnapshot } from "./types";

export interface TransitionCallbacks {
  onNavigate: (landingRect: LandingRect) => void;
  onHandoffReady: () => Promise<InjectTarget>;
  onDevicesEnter: () => void;
  onComplete: () => void;
}

function tagCenter(snap: TagSnapshot) {
  return {
    x: snap.rect.left + snap.rect.width / 2,
    y: snap.rect.top + snap.rect.height / 2,
  };
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

function fallbackInjectTarget(landing: LandingRect): InjectTarget {
  return {
    x: landing.x + landing.width / 2,
    y: landing.y + landing.height / 2,
  };
}

function runInjectPhase(
  tagClones: HTMLElement[],
  sortedTags: TagSnapshot[],
  target: InjectTarget,
  onDevicesEnter: () => void,
  onComplete: () => void,
) {
  const injectTl = gsap.timeline({
    onComplete: () => {
      tagClones.forEach((el) => el.remove());
      onDevicesEnter();
      onComplete();
    },
  });

  tagClones.forEach((clone, index) => {
    const snap = sortedTags[index];
    const center = tagCenter(snap);
    const injectStart =
      index * JOURNEY_TIMINGS.tagInjectStagger +
      gsap.utils.random(0, JOURNEY_TIMINGS.tagInjectRandomDelay);
    const duration =
      JOURNEY_TIMINGS.tagInjectDuration * gsap.utils.random(0.92, 1.06);
    const fadeStart = injectStart + duration * JOURNEY_TIMINGS.tagInjectOpacityAt;

    injectTl.to(
      clone,
      {
        x: target.x - center.x,
        y: target.y - center.y,
        scale: JOURNEY_TIMINGS.tagInjectScale,
        rotation: gsap.utils.random(-6, 6),
        duration,
        ease: JOURNEY_EASE.inject,
        boxShadow: "0 0 16px rgba(34,211,238,0.5)",
      },
      injectStart,
    );

    injectTl.to(
      clone,
      {
        opacity: 0,
        duration: duration * (1 - JOURNEY_TIMINGS.tagInjectOpacityAt),
        ease: "power1.in",
      },
      fadeStart,
    );
  });

  return injectTl;
}

export function runInterestsToPlaygroundTransition(
  overlayEl: HTMLElement,
  sources: JourneyTransitionSources,
  callbacks: TransitionCallbacks,
  reducedMotion: boolean,
): gsap.core.Timeline {
  const landing = computeLandingRect(window.innerWidth, window.innerHeight);

  if (reducedMotion) {
    callbacks.onNavigate(landing);
    callbacks.onComplete();
    return gsap.timeline();
  }

  const sortedTags = [...sources.tagSnapshots].sort((a, b) => b.weight - a.weight);
  const frameRoot = sources.iphoneFrame.parentElement ?? sources.iphoneFrame;
  const tl = gsap.timeline();
  const tagClones: HTMLElement[] = [];

  sortedTags.forEach((snap, index) => {
    tagClones.push(createTagClone(overlayEl, snap, 110 + index));
  });

  gsap.set(frameRoot, { opacity: 0 });
  gsap.set(sources.iphoneFrame, { opacity: 0 });

  tagClones.forEach((clone) => {
    gsap.set(clone, {
      xPercent: -50,
      yPercent: -50,
      scale: 1,
      opacity: 1,
      rotation: gsap.utils.random(-4, 4),
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

  tl.add(() => {
    callbacks.onNavigate(landing);
  }, JOURNEY_TIMINGS.injectPhaseStart);

  tl.add(() => {
    void callbacks.onHandoffReady().then((target) => {
      runInjectPhase(tagClones, sortedTags, target, callbacks.onDevicesEnter, () => {
        gsap.set(frameRoot, { opacity: 1 });
        gsap.set(sources.iphoneFrame, { opacity: 1, scale: 1, x: 0, y: 0, rotation: 0 });
        gsap.set(sources.header, { opacity: 1, y: 0 });
        gsap.set(sources.leftPanel, { opacity: 1, x: 0 });
        gsap.set(sources.previewAside, { opacity: 1, x: 0 });
        callbacks.onComplete();
      });
    });
  }, JOURNEY_TIMINGS.injectPhaseStart + JOURNEY_TIMINGS.handoffWait);

  return tl;
}

export { fallbackInjectTarget };
