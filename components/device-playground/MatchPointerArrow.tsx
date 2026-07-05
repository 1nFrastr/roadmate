"use client";

import { forwardRef } from "react";

export const MatchPointerArrow = forwardRef<HTMLDivElement>(
  function MatchPointerArrow(_props, ref) {
    return (
      <div
        ref={ref}
        className="device-match-pointer pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 will-change-transform"
        aria-hidden
      >
        <svg
          viewBox="0 0 48 48"
          className="device-ink-pointer h-[70%] w-[70%]"
          aria-hidden
        >
          <path d="M24 4 L42 40 L24 31 L6 40 Z" fill="currentColor" />
        </svg>
      </div>
    );
  },
);
