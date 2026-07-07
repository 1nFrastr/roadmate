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

export interface MergePromptPayload {
  body: string;
  shortToPostId: Map<string, string>;
}

/** 阶段 2 输入：按时间从旧到新；帖子 id 用 p1/p2 短序号，避免 UUID 拖慢 JSON 生成 */
export function formatPreprocessedForMergePrompt(posts: PreprocessedPost[]): MergePromptPayload {
  const signal = posts.filter((post) => !post.isNoise && post.summary.trim());
  const shortToPostId = new Map<string, string>();

  const body = signal
    .map((post, index) => {
      const shortId = `p${index + 1}`;
      shortToPostId.set(shortId, post.id);
      return `[${shortId}] ${formatRelativeTime(post.createdAt)}\n${post.summary.trim()}`;
    })
    .join("\n\n---\n\n");

  return { body, shortToPostId };
}

/** 将 merge 输出的 p1/p2 短序号还原为帖子 id（兼容模型误回传 UUID） */
export function resolveMergeSourcePostIds(
  rawIds: string[],
  shortToPostId: Map<string, string>,
  validPostIds: Set<string>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawIds) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const postId = shortToPostId.get(trimmed) ?? (validPostIds.has(trimmed) ? trimmed : null);
    if (!postId || seen.has(postId)) continue;
    seen.add(postId);
    result.push(postId);
  }

  return result;
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
