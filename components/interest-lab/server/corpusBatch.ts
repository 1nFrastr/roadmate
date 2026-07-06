import { CORPUS_BATCH_MAX_CHARS, CORPUS_BATCH_MAX_POSTS } from "../constants";
import { isoToRelative } from "../postUtils";
import { shouldSkipTagExtraction } from "./postExtractionSkip";

export interface CorpusBatchPost {
  id: string;
  text: string;
  createdAt: string;
}

export interface CorpusBatch {
  posts: CorpusBatchPost[];
}

const UNIT_SHORT: Record<string, string> = {
  hours: "h",
  days: "d",
  weeks: "w",
  months: "m",
};

/** 按时间从旧到新切批，过滤跳过帖 */
export function splitPostsIntoBatches(posts: CorpusBatchPost[]): CorpusBatch[] {
  const eligible = posts
    .filter((post) => post.text.trim() && !shouldSkipTagExtraction(post.text))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (eligible.length === 0) return [];

  const batches: CorpusBatch[] = [];
  let current: CorpusBatchPost[] = [];
  let charCount = 0;

  for (const post of eligible) {
    const postChars = post.text.length;
    const wouldOverflow =
      current.length >= CORPUS_BATCH_MAX_POSTS ||
      (current.length > 0 && charCount + postChars > CORPUS_BATCH_MAX_CHARS);

    if (wouldOverflow) {
      batches.push({ posts: current });
      current = [];
      charCount = 0;
    }

    current.push(post);
    charCount += postChars;
  }

  if (current.length > 0) batches.push({ posts: current });
  return batches;
}

export function formatBatchPostsForPrompt(posts: CorpusBatchPost[]): string {
  return posts
    .map((post, index) => {
      const rel = isoToRelative(post.createdAt);
      const unit = UNIT_SHORT[rel.unit] ?? "d";
      return `[${index + 1}] @${rel.amount}${unit}\n${post.text.trim().slice(0, 1800)}`;
    })
    .join("\n\n---\n\n");
}

export function collectBatchPostIds(batches: CorpusBatch[]): string[] {
  return batches.flatMap((batch) => batch.posts.map((post) => post.id));
}

/** 被跳过的帖也标记为已处理，避免重复触发 */
export function collectAllEligiblePostIds(posts: CorpusBatchPost[]): string[] {
  return posts.filter((post) => post.text.trim()).map((post) => post.id);
}
