"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MOCK_CHAT_MESSAGES, MOCK_ME, MOCK_PROFILE } from "./mockData";

const REMAINING_MESSAGES = 2;
const REACTION_EMOJIS = ["👋", "😊", "🎉", "✨", "🙌", "❤️"];

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
      <path d="M19 10v1a7 7 0 01-14 0v-1" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function VoiceWaveform({ bars = 10 }: { bars?: number }) {
  const heights = [3, 5, 8, 4, 7, 3, 6, 9, 5, 4, 7, 3];
  return (
    <div className="roadmates-waveform flex h-3.5 items-end gap-px">
      {heights.slice(0, bars).map((h, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-current opacity-60"
          style={{ height: `${h + 3}px` }}
        />
      ))}
    </div>
  );
}

function MessageRow({
  msg,
  themAvatar,
  meAvatar,
  showReactionPicker,
  onOpenReactionPicker,
  onPickReaction,
}: {
  msg: (typeof MOCK_CHAT_MESSAGES)[number];
  themAvatar: string;
  meAvatar: string;
  showReactionPicker: boolean;
  onOpenReactionPicker: () => void;
  onPickReaction: (emoji: string) => void;
}) {
  const isMe = msg.sender === "me";
  const avatar = isMe ? meAvatar : themAvatar;
  const canReact = !isMe;

  return (
    <div className={`relative flex items-start gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} ${showReactionPicker ? "z-20" : ""}`}>
      <img
        src={avatar}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full bg-zinc-800 object-cover ring-1 ring-white/10"
      />

      <div className={`flex max-w-[82%] flex-col gap-1.5 ${isMe ? "items-end" : "items-start"}`}>
        <div className="relative">
          <div
            className={`flex items-center gap-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`roadmates-voice-bubble shrink-0 select-none rounded-2xl px-2.5 py-1.5 ${
                isMe
                  ? "roadmates-voice-bubble--me rounded-br-sm"
                  : "roadmates-voice-bubble--them rounded-bl-sm"
              }`}
            onContextMenu={
              canReact
                ? (e) => {
                    e.preventDefault();
                    onOpenReactionPicker();
                  }
                : undefined
            }
            >
              <div className="flex items-center gap-1.5">
                <VoiceWaveform bars={8} />
                <span className="shrink-0 text-[10px] opacity-70">{msg.voiceDuration}</span>
              </div>
            </div>

            {canReact && msg.reactions && msg.reactions.length > 0 ? (
              <div className="flex shrink-0 items-center gap-0.5">
                {msg.reactions.map((emoji, i) => (
                  <span
                    key={`${emoji}-${i}`}
                    className="roadmates-reaction-chip rounded-full px-1 py-0.5 text-[11px] leading-none"
                  >
                    {emoji}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {canReact && showReactionPicker ? (
            <div
              className={`roadmates-reaction-picker absolute z-20 flex gap-0.5 rounded-full px-1.5 py-1 ${
                isMe ? "right-0" : "left-0"
              }`}
              style={{ top: "calc(100% + 4px)" }}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-base transition hover:bg-white/10"
                  onClick={() => onPickReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {msg.sender === "them" ? (
          <p className="roadmates-transcript max-w-full px-0.5 text-[10px] leading-relaxed text-zinc-400">
            {msg.transcript}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const QUOTA_TOAST_DURATION_MS = 4000;

export function RoadmateChatScreen() {
  const [messages, setMessages] = useState(MOCK_CHAT_MESSAGES);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [showQuotaToast, setShowQuotaToast] = useState(false);
  const [quotaToastKey, setQuotaToastKey] = useState(0);
  const quotaToastTimerRef = useRef<number | null>(null);

  const revealQuotaToast = useCallback(() => {
    setShowQuotaToast(true);
    setQuotaToastKey((key) => key + 1);

    if (quotaToastTimerRef.current != null) {
      window.clearTimeout(quotaToastTimerRef.current);
    }

    quotaToastTimerRef.current = window.setTimeout(() => {
      setShowQuotaToast(false);
      quotaToastTimerRef.current = null;
    }, QUOTA_TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    revealQuotaToast();

    return () => {
      if (quotaToastTimerRef.current != null) {
        window.clearTimeout(quotaToastTimerRef.current);
      }
    };
  }, [revealQuotaToast]);

  const handleRecordPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    revealQuotaToast();
  };

  const handlePickReaction = (msgId: string, emoji: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, reactions: m.reactions?.includes(emoji) ? m.reactions : [...(m.reactions ?? []), emoji] }
          : m,
      ),
    );
    setActiveReactionMsgId(null);
  };

  return (
    <div className="roadmates-screen relative flex h-full min-h-0 flex-col">
      <header className="roadmates-chat-header shrink-0 px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-2">
          <button type="button" className="shrink-0 p-1 text-zinc-400" aria-label="返回">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <img
            src={MOCK_PROFILE.avatar}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full bg-zinc-800 object-cover ring-1 ring-white/10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-zinc-100">{MOCK_PROFILE.name}</p>
            <p className="truncate text-[10px] text-zinc-500">
              {MOCK_PROFILE.commonTags.slice(0, 3).join(" · ")}
            </p>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {activeReactionMsgId ? (
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-default"
            aria-label="关闭表情回应"
            onClick={() => setActiveReactionMsgId(null)}
          />
        ) : null}
        <div className="relative space-y-4">
          {messages.map((msg) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              themAvatar={MOCK_PROFILE.avatar}
              meAvatar={MOCK_ME.avatar}
              showReactionPicker={activeReactionMsgId === msg.id}
              onOpenReactionPicker={() => {
                if (msg.sender === "them") setActiveReactionMsgId(msg.id);
              }}
              onPickReaction={(emoji) => handlePickReaction(msg.id, emoji)}
            />
          ))}
        </div>
      </div>

      {showQuotaToast ? (
        <div
          className="roadmates-toast pointer-events-none absolute inset-x-0 bottom-[3.75rem] z-30 flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <p key={quotaToastKey} className="roadmates-toast-pill text-[10px] text-zinc-300">
            今日还可发送{" "}
            <span className="font-mono tabular-nums text-cyan-300/90">{REMAINING_MESSAGES}</span> 条消息
          </p>
        </div>
      ) : null}

      <div className="roadmates-chat-input shrink-0 border-t border-white/5 px-3 py-2">
        <button
          type="button"
          className="roadmates-record-btn flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3.5"
          aria-label="按住说话"
          onPointerDown={handleRecordPointerDown}
        >
          <MicIcon className="h-3.5 w-3.5 shrink-0 text-cyan-400/75" />
          <span className="text-[11px] font-medium tracking-wide text-zinc-200">按住说话</span>
        </button>
      </div>
    </div>
  );
}
