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

/** Stage 2 input: oldest → newest; use short p1/p2 ids so UUIDs do not slow JSON generation */
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

/** Map merge output short p1/p2 ids back to post ids (also accepts a mistaken UUID from the model) */
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

/** Stage 3 input: merged timeline */
export function formatTimelineForExtractPrompt(entries: TimelineEntry[]): string {
  return entries
    .map(
      (entry) =>
        `[${entry.id}] ${formatRelativeTime(entry.createdAt)}\n${entry.summary.trim()}`,
    )
    .join("\n\n---\n\n");
}
