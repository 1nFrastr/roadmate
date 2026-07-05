"use client";

import { useCallback } from "react";
import {
  createPostRecord,
  isoToRelative,
  RELATIVE_TIME_UNIT_LABELS,
  relativeToIso,
  type RelativeTimeUnit,
} from "./postUtils";
import type { PostRecord } from "./types";

interface PostListEditorProps {
  posts: PostRecord[];
  onChange: (posts: PostRecord[]) => void;
  disabled?: boolean;
}

const RELATIVE_UNITS: RelativeTimeUnit[] = ["hours", "days", "weeks", "months"];

const QUICK_PRESETS: { label: string; amount: number; unit: RelativeTimeUnit }[] = [
  { label: "刚刚", amount: 0, unit: "hours" },
  { label: "6小时", amount: 6, unit: "hours" },
  { label: "3天", amount: 3, unit: "days" },
  { label: "2周", amount: 2, unit: "weeks" },
  { label: "3月", amount: 3, unit: "months" },
];

function RelativeTimeControl({
  createdAt,
  disabled,
  onChange,
}: {
  createdAt: string;
  disabled?: boolean;
  onChange: (createdAt: string) => void;
}) {
  const { amount, unit } = isoToRelative(createdAt);

  const apply = (nextAmount: number, nextUnit: RelativeTimeUnit) => {
    onChange(relativeToIso(nextAmount, nextUnit));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-zinc-500">距今</span>
      <input
        type="number"
        min={0}
        max={999}
        disabled={disabled}
        value={amount}
        onChange={(event) => {
          const next = Math.max(0, Number.parseInt(event.target.value, 10) || 0);
          apply(next, unit);
        }}
        className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-center text-[10px] text-zinc-300 outline-none focus:border-cyan-500/60 disabled:opacity-50"
      />
      <select
        disabled={disabled}
        value={unit}
        onChange={(event) => apply(amount, event.target.value as RelativeTimeUnit)}
        className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-[10px] text-zinc-300 outline-none focus:border-cyan-500/60 disabled:opacity-50"
      >
        {RELATIVE_UNITS.map((item) => (
          <option key={item} value={item}>
            {RELATIVE_TIME_UNIT_LABELS[item]}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-0.5">
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => apply(preset.amount, preset.unit)}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PostListEditor({ posts, onChange, disabled }: PostListEditorProps) {
  const updatePost = useCallback(
    (id: string, patch: Partial<Pick<PostRecord, "text" | "createdAt">>) => {
      onChange(
        posts.map((post) => (post.id === id ? { ...post, ...patch, extractedAt: undefined, tags: undefined } : post)),
      );
    },
    [onChange, posts],
  );

  const removePost = useCallback(
    (id: string) => {
      onChange(posts.filter((post) => post.id !== id));
    },
    [onChange, posts],
  );

  const addPost = useCallback(() => {
    onChange([createPostRecord(""), ...posts]);
  }, [onChange, posts]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          每条帖子单独推断（最多 3 标签/帖），时间用「距今」方便测试 recency 加权
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={addPost}
          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-cyan-400 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
        >
          + 添加帖子
        </button>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-4 text-center text-sm text-zinc-500">
          点击「添加帖子」开始测试
        </p>
      ) : (
        <ul className="max-h-[360px] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {posts.map((post, index) => (
            <li
              key={post.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500">帖子 {posts.length - index}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {post.extractedAt ? (
                    <span className="text-[10px] text-emerald-400/80">
                      已分析 · {post.tags?.length ?? 0} 标签
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removePost(post.id)}
                    className="text-[10px] text-zinc-500 hover:text-red-300 disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              </div>
              <RelativeTimeControl
                createdAt={post.createdAt}
                disabled={disabled}
                onChange={(createdAt) => updatePost(post.id, { createdAt })}
              />
              <textarea
                value={post.text}
                disabled={disabled}
                onChange={(event) => updatePost(post.id, { text: event.target.value })}
                rows={2}
                placeholder="输入单条发帖内容…"
                className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-cyan-500/60 disabled:opacity-50"
              />
              {post.tags && post.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {post.tags.map((tag) => (
                    <span
                      key={`${post.id}-${tag.name}`}
                      className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                    >
                      {tag.name}
                      <span className="ml-1 font-mono text-zinc-500">{tag.sentiment.toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
