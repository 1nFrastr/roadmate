import type { FetchedTweet } from "./api/twitter";
import type { PostRecord } from "./types";

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

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
  hours: "小时前",
  days: "天前",
  weeks: "周前",
  months: "月前",
};

export function relativeToIso(amount: number, unit: RelativeTimeUnit, now = Date.now()): string {
  const clamped = Math.max(0, amount);
  return new Date(now - clamped * UNIT_MS[unit]).toISOString();
}

/** 将 ISO 时间回填为相对时间控件值 */
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

export function tweetToPostRecord(tweet: FetchedTweet): PostRecord {
  const createdAt = tweet.createdAt || new Date().toISOString();
  return {
    id: `tw-${createdAt}-${simpleHash(tweet.text)}`,
    text: tweet.text,
    createdAt,
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

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
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

/** 清除逐帖 LLM 推断结果，保留帖子文本与时间 */
export function clearPostInference(posts: PostRecord[]): PostRecord[] {
  return posts.map((post) => ({
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
  }));
}
