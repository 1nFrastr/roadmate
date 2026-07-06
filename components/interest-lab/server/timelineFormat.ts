import { isoToRelative } from "../postUtils";
import type { PreprocessedPost, TimelineEntry } from "../types";

const UNIT_SHORT: Record<string, string> = {
  hours: "h",
  days: "d",
  weeks: "w",
  months: "m",
};

function formatRelativeTime(iso: string): string {
  const rel = isoToRelative(iso);
  const unit = UNIT_SHORT[rel.unit] ?? "d";
  return `@${rel.amount}${unit}`;
}

/** 阶段 2 输入：按时间从旧到新 */
export function formatPreprocessedForMergePrompt(posts: PreprocessedPost[]): string {
  return posts
    .filter((post) => !post.isNoise && post.summary.trim())
    .map((post) => `[${post.id}] ${formatRelativeTime(post.createdAt)}\n${post.summary.trim()}`)
    .join("\n\n---\n\n");
}

/** 阶段 3 输入：合并后的时间线 */
export function formatTimelineForExtractPrompt(entries: TimelineEntry[]): string {
  return entries
    .map(
      (entry) =>
        `[${entry.id}] ${formatRelativeTime(entry.createdAt)}\n${entry.summary.trim()}`,
    )
    .join("\n\n---\n\n");
}
