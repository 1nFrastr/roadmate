"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { generatePlaceholderTags } from "./placeholderTags";
import { TagWordCloud } from "./TagWordCloud";

export function TagWordCloudDemo() {
  const [count, setCount] = useState(16);
  const [seed, setSeed] = useState(0);
  const tags = useMemo(() => generatePlaceholderTags(count), [count, seed]);

  return (
    <div className="tag-word-cloud-demo mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-400/80">Component Playground</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-100">TagWordCloud</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            独立词云组件测试页，使用随机 placeholder 标签，无需调用 API。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            兴趣推断 →
          </Link>
          <Link
            href="/playground"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            ← 设备 Demo
          </Link>
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="text-xs text-zinc-500">
          标签数量
          <input
            type="range"
            min={6}
            max={30}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="mt-2 block w-48"
          />
          <span className="mt-1 block font-mono text-zinc-300">{count}</span>
        </label>
        <button
          type="button"
          onClick={() => setSeed((value) => value + 1)}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-violet-400"
        >
          重新随机
        </button>
        <p className="text-xs text-zinc-500">拖拽标签 · 重力下落 · 圆形大小随权重变化</p>
      </section>

      <TagWordCloud key={seed} tags={tags} />
    </div>
  );
}
