import { aggregateTagsFromTimeline } from "./tagUtils";
import type { InterestTag, PostRecord, TimelineInferenceResult } from "./types";

export function getEligiblePosts(posts: PostRecord[]): PostRecord[] {
  return posts.filter((post) => post.text.trim());
}

export function applyTimelineInference(
  posts: PostRecord[],
  result: TimelineInferenceResult,
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

export function timelineResultToInterestTags(
  result: TimelineInferenceResult,
  posts: PostRecord[],
): InterestTag[] {
  const totalPosts = posts.filter((post) => post.text.trim()).length || 1;
  return aggregateTagsFromTimeline(result.timeline, result.tags, { totalPosts });
}
