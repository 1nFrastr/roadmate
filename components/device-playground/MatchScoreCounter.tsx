"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";

gsap.registerPlugin(useGSAP);

interface MatchScoreCounterProps {
  value: number;
  compact?: boolean;
}

export function MatchScoreCounter({ value, compact = false }: MatchScoreCounterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const [reducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useGSAP(
    () => {
      const valueEl = valueRef.current;
      if (!valueEl) return;

      if (reducedMotion) {
        valueEl.textContent = `${value}%`;
        return;
      }

      const counter = { current: 0 };
      const spinSpan = Math.max(value + 80, 120);
      const settleStart = spinSpan - 10;

      gsap.fromTo(
        counter,
        { current: 0 },
        {
          current: spinSpan,
          duration: 1.15,
          ease: "steps(18)",
          onUpdate() {
            const raw = counter.current;
            if (raw < settleStart) {
              valueEl.textContent = `${Math.floor(raw % 100)}%`;
              return;
            }

            const step = Math.floor((raw - settleStart) / 2);
            const from = Math.floor(settleStart % 100);
            const display = Math.min(value, from + step);
            valueEl.textContent = `${display}%`;
          },
          onComplete() {
            valueEl.textContent = `${value}%`;
          },
        },
      );
    },
    { scope: rootRef, dependencies: [value, reducedMotion], revertOnUpdate: true },
  );

  return (
    <div ref={rootRef} className="device-epaper-score shrink-0 text-center">
      <span
        ref={valueRef}
        className={`device-screen-text-bright font-bold leading-none tracking-tight tabular-nums ${
          compact ? "text-[16px]" : "text-[20px]"
        }`}
      >
        {value}%
      </span>
    </div>
  );
}
