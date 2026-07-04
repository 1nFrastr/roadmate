"use client";

interface MatchConfirmButtonProps {
  visible: boolean;
  progress: number;
  x: number;
  y: number;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

export function MatchConfirmButton({
  visible,
  progress,
  x,
  y,
  onHoldStart,
  onHoldEnd,
}: MatchConfirmButtonProps) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div
      className={`match-confirm-anchor pointer-events-none absolute left-0 top-0 z-[220] transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
      }}
      aria-hidden={!visible}
    >
      <button
        type="button"
        className={`match-confirm-button relative flex h-[88px] w-[88px] touch-none select-none flex-col items-center justify-center rounded-full border border-emerald-400/35 bg-zinc-950/85 text-zinc-100 shadow-[0_8px_32px_rgba(16,185,129,0.18)] backdrop-blur-md transition-transform active:scale-[0.97] ${
          visible ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-disabled={!visible}
        tabIndex={visible ? 0 : -1}
        onPointerDown={(event) => {
          if (!visible) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          onHoldStart();
        }}
        onPointerUp={(event) => {
          if (!visible) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          onHoldEnd();
        }}
        onPointerCancel={onHoldEnd}
        onLostPointerCapture={onHoldEnd}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 88 88"
          aria-hidden
        >
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="rgba(52, 211, 153, 0.18)"
            strokeWidth="3"
          />
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="rgba(52, 211, 153, 0.95)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="relative text-[11px] font-semibold tracking-wide text-emerald-300">
          确认匹配
        </span>
        <span className="relative mt-0.5 font-mono text-[9px] text-zinc-500">
          长按 1 秒
        </span>
      </button>
    </div>
  );
}
