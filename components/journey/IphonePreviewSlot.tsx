"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface IphonePreviewSlotProps {
  children: ReactNode;
  className?: string;
}

/** 预览槽：空间不足时等比缩小 iPhone，避免上下被裁切 */
export function IphonePreviewSlot({ children, className = "" }: IphonePreviewSlotProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const slot = slotRef.current;
    const content = contentRef.current;
    if (!slot || !content) return;

    const updateScale = () => {
      const available = slot.clientHeight;
      const needed = content.offsetHeight;
      const width = content.offsetWidth;
      if (available <= 0 || needed <= 0) return;

      const nextScale = needed <= available ? 1 : Math.max(0.55, available / needed);
      setScale(nextScale);
      setContentSize({ width, height: needed });
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(slot);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={slotRef}
      className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden ${className}`}
    >
      <div
        style={{
          width: contentSize.width * scale,
          height: contentSize.height * scale,
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
