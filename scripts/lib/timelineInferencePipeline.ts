/**
 * Scheme C three-stage timeline inference CLI pipeline.
 * Stage 1 parallel preprocess → stage 2 timeline merge → stage 3 tag extract → code-side weight aggregation
 */

import { inferTagsFromTimeline } from "../../components/interest-lab/server/timelineInference";
import {
  aggregateTagsFromTimeline,
  interestTagsToWordCloud,
} from "../../components/interest-lab/tagUtils";
import type {
  InterestTag,
  PostRecord,
  TimelineInferenceProgress,
  TimelineInferenceResult,
} from "../../components/interest-lab/types";

export interface TimelineInferencePipelineResult {
  timelineResult: TimelineInferenceResult;
  inferredTags: InterestTag[];
  wallMs: number;
  stageTiming: Partial<Record<TimelineInferenceProgress["stage"], number>>;
}

export async function runTimelineInference(
  posts: PostRecord[],
  options?: {
    onProgress?: (progress: TimelineInferenceProgress) => void;
  },
): Promise<TimelineInferencePipelineResult> {
  const batchPosts = posts.map((post) => ({
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
  }));

  const stageStarted: Partial<Record<TimelineInferenceProgress["stage"], number>> = {};
  const stageTiming: Partial<Record<TimelineInferenceProgress["stage"], number>> = {};

  const started = Date.now();
  const timelineResult = await inferTagsFromTimeline(batchPosts, {
    onProgress: (progress) => {
      if (progress.done === 0 && progress.total > 0) {
        stageStarted[progress.stage] = Date.now();
      }
      if (progress.done === progress.total && progress.total > 0) {
        const stageStart = stageStarted[progress.stage];
        if (stageStart) {
          stageTiming[progress.stage] = Date.now() - stageStart;
        }
      }
      options?.onProgress?.(progress);
    },
  });

  const totalPosts = posts.filter((post) => post.text.trim()).length || 1;
  const inferredTags = aggregateTagsFromTimeline(timelineResult.timeline, timelineResult.tags, {
    totalPosts,
  });

  return {
    timelineResult,
    inferredTags,
    wallMs: Date.now() - started,
    stageTiming,
  };
}

export function tagsToWordCloudPreview(tags: InterestTag[]): ReturnType<typeof interestTagsToWordCloud> {
  return interestTagsToWordCloud(tags);
}
