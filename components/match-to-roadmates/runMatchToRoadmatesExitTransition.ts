import gsap from "gsap";

interface MatchToRoadmatesExitInput {
  playgroundEl: HTMLElement;
  ownerEl: HTMLDivElement | undefined;
  partnerEl: HTMLDivElement | undefined;
  reducedMotion: boolean;
  onNavigate: () => void;
}

export function runMatchToRoadmatesExitTransition({
  playgroundEl,
  ownerEl,
  partnerEl,
  reducedMotion,
  onNavigate,
}: MatchToRoadmatesExitInput): gsap.core.Timeline {
  const pairEls = [ownerEl, partnerEl].filter(Boolean) as HTMLDivElement[];

  const tl = gsap.timeline({
    onComplete: onNavigate,
  });

  playgroundEl.querySelector(".pair-confetti-layer")?.remove();

  if (reducedMotion) {
    tl.call(onNavigate);
    return tl;
  }

  if (pairEls.length > 0) {
    tl.to(
      pairEls,
      {
        opacity: 0,
        scale: "-=0.08",
        y: "+=20",
        duration: 0.42,
        ease: "power2.in",
      },
      0,
    );
  }

  tl.to(
    playgroundEl,
    {
      opacity: 0,
      duration: 0.32,
      ease: "power1.in",
    },
    0.12,
  );

  return tl;
}
