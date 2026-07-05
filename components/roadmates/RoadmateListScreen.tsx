"use client";

import { NEW_ROADMATE_AVATARS, NEW_ROADMATE_HINT, MOCK_SESSIONS } from "./mockData";

function StackedAvatars({ avatars }: { avatars: readonly string[] }) {
  return (
    <div className="flex shrink-0 items-center pl-0.5">
      {avatars.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className="relative h-7 w-7 rounded-full bg-zinc-800 object-cover ring-2 ring-[#0a1214]"
          style={{
            zIndex: avatars.length - i,
            marginLeft: i === 0 ? 0 : -10,
          }}
        />
      ))}
    </div>
  );
}

function SessionAvatars({ avatars }: { avatars: string[] }) {
  const faces = avatars.slice(0, 4);
  const imgClass = "h-full w-full object-cover bg-zinc-800";
  const shellClass =
    "shrink-0 overflow-hidden rounded-full bg-zinc-950 ring-1 ring-white/10 gap-px";

  if (faces.length === 1) {
    return (
      <img
        src={faces[0]}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full bg-zinc-800 object-cover ring-1 ring-white/10"
      />
    );
  }

  if (faces.length === 2) {
    return (
      <div className={`grid h-11 w-11 grid-cols-2 ${shellClass}`}>
        {faces.map((src, i) => (
          <img key={i} src={src} alt="" className={imgClass} />
        ))}
      </div>
    );
  }

  if (faces.length === 3) {
    return (
      <div className={`grid h-11 w-11 grid-cols-2 grid-rows-2 ${shellClass}`}>
        <img src={faces[0]} alt="" className={`${imgClass} row-span-2`} />
        <img src={faces[1]} alt="" className={imgClass} />
        <img src={faces[2]} alt="" className={imgClass} />
      </div>
    );
  }

  return (
    <div className={`grid h-11 w-11 grid-cols-2 grid-rows-2 ${shellClass}`}>
      {faces.map((src, i) => (
        <img key={i} src={src} alt="" className={imgClass} />
      ))}
    </div>
  );
}

export function RoadmateListScreen() {
  return (
    <div className="roadmates-screen flex h-full min-h-0 flex-col">
      <header className="roadmates-header shrink-0 px-4 pb-3 pt-1">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-50">路友</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">轻链接 · 鼓励线下见</p>
      </header>

      <div className="roadmates-new-banner mx-3 mb-3 flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5">
        <StackedAvatars avatars={NEW_ROADMATE_AVATARS} />
        <p className="text-[12px] font-medium text-cyan-100">{NEW_ROADMATE_HINT}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
        <ul className="space-y-0.5">
          {MOCK_SESSIONS.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className="roadmates-session-row flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left"
              >
                <SessionAvatars avatars={session.avatars} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-zinc-100">
                      {session.name}
                      {session.isGroup && session.memberCount ? (
                        <span className="ml-1 text-[11px] font-normal text-zinc-500">
                          · {session.memberCount} 人
                        </span>
                      ) : null}
                    </span>
                    {!session.unread ? (
                      <span className="shrink-0 text-[10px] text-zinc-500">{session.time}</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">{session.lastPreview}</p>
                </div>
                {session.unread ? (
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-semibold text-zinc-950">
                    {session.unread}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
