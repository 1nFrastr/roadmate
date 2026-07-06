import {
  LLM_CONCURRENCY,
  LLM_EXTRACT_TEMPERATURE,
  LLM_PREPROCESS_MAX_TOKENS,
  LLM_REASONING_EFFORT,
  LLM_SEED,
  LLM_TIMELINE_EXTRACT_MAX_TOKENS,
  LLM_TIMELINE_MERGE_MAX_TOKENS,
  MAX_TIMELINE_TAGS,
  OPENROUTER_API_BASE,
} from "../constants";
import {
  POST_PREPROCESS_PROMPT,
  TIMELINE_MERGE_PROMPT,
  TIMELINE_TAG_EXTRACTION_PROMPT,
} from "../prompts";
import { isoToRelative, normalizeTagKey } from "../postUtils";
import { isTagNameTooLong } from "../tagFilter";
import type {
  PreprocessedPost,
  TimelineEntry,
  TimelineInferenceProgress,
  TimelineInferenceResult,
  TimelineTagDraft,
} from "../types";
import type { CorpusBatchPost } from "./corpusBatch";
import { collectAllEligiblePostIds } from "./corpusBatch";
import { getLlmModel, getOpenRouterApiKey } from "./env";
import { logInferenceTiming } from "./timing";
import {
  formatPreprocessedForMergePrompt,
  formatTimelineForExtractPrompt,
} from "./timelineFormat";

interface LlmContext {
  apiKey: string;
  model: string;
}

export interface InferTimelineOptions {
  onProgress?: (progress: TimelineInferenceProgress) => void;
}

const UNIT_SHORT: Record<string, string> = {
  hours: "h",
  days: "d",
  weeks: "w",
  months: "m",
};

function createLlmContext(): LlmContext {
  return { apiKey: getOpenRouterApiKey(), model: getLlmModel() };
}

function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
    "X-OpenRouter-Title": "Roadmate Interest Lab",
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function formatPostRelative(iso: string): string {
  const rel = isoToRelative(iso);
  const unit = UNIT_SHORT[rel.unit] ?? "d";
  return `@${rel.amount}${unit}`;
}

async function callLlmJson<T>(
  ctx: LlmContext,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
): Promise<T | null> {
  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(ctx.apiKey),
    body: JSON.stringify({
      model: ctx.model,
      temperature: LLM_EXTRACT_TEMPERATURE,
      seed: LLM_SEED,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      reasoning: { effort: LLM_REASONING_EFFORT },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter 时间线推断失败 (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function preprocessPost(
  ctx: LlmContext,
  post: CorpusBatchPost,
): Promise<PreprocessedPost> {
  const parsed = await callLlmJson<{ isNoise?: boolean; summary?: string }>(
    ctx,
    POST_PREPROCESS_PROMPT,
    `请预处理以下帖子：\n\n${formatPostRelative(post.createdAt)}\n${post.text.trim().slice(0, 2000)}`,
    LLM_PREPROCESS_MAX_TOKENS,
  );

  if (!parsed) {
    return {
      id: post.id,
      createdAt: post.createdAt,
      isNoise: false,
      summary: post.text.trim().slice(0, 200),
    };
  }

  const isNoise = Boolean(parsed.isNoise);
  return {
    id: post.id,
    createdAt: post.createdAt,
    isNoise,
    summary: isNoise ? "" : (parsed.summary ?? "").trim(),
  };
}

async function preprocessAllPosts(
  ctx: LlmContext,
  posts: CorpusBatchPost[],
  onProgress?: (done: number, total: number) => void,
): Promise<PreprocessedPost[]> {
  const eligible = posts
    .filter((post) => post.text.trim())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const total = eligible.length;
  onProgress?.(0, total);

  let done = 0;
  const results = await runWithConcurrency(eligible, LLM_CONCURRENCY, async (post) => {
    const result = await preprocessPost(ctx, post);
    done += 1;
    onProgress?.(done, total);
    return result;
  });

  return results;
}

function resolveMergedCreatedAt(
  sourcePostIds: string[],
  postsById: Map<string, PreprocessedPost>,
): string {
  let latest = "";
  let latestMs = -1;

  for (const id of sourcePostIds) {
    const post = postsById.get(id);
    if (!post) continue;
    const ms = new Date(post.createdAt).getTime();
    if (ms > latestMs) {
      latestMs = ms;
      latest = post.createdAt;
    }
  }

  return latest || new Date().toISOString();
}

function fallbackTimelineEntries(signalPosts: PreprocessedPost[]): TimelineEntry[] {
  return signalPosts.map((post, index) => ({
    id: `entry-${index + 1}`,
    createdAt: post.createdAt,
    summary: post.summary,
    sourcePostIds: [post.id],
  }));
}

async function mergeTimeline(
  ctx: LlmContext,
  preprocessed: PreprocessedPost[],
): Promise<TimelineEntry[]> {
  const signalPosts = preprocessed.filter((post) => !post.isNoise && post.summary.trim());
  if (signalPosts.length === 0) return [];

  const postsById = new Map(signalPosts.map((post) => [post.id, post]));
  const promptBody = formatPreprocessedForMergePrompt(signalPosts);

  const parsed = await callLlmJson<{
    entries?: { summary?: string; sourcePostIds?: string[] }[];
  }>(
    ctx,
    TIMELINE_MERGE_PROMPT,
    `请合并以下预处理时间线：\n\n${promptBody}`,
    LLM_TIMELINE_MERGE_MAX_TOKENS,
  );

  if (!parsed?.entries?.length) {
    return fallbackTimelineEntries(signalPosts);
  }

  const validIds = new Set(signalPosts.map((post) => post.id));
  const entries: TimelineEntry[] = [];

  for (const raw of parsed.entries) {
    const summary = raw.summary?.trim();
    if (!summary) continue;

    const sourcePostIds = (raw.sourcePostIds ?? []).filter((id) => validIds.has(id));
    if (sourcePostIds.length === 0) continue;

    entries.push({
      id: `entry-${entries.length + 1}`,
      createdAt: resolveMergedCreatedAt(sourcePostIds, postsById),
      summary,
      sourcePostIds,
    });
  }

  if (entries.length === 0) {
    return fallbackTimelineEntries(signalPosts);
  }

  return entries.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function filterTimelineTagDrafts(tags: TimelineTagDraft[]): TimelineTagDraft[] {
  const seen = new Set<string>();
  const result: TimelineTagDraft[] = [];

  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name || isTagNameTooLong(name) || tag.entryIds.length === 0) continue;

    const key = normalizeTagKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    result.push({
      name,
      sentiment: clamp01(tag.sentiment),
      entryIds: tag.entryIds,
    });
  }

  return result;
}

async function extractTagsFromTimeline(
  ctx: LlmContext,
  timeline: TimelineEntry[],
): Promise<TimelineTagDraft[]> {
  if (timeline.length === 0) return [];

  const validEntryIds = new Set(timeline.map((entry) => entry.id));
  const promptBody = formatTimelineForExtractPrompt(timeline);

  const parsed = await callLlmJson<{
    tags?: { name?: string; sentiment?: number; entryIds?: string[] }[];
  }>(
    ctx,
    TIMELINE_TAG_EXTRACTION_PROMPT,
    `请从以下时间线提取破冰标签（归因到 entryId）：\n\n${promptBody}`,
    LLM_TIMELINE_EXTRACT_MAX_TOKENS,
  );

  if (!parsed?.tags?.length) return [];

  const drafts: TimelineTagDraft[] = parsed.tags
    .filter((tag) => tag.name?.trim())
    .slice(0, MAX_TIMELINE_TAGS * 2)
    .map((tag) => ({
      name: tag.name!.trim(),
      sentiment: clamp01(tag.sentiment ?? 0),
      entryIds: (tag.entryIds ?? []).filter((id) => validEntryIds.has(id)),
    }))
    .filter((tag) => tag.entryIds.length > 0);

  return filterTimelineTagDrafts(drafts).slice(0, MAX_TIMELINE_TAGS);
}

export async function inferTagsFromTimeline(
  posts: CorpusBatchPost[],
  options?: InferTimelineOptions,
): Promise<TimelineInferenceResult> {
  const ctx = createLlmContext();
  const started = Date.now();
  const allPostIds = collectAllEligiblePostIds(posts);

  const report = (stage: TimelineInferenceProgress["stage"], done: number, total: number) => {
    options?.onProgress?.({ stage, done, total });
  };

  const preprocessed = await preprocessAllPosts(ctx, posts, (done, total) => {
    report("preprocess", done, total);
  });

  const timeline = await mergeTimeline(ctx, preprocessed);
  report("merge", 1, 1);

  const tags = await extractTagsFromTimeline(ctx, timeline);
  report("extract", 1, 1);

  logInferenceTiming("infer-timeline", Date.now() - started, {
    model: ctx.model,
    postCount: posts.length,
    signalPosts: preprocessed.filter((p) => !p.isNoise).length,
    timelineEntries: timeline.length,
    tagCount: tags.length,
  });

  return {
    preprocessed,
    timeline,
    tags,
    extractedAt: new Date().toISOString(),
    processedPostIds: allPostIds,
  };
}
