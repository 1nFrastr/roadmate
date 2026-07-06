import type { CorpusInferenceResult, CorpusInferenceState, PostRecord } from "./types";

export type CorpusInferencePlan =
  | { mode: "full"; posts: PostRecord[] }
  | { mode: "incremental"; posts: PostRecord[]; priorState: CorpusInferenceState }
  | { mode: "noop"; posts: [] };

/** 判断全量重跑 vs 增量追加 */
export function planCorpusInference(
  posts: PostRecord[],
  priorState?: CorpusInferenceState | null,
): CorpusInferencePlan {
  const eligible = posts.filter((post) => post.text.trim());
  const eligibleIds = new Set(eligible.map((post) => post.id));

  if (!priorState || priorState.processedPostIds.length === 0) {
    return { mode: "full", posts: eligible };
  }

  const processedSet = new Set(priorState.processedPostIds);

  // 删帖、改帖（extractedAt 被清）、或 processed 集合不一致 → 全量
  for (const id of processedSet) {
    if (!eligibleIds.has(id)) return { mode: "full", posts: eligible };
  }

  for (const post of eligible) {
    if (processedSet.has(post.id) && !post.extractedAt) {
      return { mode: "full", posts: eligible };
    }
  }

  const newPosts = eligible.filter((post) => !processedSet.has(post.id));
  if (newPosts.length === 0) {
    const needsRerun = eligible.some((post) => !post.extractedAt);
    if (!needsRerun) {
      return { mode: "noop", posts: [] };
    }
    return { mode: "full", posts: eligible };
  }

  return { mode: "incremental", posts: newPosts, priorState };
}

export function applyCorpusInference(
  posts: PostRecord[],
  result: CorpusInferenceResult,
): PostRecord[] {
  const processedSet = new Set(result.processedPostIds);
  const extractedAt = result.extractedAt;

  return posts.map((post) => {
    if (!processedSet.has(post.id)) return post;
    return {
      ...post,
      extractedAt,
      tags: undefined,
    };
  });
}

export function buildInferenceContext(result: CorpusInferenceResult): CorpusInferenceState {
  return {
    summary: result.summary,
    tags: result.tags,
    processedPostIds: result.processedPostIds,
    inferredAt: result.extractedAt,
  };
}
