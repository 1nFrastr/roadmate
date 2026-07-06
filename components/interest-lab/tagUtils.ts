import {
  MAX_INFERRED_TAGS,
  MAX_REFINED_TAGS,
  MIN_SINGLE_POST_SENTIMENT,
  MIN_TAG_POST_COUNT,
  RECENCY_DECAY_LAMBDA,
  STALE_TAG_DAYS,
  WEIGHT_FACTORS,
} from "./constants";
import { normalizeTagKey } from "./postUtils";
import type { InterestTag, LlmTagDraft, PostRecord, PostTagDraft, TimelineEntry, TimelineTagDraft } from "./types";
import type { WordCloudTag } from "@/components/tag-word-cloud";

const CUSTOM_TAG_DEFAULT_WEIGHT = 0.55;
const MS_PER_DAY = 86_400_000;

interface TagAccumulator {
  displayName: string;
  postIds: Set<string>;
  sentiments: number[];
  postDates: string[];
}

export function computeTagWeight(frequency: number, sentiment: number, recency: number): number {
  const raw =
    frequency * WEIGHT_FACTORS.frequency +
    sentiment * WEIGHT_FACTORS.sentiment * recency +
    recency * WEIGHT_FACTORS.recency;

  return Math.round(raw * 1000) / 1000;
}

function daysSince(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / MS_PER_DAY);
}

function decayForDays(days: number): number {
  return Math.exp(-RECENCY_DECAY_LAMBDA * days);
}

/** 纯频次：出现次数 / 总帖数（不与 recency 耦合，时间衰减仅由 recency 维度承担） */
function computeRawFrequency(occurrenceCount: number, totalPosts: number): number {
  if (occurrenceCount <= 0 || totalPosts <= 0) return 0;
  return Math.round((occurrenceCount / totalPosts) * 1000) / 1000;
}

/** 以最后一次出现时间为准，几个月前 ≈ 0 */
function computeRecencyFromLastSeen(lastSeenAt: string, now: number): number {
  return Math.round(decayForDays(daysSince(lastSeenAt, now)) * 1000) / 1000;
}

function isStaleTag(lastSeenAt: string, postCount: number, now = Date.now()): boolean {
  if (postCount > 1) return false;
  const days = (now - new Date(lastSeenAt).getTime()) / MS_PER_DAY;
  return days > STALE_TAG_DAYS;
}

/** 语料级推断结果 → InterestTag（按 LLM 排序映射 weight） */
export function corpusTagsToInterestTags(
  drafts: PostTagDraft[],
  posts: PostRecord[],
): InterestTag[] {
  const trimmedPosts = posts.filter((post) => post.text.trim());
  const totalPosts = trimmedPosts.length || 1;
  const newestAt =
    trimmedPosts.reduce(
      (latest, post) =>
        new Date(post.createdAt).getTime() > new Date(latest).getTime() ? post.createdAt : latest,
      trimmedPosts[0]?.createdAt ?? new Date().toISOString(),
    ) ?? new Date().toISOString();

  const now = Date.now();
  const recency = computeRecencyFromLastSeen(newestAt, now);

  return drafts.slice(0, MAX_REFINED_TAGS).map((draft, index) => {
    const sentiment = draft.sentiment;
    const rankWeight = 1 - index * (0.75 / Math.max(MAX_REFINED_TAGS, 1));
    const frequency = Math.round((rankWeight / totalPosts) * 1000) / 1000;

    return {
      name: draft.name,
      frequency,
      sentiment,
      recency,
      postCount: totalPosts,
      lastSeenAt: newestAt,
      weight: computeTagWeight(frequency, sentiment, recency),
    };
  });
}

interface TimelineTagAccumulator {
  displayName: string;
  sourcePostIds: Set<string>;
  sentiments: number[];
  lastSeenAt: string;
}

/** 方案 C — 时间线条目归因 → 按 INFERENCE.md 公式聚合 */
export function aggregateTagsFromTimeline(
  timeline: TimelineEntry[],
  tagDrafts: TimelineTagDraft[],
  options?: { totalPosts?: number },
): InterestTag[] {
  if (timeline.length === 0 || tagDrafts.length === 0) return [];

  const entryById = new Map(timeline.map((entry) => [entry.id, entry]));
  const totalPosts =
    options?.totalPosts ??
    (new Set(timeline.flatMap((entry) => entry.sourcePostIds)).size || 1);

  const accumulators = new Map<string, TimelineTagAccumulator>();

  for (const draft of tagDrafts) {
    const name = draft.name.trim();
    const key = normalizeTagKey(name);
    if (!key) continue;

    let acc = accumulators.get(key);
    if (!acc) {
      acc = {
        displayName: name,
        sourcePostIds: new Set(),
        sentiments: [],
        lastSeenAt: "",
      };
      accumulators.set(key, acc);
    }

    for (const entryId of draft.entryIds) {
      const entry = entryById.get(entryId);
      if (!entry) continue;

      for (const postId of entry.sourcePostIds) {
        acc.sourcePostIds.add(postId);
      }

      if (
        !acc.lastSeenAt ||
        new Date(entry.createdAt).getTime() > new Date(acc.lastSeenAt).getTime()
      ) {
        acc.lastSeenAt = entry.createdAt;
      }

      acc.sentiments.push(draft.sentiment);
    }
  }

  const now = Date.now();
  const tags: InterestTag[] = [];

  for (const acc of accumulators.values()) {
    const postCount = acc.sourcePostIds.size;
    if (postCount < MIN_TAG_POST_COUNT || !acc.lastSeenAt) continue;

    const frequency = computeRawFrequency(postCount, totalPosts);
    const sentiment =
      Math.round(
        (acc.sentiments.reduce((sum, value) => sum + value, 0) / acc.sentiments.length) * 1000,
      ) / 1000;
    const recency = computeRecencyFromLastSeen(acc.lastSeenAt, now);

    if (postCount === 1 && sentiment < MIN_SINGLE_POST_SENTIMENT) continue;
    if (isStaleTag(acc.lastSeenAt, postCount, now)) continue;

    tags.push({
      name: acc.displayName,
      frequency,
      sentiment,
      recency,
      postCount,
      lastSeenAt: acc.lastSeenAt,
      weight: computeTagWeight(frequency, sentiment, recency),
    });
  }

  return tags
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.name.localeCompare(b.name, "zh-CN");
    })
    .slice(0, MAX_INFERRED_TAGS);
}

export function aggregateTagsFromPosts(posts: PostRecord[]): InterestTag[] {
  const processed = posts.filter((post) => post.extractedAt && post.tags?.length);
  const totalPosts = posts.filter((post) => post.text.trim()).length || 1;
  const accumulators = new Map<string, TagAccumulator>();

  for (const post of processed) {
    for (const tag of post.tags ?? []) {
      const name = tag.name.trim();
      const key = normalizeTagKey(name);
      if (!key) continue;

      let acc = accumulators.get(key);
      if (!acc) {
        acc = {
          displayName: name,
          postIds: new Set(),
          sentiments: [],
          postDates: [],
        };
        accumulators.set(key, acc);
      }

      if (!acc.postIds.has(post.id)) {
        acc.postIds.add(post.id);
        acc.sentiments.push(tag.sentiment);
        acc.postDates.push(post.createdAt);
      }
    }
  }

  const now = Date.now();
  const tags: InterestTag[] = [];

  for (const acc of accumulators.values()) {
    const postCount = acc.postIds.size;
    if (postCount < MIN_TAG_POST_COUNT) continue;

    const lastSeenAt = acc.postDates.reduce((latest, date) =>
      new Date(date).getTime() > new Date(latest).getTime() ? date : latest,
    );

    const frequency = computeRawFrequency(postCount, totalPosts);
    const sentiment =
      Math.round(
        (acc.sentiments.reduce((sum, value) => sum + value, 0) / acc.sentiments.length) * 1000,
      ) / 1000;
    const recency = computeRecencyFromLastSeen(lastSeenAt, now);

    if (postCount === 1 && sentiment < MIN_SINGLE_POST_SENTIMENT) continue;
    if (isStaleTag(lastSeenAt, postCount, now)) continue;

    tags.push({
      name: acc.displayName,
      frequency,
      sentiment,
      recency,
      postCount,
      lastSeenAt,
      weight: computeTagWeight(frequency, sentiment, recency),
    });
  }

  return tags
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.name.localeCompare(b.name, "zh-CN");
    })
    .slice(0, MAX_INFERRED_TAGS);
}

/** 按 profile 精炼结果保留标签，顺序与 keepNames 一致 */
export function applyTagRefinement(tags: InterestTag[], keepNames: string[]): InterestTag[] {
  const byKey = new Map(tags.map((tag) => [normalizeTagKey(tag.name), tag]));
  const kept: InterestTag[] = [];

  for (const name of keepNames) {
    const tag = byKey.get(normalizeTagKey(name));
    if (tag) kept.push(tag);
  }

  return kept;
}

/** @deprecated 整段语料 LLM 分数直接转标签 */
export function draftsToTags(drafts: LlmTagDraft[]): InterestTag[] {
  return drafts
    .map((draft) => ({
      name: draft.name,
      frequency: draft.frequency,
      sentiment: draft.sentiment,
      recency: draft.recency,
      weight: computeTagWeight(draft.frequency, draft.sentiment, draft.recency),
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function createCustomTag(name: string, weight = CUSTOM_TAG_DEFAULT_WEIGHT): InterestTag {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    weight,
    frequency: 0,
    sentiment: 0.5,
    recency: 1,
    custom: true,
  };
}

export function interestTagsToWordCloud(tags: InterestTag[]): WordCloudTag[] {
  return tags.map((tag, index) => ({
    id: tag.id ?? (tag.custom ? `custom-${tag.name}` : `inferred-${index}-${tag.name}`),
    name: tag.name,
    weight: tag.weight,
    custom: tag.custom,
  }));
}

export function buildProfileEmbeddings(
  tags: InterestTag[],
  existingEmbeddings: { name: string; vector: number[] }[],
  newlyEmbedded: { name: string; vector: number[] }[],
): { name: string; vector: number[] }[] {
  const vectorsByName = new Map(existingEmbeddings.map((item) => [item.name, item.vector]));
  for (const item of newlyEmbedded) {
    vectorsByName.set(item.name, item.vector);
  }
  return tags.map((tag) => ({
    name: tag.name,
    vector: vectorsByName.get(tag.name) ?? [],
  }));
}
