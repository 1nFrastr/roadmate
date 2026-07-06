import {
  MAX_INFERRED_TAGS,
  MIN_SINGLE_POST_SENTIMENT,
  MIN_TAG_POST_COUNT,
  RECENCY_DECAY_LAMBDA,
  STALE_TAG_DAYS,
  WEIGHT_FACTORS,
} from "./constants";
import { normalizeTagKey } from "./postUtils";
import { isGenericTag } from "./tagFilter";
import type { InterestTag, LlmTagDraft, PostRecord } from "./types";
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

/** 每条帖按时间衰减后累加，旧帖对频次的贡献接近 0 */
function computeDecayedFrequency(postDates: string[], totalPosts: number, now: number): number {
  if (postDates.length === 0 || totalPosts <= 0) return 0;

  const decaySum = postDates.reduce((sum, date) => sum + decayForDays(daysSince(date, now)), 0);
  return Math.round((decaySum / totalPosts) * 1000) / 1000;
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

export function aggregateTagsFromPosts(posts: PostRecord[]): InterestTag[] {
  const processed = posts.filter((post) => post.extractedAt && post.tags?.length);
  const totalPosts = posts.filter((post) => post.text.trim()).length || 1;
  const accumulators = new Map<string, TagAccumulator>();

  for (const post of processed) {
    for (const tag of post.tags ?? []) {
      if (isGenericTag(tag.name)) continue;

      const key = normalizeTagKey(tag.name);
      if (!key) continue;

      let acc = accumulators.get(key);
      if (!acc) {
        acc = {
          displayName: tag.name.trim(),
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
        if (tag.name.trim().length >= acc.displayName.length) {
          acc.displayName = tag.name.trim();
        }
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

    const frequency = computeDecayedFrequency(acc.postDates, totalPosts, now);
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

  return tags.sort((a, b) => b.weight - a.weight).slice(0, MAX_INFERRED_TAGS);
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
