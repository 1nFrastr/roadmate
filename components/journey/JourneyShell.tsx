"use client";

import type { ReactNode } from "react";

interface JourneyShellProps {
  children: ReactNode;
  className?: string;
}

export function JourneyShell({ children, className = "" }: JourneyShellProps) {
  return (
    <div
      className={`journey-canvas flex h-dvh w-full flex-col overflow-hidden text-zinc-100 ${className}`}
    >
      {children}
    </div>
  );
}
