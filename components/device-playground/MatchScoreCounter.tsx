"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";

gsap.registerPlugin(useGSAP);

interface MatchScoreCounterProps {
  value: number;
  compact?: boolean;
  ink?: boolean;
}

export function MatchScoreCounter({ value, compact = false, ink = false }: MatchScoreCounterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const [reducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useGSAP(
    () => {
      const valueEl = valueRef.current;
      const rootEl = rootRef.current;
      if (!valueEl || !rootEl) return;

      if (reducedMotion) {
        valueEl.textContent = `${value}%`;
        return;
      }

      const counter = { current: 0 };
      const spinSpan = Math.max(value + 80, 120);
      const settleStart = spinSpan - 14;
      const tl = gsap.timeline();

      tl.fromTo(
        rootEl,
        { scale: 0.88, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.35, ease: "power2.out" },
      );

      tl.fromTo(
        counter,
        { current: 0 },
        {
          current: spinSpan,
          duration: 1.45,
          ease: "power4.out",
          onUpdate() {
            const raw = counter.current;
            if (raw < settleStart) {
              valueEl.textContent = `${Math.floor(raw % 100)}%`;
              return;
            }

            const blend = (raw - settleStart) / (spinSpan - settleStart);
            const from = Math.floor(settleStart % 100);
            const display = Math.round(from + (value - from) * blend);
            valueEl.textContent = `${Math.max(0, Math.min(100, display))}%`;
          },
          onComplete() {
            valueEl.textContent = `${value}%`;
          },
        },
        0.05,
      );

      tl.to(
        rootEl,
        { scale: 1.06, duration: 0.12, ease: "power2.out" },
        "-=0.08",
      );
      tl.to(rootEl, { scale: 1, duration: 0.28, ease: "power2.inOut" });
    },
    { scope: rootRef, dependencies: [value, reducedMotion], revertOnUpdate: true },
  );

  return (
    <div ref={rootRef} className="shrink-0 text-center">
      <span
        ref={valueRef}
        className={`font-mono font-bold leading-none tracking-tight tabular-nums ${
          compact ? "text-[11px]" : "text-[15px]"
        } ${ink ? "device-ink-text-bright" : "text-emerald-300"}`}
      >
        {value}%
      </span>
    </div>
  );
}
