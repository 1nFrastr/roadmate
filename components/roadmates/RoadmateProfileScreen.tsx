"use client";

import { MOCK_PROFILE } from "./mockData";

function PlatformBadge({ platform }: { platform: "xiaohongshu" | "twitter" }) {
  if (platform === "xiaohongshu") {
    return (
      <span className="roadmates-platform-badge roadmates-platform-badge--xhs shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium">
        小红书
      </span>
    );
  }

  return (
    <span className="roadmates-platform-badge roadmates-platform-badge--x shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium">
      X
    </span>
  );
}

function SocialIcon({ platform }: { platform: "xiaohongshu" | "twitter" }) {
  if (platform === "xiaohongshu") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 text-[11px] font-bold text-red-300">
        红
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-700/50 text-[11px] font-bold text-zinc-200">
      𝕏
    </span>
  );
}

export function RoadmateProfileScreen() {
  return (
    <div className="roadmates-screen flex h-full min-h-0 flex-col">
      <header className="roadmates-header shrink-0 px-4 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <button type="button" className="shrink-0 p-1 text-zinc-400" aria-label="返回">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-[15px] font-semibold text-zinc-50">路友主页</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
        <section className="flex flex-col items-center pb-4 pt-1 text-center">
          <img
            src={MOCK_PROFILE.avatar}
            alt=""
            className="h-16 w-16 rounded-full bg-zinc-800 object-cover ring-2 ring-cyan-500/40 ring-offset-2 ring-offset-[#0a0a0c]"
          />
          <h2 className="mt-3 text-[15px] font-semibold text-zinc-50">{MOCK_PROFILE.name}</h2>
          <p className="mt-1 text-[10px] text-zinc-500">{MOCK_PROFILE.matchContext}</p>
          <div className="roadmates-match-score mt-2 rounded-full px-3 py-1 text-[11px] font-medium text-cyan-200">
            匹配 {MOCK_PROFILE.matchScore}%
          </div>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            共同标签
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {MOCK_PROFILE.commonTags.slice(0, 3).map((tag) => (
              <span key={tag} className="roadmates-tag-chip rounded-full px-2.5 py-1 text-[11px] text-zinc-200">
                {tag}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            社媒入口
          </h3>
          <div className="space-y-2">
            {MOCK_PROFILE.socialLinks.map((link) => (
              <button
                key={link.platform}
                type="button"
                className="roadmates-social-link flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
              >
                <SocialIcon platform={link.platform} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-zinc-100">{link.label}</p>
                  <p className="truncate text-[10px] text-zinc-500">{link.handle}</p>
                </div>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden>
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 18l6-6-6-6"
                  />
                </svg>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            最近动态
          </h3>
          <ul className="space-y-2">
            {MOCK_PROFILE.posts.map((post) => (
              <li key={post.id} className="roadmates-post-card rounded-xl p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <PlatformBadge platform={post.platform} />
                  <span className="shrink-0 text-[9px] text-zinc-600">{post.time}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-300">{post.content}</p>
                {post.likes != null ? (
                  <p className="mt-1.5 text-[9px] text-zinc-600">{post.likes} 赞</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
