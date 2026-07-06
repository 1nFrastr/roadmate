/**
 * 与首页 Interest Lab「导入 txt → 推断并保存」相同的服务端推断链路。
 * 对齐 extract-posts API + InterestLab.handleGenerate 的后处理。
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

/** 模拟 txt 批量导入后首次推断：无 priorState */
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
    throw new Error("没有新帖子需要分析");
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
