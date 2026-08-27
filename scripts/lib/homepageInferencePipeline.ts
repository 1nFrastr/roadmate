/**
 * Same server-side inference path as Interest Lab homepage "import txt → infer & save".
 * Aligns with extract-posts API + InterestLab.handleGenerate post-processing.
 */

import {
  applyCorpusInference,
  buildInferenceContext,
  planCorpusInference,
  type CorpusInferencePlan,
} from "../../components/interest-lab/corpusUtils";
import { splitPostsIntoBatches } from "../../components/interest-lab/server/corpusBatch";
import { inferTagsFromCorpus } from "../../components/interest-lab/server/corpusInference";
import { corpusTagsToInterestTags } from "../../components/interest-lab/tagUtils";
import type {
  CorpusInferenceResult,
  CorpusInferenceState,
  InterestTag,
  PostRecord,
} from "../../components/interest-lab/types";

export interface HomepageInferenceResult {
  plan: CorpusInferencePlan;
  batchCount: number;
  batchProgress: { done: number; total: number }[];
  corpusResult: CorpusInferenceResult;
  postsWithInference: PostRecord[];
  inferredTags: InterestTag[];
  inferenceContext: CorpusInferenceState;
  wallMs: number;
}

/** Simulate first inference after bulk txt import: no priorState */
export async function runHomepageInference(
  posts: PostRecord[],
  options?: {
    priorState?: CorpusInferenceState | null;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<HomepageInferenceResult> {
  const priorState = options?.priorState ?? null;
  const plan = planCorpusInference(posts, priorState);

  if (plan.mode === "noop") {
    throw new Error("No new posts to analyze");
  }

  const batchPosts = plan.posts.map((post) => ({
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
  }));
  const batchCount = splitPostsIntoBatches(batchPosts).length;
  const batchProgress: { done: number; total: number }[] = [];

  const started = Date.now();
  const corpusResult = await inferTagsFromCorpus(batchPosts, {
    priorState: plan.mode === "incremental" ? plan.priorState : null,
    mode: plan.mode,
    onProgress: (done, total) => {
      batchProgress.push({ done, total });
      options?.onProgress?.(done, total);
    },
  });

  if (plan.mode === "incremental") {
    corpusResult.processedPostIds = [
      ...new Set([...plan.priorState.processedPostIds, ...corpusResult.processedPostIds]),
    ];
  }

  const postsWithInference = applyCorpusInference(posts, corpusResult);
  const inferredTags = corpusTagsToInterestTags(corpusResult.tags, plan.posts);
  const inferenceContext = buildInferenceContext(corpusResult);

  return {
    plan,
    batchCount,
    batchProgress,
    corpusResult,
    postsWithInference,
    inferredTags,
    inferenceContext,
    wallMs: Date.now() - started,
  };
}
