"use client";

import { useEffect, useRef, useState } from "react";

interface TagWordCloudAddOrbProps {
  disabled?: boolean;
  onSubmit: (name: string) => void;
  /** 嵌入 iPhone 屏幕顶部栏 */
  inScreen?: boolean;
}

export function TagWordCloudAddOrb({
  disabled = false,
  onSubmit,
  inScreen = false,
}: TagWordCloudAddOrbProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
      setValue("");
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const submit = () => {
    const name = value.trim();
    if (!name) return;
    onSubmit(name);
    setValue("");
    setOpen(false);
  };

  return (
    <div
      ref={popoverRef}
      className={`tag-add-orb pointer-events-auto z-[60] ${
        inScreen
          ? open
            ? "tag-add-orb--in-screen flex h-[58px] items-center gap-2 border-b border-white/8 px-2.5"
            : "flex justify-end p-2.5"
          : "absolute bottom-3 right-3"
      }`}
    >
      {open ? (
        <div
          className={`tag-add-orb-popover flex min-w-0 items-center gap-2 ${
            inScreen ? "mr-1 flex-1" : "mb-2"
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            maxLength={24}
            placeholder="标签名"
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                setValue("");
              }
            }}
            className="tag-add-orb-input min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            type="button"
            disabled={disabled || !value.trim()}
            onClick={submit}
            className="tag-add-orb-confirm shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-cyan-200 transition enabled:hover:text-white disabled:opacity-40"
          >
            添加
          </button>
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-label="添加自定义标签"
        title="添加自定义标签"
        onClick={() => setOpen((current) => !current)}
        className={`tag-add-orb-button flex shrink-0 items-center justify-center rounded-full transition enabled:hover:scale-105 disabled:opacity-40 ${
          inScreen ? "h-9 w-9" : "h-11 w-11"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`transition ${inScreen ? "h-4 w-4" : "h-5 w-5"} ${open ? "rotate-45 text-cyan-200" : "text-zinc-300"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
