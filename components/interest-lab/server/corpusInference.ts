import {
  LLM_CORPUS_MAX_TOKENS,
  LLM_EXTRACT_TEMPERATURE,
  LLM_REASONING_EFFORT,
  LLM_SEED,
  MAX_CORPUS_TAGS,
  OPENROUTER_API_BASE,
} from "../constants";
import { CORPUS_ROLLING_INFERENCE_PROMPT } from "../prompts";
import { filterPostTagDrafts } from "../tagFilter";
import type {
  CorpusInferenceResult,
  CorpusInferenceState,
  CorpusRollingResponse,
  PostTagDraft,
} from "../types";
import {
  collectAllEligiblePostIds,
  formatBatchPostsForPrompt,
  splitPostsIntoBatches,
  type CorpusBatchPost,
} from "./corpusBatch";
import { getLlmModel, getOpenRouterApiKey } from "./env";
import { logInferenceTiming } from "./timing";

interface LlmContext {
  apiKey: string;
  model: string;
}

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

function parseRollingResponse(content: string): CorpusRollingResponse | null {
  try {
    const parsed = JSON.parse(content) as CorpusRollingResponse;
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.tags)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function inferRollingBatch(
  ctx: LlmContext,
  priorSummary: string,
  priorTags: PostTagDraft[],
  batchPosts: CorpusBatchPost[],
): Promise<CorpusRollingResponse | null> {
  const payload = {
    priorSummary: priorSummary.trim(),
    priorTags: priorTags.map((tag) => ({ name: tag.name, sentiment: tag.sentiment })),
    newPosts: formatBatchPostsForPrompt(batchPosts),
  };

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(ctx.apiKey),
    body: JSON.stringify({
      model: ctx.model,
      temperature: LLM_EXTRACT_TEMPERATURE,
      seed: LLM_SEED,
      max_tokens: LLM_CORPUS_MAX_TOKENS,
      response_format: { type: "json_object" },
      reasoning: { effort: LLM_REASONING_EFFORT },
      messages: [
        { role: "system", content: CORPUS_ROLLING_INFERENCE_PROMPT },
        {
          role: "user",
          content: `请滚动更新用户画像（综合 prior + 本批新帖）：\n\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter 语料推断失败 (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = parseRollingResponse(content);
  if (!parsed) return null;

  const tags = filterPostTagDrafts(
    parsed.tags
      .filter((tag) => tag.name?.trim())
      .slice(0, MAX_CORPUS_TAGS)
      .map((tag) => ({
        name: tag.name.trim(),
        sentiment: clamp01(tag.sentiment),
      })),
  );

  return {
    summary: parsed.summary.trim().slice(0, 500),
    tags,
  };
}

export interface InferCorpusOptions {
  priorState?: CorpusInferenceState | null;
  mode?: "full" | "incremental";
  onProgress?: (done: number, total: number) => void;
}

export async function inferTagsFromCorpus(
  posts: CorpusBatchPost[],
  options?: InferCorpusOptions,
): Promise<CorpusInferenceResult> {
  const ctx = createLlmContext();
  const started = Date.now();
  const allPostIds = collectAllEligiblePostIds(posts);

  const batches = splitPostsIntoBatches(posts);
  const total = batches.length;

  options?.onProgress?.(0, total);

  if (total === 0) {
    return {
      tags: [],
      summary: options?.priorState?.summary ?? "",
      extractedAt: new Date().toISOString(),
      processedPostIds: allPostIds,
    };
  }

  let summary = "";
  let tags: PostTagDraft[] = [];

  if (options?.mode === "incremental" && options.priorState) {
    summary = options.priorState.summary;
    tags = options.priorState.tags ?? [];
  }

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i]!;
    const result = await inferRollingBatch(ctx, summary, tags, batch.posts);
    if (result) {
      summary = result.summary;
      tags = result.tags;
    }
    options?.onProgress?.(i + 1, total);
  }

  logInferenceTiming("infer-corpus", Date.now() - started, {
    model: ctx.model,
    postCount: posts.length,
    batchCount: total,
    tagCount: tags.length,
    mode: options?.mode ?? "full",
  });

  return {
    tags,
    summary,
    extractedAt: new Date().toISOString(),
    processedPostIds: allPostIds,
  };
}
