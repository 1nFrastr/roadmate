import type { FetchedTweet } from "./api/twitter";
import type { PostRecord } from "./types";

export function normalizeTagKey(name: string): string {
  return name.trim().toLowerCase();
}

export type RelativeTimeUnit = "hours" | "days" | "weeks" | "months";

const UNIT_MS: Record<RelativeTimeUnit, number> = {
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000,
  months: 30 * 86_400_000,
};

export const RELATIVE_TIME_UNIT_LABELS: Record<RelativeTimeUnit, string> = {
  hours: "hours ago",
  days: "days ago",
  weeks: "weeks ago",
  months: "months ago",
};

export function relativeToIso(amount: number, unit: RelativeTimeUnit, now = Date.now()): string {
  const clamped = Math.max(0, amount);
  return new Date(now - clamped * UNIT_MS[unit]).toISOString();
}

/** Convert an ISO timestamp back to relative-time control values */
export function isoToRelative(
  iso: string,
  now = Date.now(),
): { amount: number; unit: RelativeTimeUnit } {
  const diffMs = Math.max(0, now - new Date(iso).getTime());

  if (diffMs < 2 * UNIT_MS.days) {
    return { amount: Math.round(diffMs / UNIT_MS.hours), unit: "hours" };
  }
  if (diffMs < 8 * UNIT_MS.days) {
    return { amount: Math.round(diffMs / UNIT_MS.days), unit: "days" };
  }
  if (diffMs < 8 * UNIT_MS.weeks) {
    return { amount: Math.round(diffMs / UNIT_MS.weeks), unit: "weeks" };
  }
  return { amount: Math.round(diffMs / UNIT_MS.months), unit: "months" };
}

export function createPostRecord(text: string, createdAt?: string): PostRecord {
  const trimmed = text.trim();
  const date = createdAt ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    text: trimmed,
    createdAt: date,
  };
}

/** Sort by publish time descending (newest first) */
export function sortPostsByCreatedAtDesc(posts: PostRecord[]): PostRecord[] {
  return [...posts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function tweetToPostRecord(tweet: FetchedTweet): PostRecord {
  return {
    id: `tw-${tweet.id}`,
    text: tweet.text,
    createdAt: tweet.createdAt,
  };
}

export function tweetsToPosts(tweets: FetchedTweet[]): PostRecord[] {
  return tweets.map(tweetToPostRecord);
}

export function mergePosts(existing: PostRecord[], incoming: PostRecord[]): PostRecord[] {
  const byId = new Map(existing.map((post) => [post.id, post]));

  for (const post of incoming) {
    const prev = byId.get(post.id);
    if (!prev) {
      byId.set(post.id, post);
      continue;
    }
    byId.set(post.id, {
      ...post,
      extractedAt: prev.extractedAt,
      tags: prev.tags,
    });
  }

  return sortPostsByCreatedAtDesc([...byId.values()]);
}

export function getUnprocessedPosts(posts: PostRecord[]): PostRecord[] {
  return posts.filter((post) => !post.extractedAt && post.text.trim());
}

export function applyExtractedTags(
  posts: PostRecord[],
  results: Map<string, { tags: PostRecord["tags"]; extractedAt: string }>,
): PostRecord[] {
  return posts.map((post) => {
    const result = results.get(post.id);
    if (!result) return post;
    return {
      ...post,
      tags: result.tags,
      extractedAt: result.extractedAt,
    };
  });
}

/** Clear per-post LLM inference results; keep post text and timestamps */
export function clearPostInference(posts: PostRecord[]): PostRecord[] {
  return posts.map((post) => ({
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
  }));
}
