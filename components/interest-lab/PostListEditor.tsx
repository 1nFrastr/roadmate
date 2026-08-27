"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadPostsTxt, parsePostsFromTxt } from "./postImportExport";
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
  /** Bulk import: replace the list and clear caches (separate from onChange so the parent can reset the profile) */
  onImport?: (posts: PostRecord[], filename: string) => void;
  disabled?: boolean;
}

const RELATIVE_UNITS: RelativeTimeUnit[] = ["hours", "days", "weeks", "months"];

const QUICK_PRESETS: { label: string; amount: number; unit: RelativeTimeUnit }[] = [
  { label: "Just now", amount: 0, unit: "hours" },
  { label: "6h", amount: 6, unit: "hours" },
  { label: "3d", amount: 3, unit: "days" },
  { label: "2w", amount: 2, unit: "weeks" },
  { label: "3mo", amount: 3, unit: "months" },
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
      <span className="text-[10px] text-zinc-500">Ago</span>
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

export function PostListEditor({ posts, onChange, onImport, disabled }: PostListEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingScrollToBottomRef = useRef(false);
  const [ioMessage, setIoMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [importFilename, setImportFilename] = useState<string | null>(null);

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
      const next = posts.filter((post) => post.id !== id);
      onChange(next);
      if (next.length === 0) {
        setImportFilename(null);
      }
    },
    [onChange, posts],
  );

  const addPost = useCallback(() => {
    setImportFilename(null);
    pendingScrollToBottomRef.current = true;
    onChange([...posts, createPostRecord("")]);
  }, [onChange, posts]);

  useEffect(() => {
    if (!pendingScrollToBottomRef.current || !listRef.current) return;
    pendingScrollToBottomRef.current = false;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [posts]);

  const handleExport = useCallback(() => {
    const exportable = posts.filter((post) => post.text.trim());
    if (exportable.length === 0) {
      setIoMessage({ kind: "err", text: "No posts to export (body cannot be empty)" });
      return;
    }
    downloadPostsTxt(exportable);
    setIoMessage({ kind: "ok", text: `Exported ${exportable.length} posts` });
  }, [posts]);

  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
        const content = await file.text();
        const { posts: imported, errors, warnings } = parsePostsFromTxt(content);

        if (errors.length > 0) {
          setIoMessage({ kind: "err", text: errors.join("; ") });
          return;
        }

        if (onImport) {
          onImport(imported, file.name);
        } else {
          onChange(imported);
        }
        setImportFilename(file.name);
        const warningText = warnings.length > 0 ? ` (${warnings[0]})` : "";
        setIoMessage({ kind: "ok", text: `Imported ${imported.length} posts${warningText}` });
      } catch {
        setIoMessage({ kind: "err", text: "Failed to read file" });
      }
    },
    [onChange, onImport],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          Three-stage timeline inference (preprocess → merge → tags); use “Ago” times to test recency weighting
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
          >
            Import
          </button>
          <button
            type="button"
            disabled={disabled || posts.every((post) => !post.text.trim())}
            onClick={handleExport}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
          >
            Export
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={addPost}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-cyan-400 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
          >
            + Add post
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      {importFilename ? (
        <p className="text-xs text-zinc-400">
          Imported file:{" "}
          <span className="font-mono text-zinc-300">{importFilename}</span>
          {posts.length > 0 ? ` · ${posts.length} posts` : null}
        </p>
      ) : null}

      {ioMessage ? (
        <p
          className={`text-xs ${ioMessage.kind === "ok" ? "text-emerald-400/90" : "text-red-400/90"}`}
          role="status"
        >
          {ioMessage.text}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-4 text-center text-sm text-zinc-500">
          Click “Add post” to start testing
        </p>
      ) : (
        <ul
          ref={listRef}
          className="max-h-[360px] space-y-2 overflow-y-auto overscroll-contain pr-1"
        >
          {posts.map((post, index) => (
            <li
              key={post.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500">Post {index + 1}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {post.extractedAt ? (
                    <span className="text-[10px] text-emerald-400/80">Included in inference</span>
                  ) : null}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removePost(post.id)}
                    className="text-[10px] text-zinc-500 hover:text-red-300 disabled:opacity-50"
                  >
                    Delete
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
                placeholder="Enter a single post…"
                className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-cyan-500/60 disabled:opacity-50"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
