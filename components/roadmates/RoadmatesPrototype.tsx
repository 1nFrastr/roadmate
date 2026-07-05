"use client";

import { IphoneAppFrame } from "@/components/journey";
import { RoadmateChatScreen } from "./RoadmateChatScreen";
import { RoadmateListScreen } from "./RoadmateListScreen";
import { RoadmateProfileScreen } from "./RoadmateProfileScreen";

const SCREENS = [
  { label: "路友列表", Screen: RoadmateListScreen },
  { label: "对话", Screen: RoadmateChatScreen },
  { label: "路友主页", Screen: RoadmateProfileScreen },
] as const;

export function RoadmatesPrototype() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="shrink-0 border-b border-white/5 px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">Roadmate · 轻链接</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">路友原型</h1>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-zinc-500">
            轻量无感 · 鼓励线下见真人 · 仅语音与表情 · 群组优先
          </p>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-8">
        <div className="flex flex-wrap items-start justify-center gap-6 lg:gap-8">
          {SCREENS.map(({ label, Screen }) => (
            <IphoneAppFrame key={label} label={label} size="compact">
              <Screen />
            </IphoneAppFrame>
          ))}
        </div>
      </main>
    </div>
  );
}
