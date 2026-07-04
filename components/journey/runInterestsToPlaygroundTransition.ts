import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { DEVICE_H, DEVICE_W } from "@/components/device-playground/constants";
import { computeLandingRect, JOURNEY_EASE, JOURNEY_TIMINGS } from "./constants";
import type { LandingRect, JourneyTransitionSources, TagSnapshot } from "./types";

gsap.registerPlugin(Flip);

export interface TransitionCallbacks {
  onNavigate: (landingRect: LandingRect) => void;
  onHandoffReady: () => Promise<void>;
  onDevicesEnter: () => void;
  onComplete: () => void;
}

function createTagClone(overlayEl: HTMLElement, snap: TagSnapshot): HTMLElement {
  const clone = document.createElement("div");
  clone.className =
    "tag-word-cloud-item tag-word-cloud-shape tag-word-cloud-shape-circle journey-tag-clone flex items-center justify-center px-2 text-center font-semibold leading-tight text-zinc-50";
  clone.textContent = snap.name;
  clone.style.position = "fixed";
  clone.style.left = `${snap.rect.left}px`;
  clone.style.top = `${snap.rect.top}px`;
  clone.style.width = `${snap.rect.width}px`;
  clone.style.height = `${snap.rect.height}px`;
  clone.style.fontSize = `${snap.fontSize}px`;
  clone.style.setProperty("--tag-hue", String(snap.hue));
  clone.style.zIndex = "101";
  clone.style.pointerEvents = "none";
  clone.style.transformOrigin = "center center";
  overlayEl.appendChild(clone);
  return clone;
}

function createFrameGhost(overlayEl: HTMLElement, frameEl: HTMLElement): HTMLElement {
  const rect = frameEl.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "journey-frame-ghost iphone-app-frame";
  ghost.dataset.journey = "iphone-frame-ghost";
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  ghost.style.zIndex = "100";
  ghost.style.pointerEvents = "none";
  ghost.style.transformOrigin = "center center";

  const inner = frameEl.querySelector(".iphone-app-screen");
  if (inner) {
    const screenClone = inner.cloneNode(true) as HTMLElement;
    screenClone.style.height = "100%";
    ghost.appendChild(screenClone);
  }

  overlayEl.appendChild(ghost);
  return ghost;
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

  const tl = gsap.timeline({ onComplete: callbacks.onComplete });
  const tagClones: HTMLElement[] = [];
  const sortedTags = [...sources.tagSnapshots].sort((a, b) => b.weight - a.weight);

  sortedTags.forEach((snap) => {
    tagClones.push(createTagClone(overlayEl, snap));
  });

  const frameGhost = createFrameGhost(overlayEl, sources.iphoneFrame);
  gsap.set(sources.iphoneFrame, { opacity: 0 });

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
    sources.iphoneFrame,
    {
      scale: 1.03,
      duration: 0.25,
      ease: "power1.out",
    },
    0,
  );

  const injectStart = 0.3;
  tagClones.forEach((clone, index) => {
    const snap = sortedTags[index];
    const startX = snap.rect.left + snap.rect.width / 2;
    const startY = snap.rect.top + snap.rect.height / 2;
    const dx = sources.injectPoint.x - startX;
    const dy = sources.injectPoint.y - startY;

    tl.fromTo(
      clone,
      { x: 0, y: 0, scale: 1, opacity: 1 },
      {
        x: dx,
        y: dy,
        scale: 0.12,
        opacity: 0,
        duration: JOURNEY_TIMINGS.tagInjectDuration,
        ease: JOURNEY_EASE.inject,
        boxShadow: "0 0 12px rgba(34,211,238,0.6)",
      },
      injectStart + index * JOURNEY_TIMINGS.tagInjectStagger,
    );
  });

  const morphStart = 0.9;
  const flipState = Flip.getState(frameGhost);

  tl.add(() => {
    frameGhost.classList.add("journey-frame-morphed");
    frameGhost.style.width = `${DEVICE_W}px`;
    frameGhost.style.height = `${DEVICE_H}px`;
    frameGhost.style.left = `${landing.x}px`;
    frameGhost.style.top = `${landing.y}px`;
    frameGhost.style.borderRadius = "14px";
    frameGhost.style.maxWidth = "none";

    Flip.from(flipState, {
      duration: JOURNEY_TIMINGS.frameMorphDuration,
      ease: JOURNEY_EASE.out,
      absolute: true,
      scale: true,
      nested: true,
    });
  }, morphStart);

  tl.add(() => {
    callbacks.onNavigate(landing);
  }, JOURNEY_TIMINGS.navigateAt);

  tl.add(() => {
    void callbacks.onHandoffReady().then(() => {
      gsap.to(frameGhost, {
        opacity: 0,
        duration: JOURNEY_TIMINGS.handoffDuration,
        ease: "power1.inOut",
      });
    });
  }, JOURNEY_TIMINGS.navigateAt + 0.08);

  tl.add(() => {
    callbacks.onDevicesEnter();
  }, JOURNEY_TIMINGS.navigateAt + JOURNEY_TIMINGS.handoffDuration * 0.4);

  tl.add(() => {
    tagClones.forEach((el) => el.remove());
    frameGhost.remove();
    gsap.set(sources.iphoneFrame, { opacity: 1, scale: 1, x: 0 });
    gsap.set(sources.leftPanel, { opacity: 1, x: 0 });
  });

  return tl;
}
