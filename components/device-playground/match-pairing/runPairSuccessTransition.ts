import gsap from "gsap";
import { DEVICE_H, DEVICE_W } from "../constants";
import { getDeviceCenter } from "../useDevicePhysics";
import type { PlaygroundSize } from "../types";
import { launchConfetti } from "./confetti";
import type { DeviceTransformSnapshot, PairSuccessRestoreSnapshot } from "./types";

function readDeviceSnapshot(element: HTMLDivElement): DeviceTransformSnapshot {
  return {
    x: gsap.getProperty(element, "x") as number,
    y: gsap.getProperty(element, "y") as number,
    rotation: (gsap.getProperty(element, "rotation") as number) || 0,
    scale: (gsap.getProperty(element, "scale") as number) || 1,
    opacity: (gsap.getProperty(element, "opacity") as number) ?? 1,
  };
}

/** 清除成功动画写入的 inline / GSAP 交互锁，恢复画布可拖拽 */
export function resetPlaygroundInteraction(
  deviceElements: Map<string, HTMLDivElement>,
  headerEl: HTMLElement | null,
) {
  deviceElements.forEach((element) => {
    gsap.set(element, { clearProps: "pointerEvents,zIndex" });
    element.style.pointerEvents = "";
    element.style.zIndex = "";
  });
  if (headerEl) {
    gsap.set(headerEl, { clearProps: "pointerEvents" });
    headerEl.style.pointerEvents = "";
  }
}

function applyDeviceSnapshot(element: HTMLDivElement, snapshot: DeviceTransformSnapshot) {
  gsap.set(element, {
    x: snapshot.x,
    y: snapshot.y,
    rotation: snapshot.rotation,
    scale: snapshot.scale,
    opacity: snapshot.opacity,
    clearProps: "pointerEvents,zIndex",
  });
  element.style.pointerEvents = "";
  element.style.zIndex = "";
}

export function capturePairSuccessSnapshot(
  playgroundEl: HTMLElement,
  headerEl: HTMLElement | null,
  deviceElements: Map<string, HTMLDivElement>,
): PairSuccessRestoreSnapshot {
  const devices = new Map<string, DeviceTransformSnapshot>();
  deviceElements.forEach((element, id) => {
    devices.set(id, readDeviceSnapshot(element));
  });

  return {
    devices,
    header: headerEl
      ? {
          opacity: (gsap.getProperty(headerEl, "opacity") as number) ?? 1,
          y: (gsap.getProperty(headerEl, "y") as number) || 0,
        }
      : null,
    playgroundBackground: playgroundEl.style.backgroundColor,
  };
}

interface PairSuccessDismissInput {
  playgroundEl: HTMLElement;
  headerEl: HTMLElement | null;
  deviceElements: Map<string, HTMLDivElement>;
  ownerId: string;
  partnerId: string;
  snapshot: PairSuccessRestoreSnapshot;
  reducedMotion: boolean;
  onComplete?: () => void;
}

export function runPairSuccessDismissTransition({
  playgroundEl,
  headerEl,
  deviceElements,
  ownerId,
  partnerId,
  snapshot,
  reducedMotion,
  onComplete,
}: PairSuccessDismissInput): gsap.core.Timeline {
  playgroundEl.querySelector(".pair-confetti-layer")?.remove();

  const ownerEl = deviceElements.get(ownerId);
  const partnerEl = deviceElements.get(partnerId);
  const ownerSnapshot = snapshot.devices.get(ownerId);
  const partnerSnapshot = snapshot.devices.get(partnerId);
  const otherEntries = [...snapshot.devices.entries()].filter(
    ([id]) => id !== ownerId && id !== partnerId,
  );

  const tl = gsap.timeline({
    onComplete: () => {
      resetPlaygroundInteraction(deviceElements, headerEl);
      onComplete?.();
    },
  });

  if (reducedMotion) {
    otherEntries.forEach(([id, deviceSnapshot]) => {
      const element = deviceElements.get(id);
      if (!element) return;
      applyDeviceSnapshot(element, deviceSnapshot);
    });
    if (ownerEl && ownerSnapshot) applyDeviceSnapshot(ownerEl, ownerSnapshot);
    if (partnerEl && partnerSnapshot) applyDeviceSnapshot(partnerEl, partnerSnapshot);
    if (headerEl && snapshot.header) {
      gsap.set(headerEl, {
        opacity: snapshot.header.opacity,
        y: snapshot.header.y,
        clearProps: "pointerEvents",
      });
    }
    playgroundEl.style.backgroundColor = snapshot.playgroundBackground;
    tl.call(() => {});
    return tl;
  }

  if (ownerEl && ownerSnapshot) {
    tl.to(
      ownerEl,
      {
        x: ownerSnapshot.x,
        y: ownerSnapshot.y,
        rotation: ownerSnapshot.rotation,
        scale: ownerSnapshot.scale,
        duration: 0.65,
        ease: "power3.inOut",
      },
      0,
    );
  }

  if (partnerEl && partnerSnapshot) {
    tl.to(
      partnerEl,
      {
        x: partnerSnapshot.x,
        y: partnerSnapshot.y,
        rotation: partnerSnapshot.rotation,
        scale: partnerSnapshot.scale,
        duration: 0.65,
        ease: "power3.inOut",
      },
      0,
    );
  }

  tl.to(
    playgroundEl,
    {
      backgroundColor: snapshot.playgroundBackground || "transparent",
      duration: 0.5,
      ease: "power1.inOut",
    },
    0.05,
  );

  otherEntries.forEach(([id, deviceSnapshot], index) => {
    const element = deviceElements.get(id);
    if (!element) return;

    tl.to(
      element,
      {
        opacity: deviceSnapshot.opacity,
        scale: deviceSnapshot.scale,
        duration: 0.45,
        ease: "power2.out",
      },
      0.12 + index * 0.02,
    );
  });

  if (headerEl && snapshot.header) {
    tl.to(
      headerEl,
      {
        opacity: snapshot.header.opacity,
        y: snapshot.header.y,
        duration: 0.4,
        ease: "power2.out",
      },
      0.2,
    );
  }

  tl.call(
    () => {
      otherEntries.forEach(([id, deviceSnapshot]) => {
        const element = deviceElements.get(id);
        if (!element) return;
        applyDeviceSnapshot(element, deviceSnapshot);
      });

      if (ownerEl && ownerSnapshot) {
        applyDeviceSnapshot(ownerEl, ownerSnapshot);
      }
      if (partnerEl && partnerSnapshot) {
        applyDeviceSnapshot(partnerEl, partnerSnapshot);
      }
      if (headerEl && snapshot.header) {
        gsap.set(headerEl, {
          opacity: snapshot.header.opacity,
          y: snapshot.header.y,
          clearProps: "pointerEvents",
        });
      }
    },
    [],
    0.72,
  );

  return tl;
}

interface PairSuccessLayoutEntry {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface PairTouchGeometry {
  leftId: string;
  rightId: string;
}

export function computeTouchGeometry(
  deviceElements: Map<string, HTMLDivElement>,
  ownerId: string,
  partnerId: string,
): PairTouchGeometry {
  const ownerEl = deviceElements.get(ownerId);
  const partnerEl = deviceElements.get(partnerId);

  if (!ownerEl || !partnerEl) {
    return { leftId: ownerId, rightId: partnerId };
  }

  const ownerPos = {
    x: gsap.getProperty(ownerEl, "x") as number,
    y: gsap.getProperty(ownerEl, "y") as number,
  };
  const partnerPos = {
    x: gsap.getProperty(partnerEl, "x") as number,
    y: gsap.getProperty(partnerEl, "y") as number,
  };
  const ownerCenterX = getDeviceCenter(ownerPos.x, ownerPos.y).x;
  const partnerCenterX = getDeviceCenter(partnerPos.x, partnerPos.y).x;

  if (ownerCenterX <= partnerCenterX) {
    return { leftId: ownerId, rightId: partnerId };
  }

  return { leftId: partnerId, rightId: ownerId };
}

const V_TILT_DEGREES = 24;

export function computePairSuccessLayout(
  size: PlaygroundSize,
  geometry: PairTouchGeometry,
): Record<string, PairSuccessLayoutEntry> {
  const cx = size.width / 2;
  const cy = size.height / 2 + 16;
  const spread = Math.min(size.width * 0.2, 108);
  const scale = Math.min(2.15, (size.height * 0.72) / DEVICE_H);

  return {
    [geometry.leftId]: {
      x: cx - spread - DEVICE_W / 2,
      y: cy - DEVICE_H / 2,
      rotation: V_TILT_DEGREES,
      scale,
    },
    [geometry.rightId]: {
      x: cx + spread - DEVICE_W / 2,
      y: cy - DEVICE_H / 2,
      rotation: -V_TILT_DEGREES,
      scale,
    },
  };
}

interface RunPairSuccessTransitionInput {
  playgroundEl: HTMLElement;
  headerEl: HTMLElement | null;
  deviceElements: Map<string, HTMLDivElement>;
  ownerId: string;
  partnerId: string;
  touchGeometry: PairTouchGeometry;
  playgroundSize: PlaygroundSize;
  reducedMotion: boolean;
  onRevealScreens: () => void;
  onComplete?: () => void;
}

export function runPairSuccessTransition({
  playgroundEl,
  headerEl,
  deviceElements,
  ownerId,
  partnerId,
  touchGeometry,
  playgroundSize,
  reducedMotion,
  onRevealScreens,
  onComplete,
}: RunPairSuccessTransitionInput): gsap.core.Timeline {
  const layoutById = computePairSuccessLayout(playgroundSize, touchGeometry);
  const ownerLayout = layoutById[ownerId];
  const partnerLayout = layoutById[partnerId];
  const ownerEl = deviceElements.get(ownerId);
  const partnerEl = deviceElements.get(partnerId);
  const otherEls = [...deviceElements.entries()]
    .filter(([id]) => id !== ownerId && id !== partnerId)
    .map(([, element]) => element);

  const confettiLayer = document.createElement("div");
  confettiLayer.className = "pair-confetti-layer";
  playgroundEl.appendChild(confettiLayer);

  let cleanupConfetti: (() => void) | undefined;

  const tl = gsap.timeline({
    onComplete: () => {
      onComplete?.();
      window.setTimeout(() => {
        cleanupConfetti?.();
        confettiLayer.remove();
      }, 2200);
    },
  });

  if (reducedMotion) {
    if (headerEl) gsap.set(headerEl, { opacity: 0, pointerEvents: "none" });
    gsap.set(otherEls, { opacity: 0, pointerEvents: "none" });
    if (ownerEl && ownerLayout) {
      gsap.set(ownerEl, {
        ...ownerLayout,
        zIndex: 200,
        pointerEvents: "auto",
      });
    }
    if (partnerEl && partnerLayout) {
      gsap.set(partnerEl, {
        ...partnerLayout,
        zIndex: 200,
        pointerEvents: "auto",
      });
    }
    onRevealScreens();
    onComplete?.();
    return tl;
  }

  if (headerEl) {
    tl.to(
      headerEl,
      { opacity: 0, y: -12, duration: 0.35, ease: "power2.in" },
      0,
    );
    tl.set(headerEl, { pointerEvents: "none" }, 0.35);
  }

  tl.to(
    otherEls,
    {
      opacity: 0,
      scale: 0.72,
      duration: 0.45,
      stagger: 0.02,
      ease: "power2.in",
    },
    0,
  );
  tl.set(otherEls, { pointerEvents: "none" }, 0.45);

  tl.to(
    playgroundEl,
    {
      backgroundColor: "rgba(10, 10, 12, 0.92)",
      duration: 0.5,
      ease: "power1.inOut",
    },
    0.05,
  );

  if (ownerEl && partnerEl && ownerLayout && partnerLayout) {
    tl.to(
      [ownerEl, partnerEl],
      {
        zIndex: 200,
        duration: 0.01,
      },
      0.2,
    );

    tl.to(
      ownerEl,
      {
        x: ownerLayout.x,
        y: ownerLayout.y,
        rotation: ownerLayout.rotation,
        scale: ownerLayout.scale,
        duration: 0.85,
        ease: "power3.inOut",
      },
      0.15,
    );

    tl.to(
      partnerEl,
      {
        x: partnerLayout.x,
        y: partnerLayout.y,
        rotation: partnerLayout.rotation,
        scale: partnerLayout.scale,
        duration: 0.85,
        ease: "power3.inOut",
      },
      0.15,
    );

    tl.set([ownerEl, partnerEl], { pointerEvents: "auto" }, 0.85);

    tl.call(
      () => {
        onRevealScreens();
      },
      [],
      0.72,
    );

    tl.call(
      () => {
        const origin = {
          x: playgroundSize.width / 2,
          y: playgroundSize.height / 2 - 20,
        };
        cleanupConfetti = launchConfetti(confettiLayer, origin);
      },
      [],
      0.78,
    );
  }

  return tl;
}
