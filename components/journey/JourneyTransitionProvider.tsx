"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { OWNER_DEVICE_INDEX } from "@/components/device-playground/constants";
import { runInterestsToPlaygroundTransition } from "./runInterestsToPlaygroundTransition";
import { saveJourneyLanding } from "./storage";
import type { JourneyPhase, JourneyTransitionSources, TagSnapshot } from "./types";

interface StartTransitionInput {
  leftPanel: HTMLElement;
  iphoneFrame: HTMLElement;
  tagSnapshots: TagSnapshot[];
  tagNames: string[];
}

interface JourneyTransitionContextValue {
  phase: JourneyPhase;
  isTransitioning: boolean;
  startTransition: (input: StartTransitionInput) => void;
  notifyPlaygroundReady: () => void;
  triggerDevicesEnter: (animate: () => gsap.core.Timeline | void) => void;
}

const JourneyTransitionContext = createContext<JourneyTransitionContextValue | null>(null);

export function useJourneyTransition() {
  const ctx = useContext(JourneyTransitionContext);
  if (!ctx) {
    throw new Error("useJourneyTransition must be used within JourneyTransitionProvider");
  }
  return ctx;
}

export function useJourneyTransitionOptional() {
  return useContext(JourneyTransitionContext);
}

interface JourneyTransitionProviderProps {
  children: ReactNode;
}

export function JourneyTransitionProvider({ children }: JourneyTransitionProviderProps) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const handoffResolverRef = useRef<(() => void) | null>(null);
  const devicesEnterRef = useRef<(() => gsap.core.Timeline | void) | null>(null);

  const [phase, setPhase] = useState<JourneyPhase>("idle");
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const notifyPlaygroundReady = useCallback(() => {
    handoffResolverRef.current?.();
    handoffResolverRef.current = null;
  }, []);

  const triggerDevicesEnter = useCallback((animate: () => gsap.core.Timeline | void) => {
    devicesEnterRef.current = animate;
  }, []);

  const waitForHandoff = useCallback(() => {
    return new Promise<void>((resolve) => {
      handoffResolverRef.current = resolve;
      window.setTimeout(resolve, 1200);
    });
  }, []);

  const startTransition = useCallback(
    (input: StartTransitionInput) => {
      if (phase !== "idle" || !overlayRef.current) return;

      const overlayEl = overlayRef.current;
      overlayEl.style.pointerEvents = "auto";

      const frameRect = input.iphoneFrame.getBoundingClientRect();
      const injectPoint = {
        x: frameRect.left + frameRect.width / 2,
        y: frameRect.top + frameRect.height * 0.62,
      };

      const sources: JourneyTransitionSources = {
        leftPanel: input.leftPanel,
        iphoneFrame: input.iphoneFrame,
        tagSnapshots: input.tagSnapshots,
        injectPoint,
      };

      setPhase("preparing");

      if (reducedMotion) {
        const landing = {
          x: window.innerWidth * 0.5 - 44,
          y: window.innerHeight * 0.55 - 74,
          width: 88,
          height: 148,
        };
        saveJourneyLanding({
          landingRect: landing,
          ownerDeviceId: `device-${OWNER_DEVICE_INDEX}`,
          tagNames: input.tagNames,
          startedAt: Date.now(),
        });
        router.push("/playground");
        setPhase("complete");
        window.setTimeout(() => setPhase("idle"), 100);
        return;
      }

      timelineRef.current?.kill();

      timelineRef.current = runInterestsToPlaygroundTransition(
        overlayEl,
        sources,
        {
          onNavigate: (landingRect) => {
            setPhase("navigating");
            saveJourneyLanding({
              landingRect,
              ownerDeviceId: `device-${OWNER_DEVICE_INDEX}`,
              tagNames: input.tagNames,
              startedAt: Date.now(),
            });
            router.push("/playground");
          },
          onHandoffReady: async () => {
            setPhase("handoff");
            await waitForHandoff();
          },
          onDevicesEnter: () => {
            setPhase("devices-enter");
            devicesEnterRef.current?.();
          },
          onComplete: () => {
            overlayEl.style.pointerEvents = "none";
            setPhase("complete");
            window.setTimeout(() => setPhase("idle"), 50);
          },
        },
        reducedMotion,
      );
    },
    [phase, reducedMotion, router, waitForHandoff],
  );

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  return (
    <JourneyTransitionContext.Provider
      value={{
        phase,
        isTransitioning: phase !== "idle",
        startTransition,
        notifyPlaygroundReady,
        triggerDevicesEnter,
      }}
    >
      {children}
      <div
        ref={overlayRef}
        className="journey-transition-overlay pointer-events-none fixed inset-0 z-[200]"
        aria-hidden={phase === "idle"}
      />
    </JourneyTransitionContext.Provider>
  );
}
