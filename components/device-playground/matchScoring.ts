import type { InterestProfileSlice, InterestTag, TagEmbedding } from "@/components/interest-lab/types";
import { PLACEHOLDER_MATCH_TOPICS } from "./match-pairing/constants";

export type DeviceInterestProfile = InterestProfileSlice;

const MATCH_SCORE_RANGE = { min: 55, max: 98 } as const;
const SCORE_BLEND = { embedding: 0.58, overlap: 0.42 } as const;
const SIM_CALIBRATION = { floor: 0.42, ceiling: 0.96 } as const;
const NEIGHBOR_COUNT = 3;

/** 三台路人目标重叠率：高 / 中 / 低（再加小幅 jitter） */
const NEIGHBOR_OVERLAP_TARGETS = [0.68, 0.42, 0.22] as const;
/** 各档独有标签数量 */
const NEIGHBOR_DISTINCT_COUNTS = [2, 3, 4] as const;
/** 合成 embedding 与 owner 的偏离强度 */
const NEIGHBOR_DIVERGENCE = [0.55, 1.05, 1.75] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTagKey(name: string): string {
  return name.trim().toLowerCase();
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function getEmbeddingMap(profile: DeviceInterestProfile): Map<string, number[]> {
  return new Map(profile.embeddings.map((item) => [normalizeTagKey(item.name), item.vector]));
}

function getTagVector(profile: DeviceInterestProfile, tagName: string): number[] | null {
  const vector = getEmbeddingMap(profile).get(normalizeTagKey(tagName));
  return vector && vector.length > 0 ? vector : null;
}

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

function addVectors(a: number[], b: number[], weightB: number): number[] {
  const len = Math.min(a.length, b.length);
  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    out[i] = a[i]! + b[i]! * weightB;
  }
  return out;
}

/** 按 tag.weight 加权平均各标签 embedding，再 L2 归一化 */
export function weightedProfileVector(profile: DeviceInterestProfile): number[] | null {
  const vectors: number[][] = [];
  const weights: number[] = [];

  for (const tag of profile.tags) {
    const vector = getTagVector(profile, tag.name);
    if (!vector) continue;
    vectors.push(vector);
    weights.push(Math.max(tag.weight, 0.05));
  }

  if (vectors.length === 0) return null;

  const dim = vectors[0]!.length;
  const acc = new Array<number>(dim).fill(0);
  let weightSum = 0;

  for (let i = 0; i < vectors.length; i++) {
    const weight = weights[i]!;
    weightSum += weight;
    for (let d = 0; d < dim; d++) {
      acc[d] += vectors[i]![d]! * weight;
    }
  }

  if (weightSum === 0) return null;
  return l2Normalize(acc.map((value) => value / weightSum));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function weightedTagOverlap(owner: DeviceInterestProfile, partner: DeviceInterestProfile): number {
  const partnerKeys = new Set(partner.tags.map((tag) => normalizeTagKey(tag.name)));
  let overlap = 0;
  let ownerMass = 0;

  for (const tag of owner.tags) {
    const mass = Math.max(tag.weight, 0.05);
    ownerMass += mass;
    if (!partnerKeys.has(normalizeTagKey(tag.name))) continue;

    const partnerTag = partner.tags.find(
      (item) => normalizeTagKey(item.name) === normalizeTagKey(tag.name),
    );
    const partnerMass = partnerTag ? Math.max(partnerTag.weight, 0.05) : mass;
    overlap += (mass * Math.min(mass, partnerMass)) / Math.max(mass, partnerMass);
  }

  if (ownerMass === 0) return 0;
  return overlap / ownerMass;
}

function similarityToMatchPercent(similarity: number): number {
  const t = clamp(
    (similarity - SIM_CALIBRATION.floor) / (SIM_CALIBRATION.ceiling - SIM_CALIBRATION.floor),
    0,
    1,
  );
  const curved = Math.pow(t, 1.18);
  return Math.round(MATCH_SCORE_RANGE.min + curved * (MATCH_SCORE_RANGE.max - MATCH_SCORE_RANGE.min));
}

/**
 * 混合 profile 向量余弦相似度与加权标签重叠度，映射到 55–98 展示区间。
 * 无 embedding 时退化为纯标签重叠。
 */
export function computeMatchScore(
  owner: DeviceInterestProfile,
  partner: DeviceInterestProfile,
): number {
  const ownerVec = weightedProfileVector(owner);
  const partnerVec = weightedProfileVector(partner);
  const overlap = weightedTagOverlap(owner, partner);

  if (!ownerVec || !partnerVec) {
    return similarityToMatchPercent(overlap);
  }

  const embeddingSim = cosineSimilarity(ownerVec, partnerVec);
  const blended = SCORE_BLEND.embedding * embeddingSim + SCORE_BLEND.overlap * overlap;
  return similarityToMatchPercent(blended);
}

export function computeCommonTopics(
  owner: DeviceInterestProfile,
  partner: DeviceInterestProfile,
  count = 3,
): string[] {
  const partnerByKey = new Map(partner.tags.map((tag) => [normalizeTagKey(tag.name), tag]));

  const shared = owner.tags
    .filter((tag) => partnerByKey.has(normalizeTagKey(tag.name)))
    .map((tag) => {
      const partnerTag = partnerByKey.get(normalizeTagKey(tag.name))!;
      return {
        name: tag.name,
        score: tag.weight + partnerTag.weight,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (shared.length >= count) {
    return shared.slice(0, count).map((item) => item.name);
  }

  const extras = partner.tags
    .filter((tag) => !shared.some((item) => normalizeTagKey(item.name) === normalizeTagKey(tag.name)))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count - shared.length)
    .map((tag) => tag.name);

  return [...shared.map((item) => item.name), ...extras].slice(0, count);
}

function synthesizeTagVector(
  ownerProfile: DeviceInterestProfile,
  rng: () => number,
  divergence: number,
): number[] | null {
  const vectors = ownerProfile.tags
    .map((tag) => getTagVector(ownerProfile, tag.name))
    .filter((vector): vector is number[] => Boolean(vector));

  if (vectors.length === 0) return null;

  const noiseScale = 0.1 + divergence * 0.28;
  const pick = () => vectors[Math.floor(rng() * vectors.length)]!;

  if (vectors.length === 1) {
    const base = pick();
    const noise = base.map(() => (rng() - 0.5) * noiseScale);
    return l2Normalize(addVectors(base, noise, 1));
  }

  const a = pick();
  const b = pick();
  const mix = rng() * 0.45 + 0.15 * (1 / divergence);
  const blended = addVectors(a, b, mix);
  const noise = blended.map(() => (rng() - 0.5) * noiseScale);
  return l2Normalize(addVectors(blended, noise, 1));
}

function cloneOwnerTag(tag: InterestTag, rng: () => number, weightScale = 1): InterestTag {
  const jitter = (rng() - 0.5) * 0.08;
  return {
    ...tag,
    weight: clamp(Math.round((tag.weight * weightScale + jitter) * 1000) / 1000, 0.08, 1),
  };
}

function pickSharedOwnerTags(
  sorted: InterestTag[],
  count: number,
  slot: number,
  rng: () => number,
): InterestTag[] {
  if (count <= 0 || sorted.length === 0) return [];
  if (count >= sorted.length) {
    return sorted.map((tag) => cloneOwnerTag(tag, rng));
  }

  if (slot === 0) {
    const window = sorted.slice(0, Math.min(sorted.length, count + 1));
    return shuffleWithRng(window, rng)
      .slice(0, count)
      .map((tag) => cloneOwnerTag(tag, rng));
  }

  if (slot === 1) {
    const window = sorted.slice(0, Math.min(sorted.length, count + 2));
    return shuffleWithRng(window, rng)
      .slice(0, count)
      .map((tag) => cloneOwnerTag(tag, rng, 0.92));
  }

  const picks: InterestTag[] = [];
  const tail = sorted.slice(1);
  if (sorted[0] && rng() < 0.35) {
    picks.push(cloneOwnerTag(sorted[0], rng, 0.75));
  }
  const rest = shuffleWithRng(tail.length > 0 ? tail : sorted, rng).slice(
    0,
    Math.max(0, count - picks.length),
  );
  picks.push(...rest.map((tag) => cloneOwnerTag(tag, rng, 0.82)));
  return picks.slice(0, count);
}

function buildSyntheticNeighborProfileForSlot(
  owner: DeviceInterestProfile,
  slot: number,
  profileSeed: number,
  usedDistinctNames: Set<string>,
): DeviceInterestProfile {
  const rng = createSeededRng(hashString(`${profileSeed}-neighbor-slot-${slot}`));
  const sorted = [...owner.tags].sort((a, b) => b.weight - a.weight);
  const ownerKeys = new Set(sorted.map((tag) => normalizeTagKey(tag.name)));

  const targetOverlap = NEIGHBOR_OVERLAP_TARGETS[slot] ?? NEIGHBOR_OVERLAP_TARGETS[2]!;
  const overlapRatio = clamp(targetOverlap + (rng() - 0.5) * 0.08, 0.12, 0.82);
  const sharedCount = Math.max(1, Math.min(sorted.length, Math.round(sorted.length * overlapRatio)));
  const sharedTags = pickSharedOwnerTags(sorted, sharedCount, slot, rng);

  const distinctTarget = NEIGHBOR_DISTINCT_COUNTS[slot] ?? 3;
  const distinctCount = Math.min(
    distinctTarget,
    PLACEHOLDER_MATCH_TOPICS.filter(
      (name) => !ownerKeys.has(normalizeTagKey(name)) && !usedDistinctNames.has(normalizeTagKey(name)),
    ).length,
  );
  const pool = PLACEHOLDER_MATCH_TOPICS.filter(
    (name) =>
      !ownerKeys.has(normalizeTagKey(name)) && !usedDistinctNames.has(normalizeTagKey(name)),
  );
  const ownerEmbeddingMap = getEmbeddingMap(owner);
  const divergence = NEIGHBOR_DIVERGENCE[slot] ?? 1.2;
  const distinctWeightBase = slot === 0 ? 0.28 : slot === 1 ? 0.42 : 0.58;

  const distinctTags: InterestTag[] = [];
  const distinctEmbeddings: TagEmbedding[] = [];

  for (let i = 0; i < distinctCount && pool.length > 0; i++) {
    const index = Math.floor(rng() * pool.length);
    const name = pool.splice(index, 1)[0]!;
    usedDistinctNames.add(normalizeTagKey(name));
    const vector = synthesizeTagVector(owner, rng, divergence);
    if (!vector) continue;

    distinctTags.push({
      name,
      weight: clamp(distinctWeightBase + rng() * 0.32, 0.18, 0.92),
      frequency: 0.2 + rng() * 0.3,
      sentiment: 0.45 + rng() * 0.35,
      recency: 0.5 + rng() * 0.4,
    });
    distinctEmbeddings.push({ name, vector });
  }

  const tags = [...sharedTags, ...distinctTags].sort((a, b) => b.weight - a.weight);
  const embeddings: TagEmbedding[] = [
    ...sharedTags.map((tag) => ({
      name: tag.name,
      vector: ownerEmbeddingMap.get(normalizeTagKey(tag.name)) ?? [],
    })),
    ...distinctEmbeddings,
  ].filter((item) => item.vector.length > 0);

  return { tags, embeddings };
}

/** 一次性生成三台路人 profile，保证重叠率 / 独有标签 / 分数有区分度 */
export function buildSyntheticNeighborProfiles(
  owner: DeviceInterestProfile,
  profileSeed: number,
  count = NEIGHBOR_COUNT,
): DeviceInterestProfile[] {
  const usedDistinctNames = new Set<string>();
  return Array.from({ length: count }, (_, slot) =>
    buildSyntheticNeighborProfileForSlot(owner, slot, profileSeed, usedDistinctNames),
  );
}

/** @deprecated 单台生成；Playground 请用 buildSyntheticNeighborProfiles */
export function buildSyntheticNeighborProfile(
  owner: DeviceInterestProfile,
  seed: number,
): DeviceInterestProfile {
  const profileSeed = hashString(`legacy-${seed}`);
  return buildSyntheticNeighborProfileForSlot(owner, 0, profileSeed, new Set());
}

export function profileFromStored(
  tags: InterestTag[],
  embeddings: TagEmbedding[],
): DeviceInterestProfile | null {
  if (tags.length === 0) return null;
  return { tags, embeddings };
}
