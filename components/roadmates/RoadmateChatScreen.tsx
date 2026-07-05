"use client";

import { useState } from "react";
import { MOCK_CHAT_MESSAGES, MOCK_ME, MOCK_PROFILE } from "./mockData";

const REMAINING_MESSAGES = 2;
const REACTION_EMOJIS = ["👋", "😊", "🎉", "✨", "🙌", "❤️"];

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

export function RoadmateChatScreen() {
  const [messages, setMessages] = useState(MOCK_CHAT_MESSAGES);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

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

      <div className="roadmates-chat-input shrink-0 border-t border-white/5 px-3 pb-2 pt-2.5">
        <button
          type="button"
          className="roadmates-record-btn flex w-full flex-col items-center justify-center gap-0.5 rounded-full py-2.5"
        >
          <span className="flex items-center gap-2 text-[12px] font-medium text-zinc-100">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            按住说话
          </span>
          <span className="text-[9px] text-amber-200/80">
            今日还可发送 {REMAINING_MESSAGES} 条消息
          </span>
        </button>
      </div>
    </div>
  );
}
