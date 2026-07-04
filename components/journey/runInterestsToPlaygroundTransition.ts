import gsap from "gsap";
import { cloneTagElementForJourney } from "@/components/tag-word-cloud/journeyClone";
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
        scale: snap.visualScale * JOURNEY_TIMINGS.tagInjectScale,
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
    tagClones.push(cloneTagElementForJourney(snap, overlayEl, 110 + index));
  });

  gsap.set(frameRoot, { opacity: 0 });
  gsap.set(sources.iphoneFrame, { opacity: 0 });

  tagClones.forEach((clone, index) => {
    const snap = sortedTags[index];
    if (!snap) return;
    gsap.set(clone, {
      xPercent: -50,
      yPercent: -50,
      scale: snap.visualScale,
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
