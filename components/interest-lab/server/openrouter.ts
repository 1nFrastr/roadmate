import {
  LLM_CONCURRENCY,
  MAX_TAGS_PER_POST,
  OPENROUTER_API_BASE,
} from "../constants";
import { POST_TAG_EXTRACTION_PROMPT, TAG_REFINEMENT_PROMPT } from "../prompts";
import { filterPostTagDrafts } from "../tagFilter";
import type { PostTagDraft, PostTagResponse } from "../types";
import {
  getEmbeddingModel,
  getLlmModel,
  getOpenRouterApiKey,
  getRefineModel,
} from "./env";
import { logInferenceTiming } from "./timing";

interface LlmContext {
  apiKey: string;
  model: string;
}

function createLlmContext(model = getLlmModel()): LlmContext {
  return { apiKey: getOpenRouterApiKey(), model };
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

async function extractTagsFromPost(ctx: LlmContext, text: string): Promise<PostTagDraft[]> {
  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(ctx.apiKey),
    body: JSON.stringify({
      model: ctx.model,
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: POST_TAG_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `请分析以下单条发帖并提取可匹配话题标签：\n\n${text.slice(0, 2000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter LLM 请求失败 (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];

  let parsed: PostTagResponse;
  try {
    parsed = JSON.parse(content) as PostTagResponse;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.tags)) return [];

  return filterPostTagDrafts(
    parsed.tags
      .filter((tag) => tag.name?.trim())
      .slice(0, MAX_TAGS_PER_POST)
      .map((tag) => ({
        name: tag.name.trim(),
        sentiment: clamp01(tag.sentiment),
      })),
  );
}

export async function extractTagsFromPosts(
  posts: { id: string; text: string }[],
  options?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Map<string, { tags: PostTagDraft[]; extractedAt: string }>> {
  const concurrency = options?.concurrency ?? LLM_CONCURRENCY;
  const ctx = createLlmContext();
  const results = new Map<string, { tags: PostTagDraft[]; extractedAt: string }>();
  const queue = [...posts];
  const total = posts.length;
  let done = 0;
  const batchStarted = Date.now();
  const postTimings: { id: string; ms: number }[] = [];

  options?.onProgress?.(0, total);

  async function worker() {
    while (queue.length > 0) {
      const post = queue.shift();
      if (!post) break;

      const postStarted = Date.now();
      try {
        const tags = await extractTagsFromPost(ctx, post.text);
        results.set(post.id, { tags, extractedAt: new Date().toISOString() });
      } catch {
        results.set(post.id, { tags: [], extractedAt: new Date().toISOString() });
      }

      postTimings.push({ id: post.id, ms: Date.now() - postStarted });
      done += 1;
      options?.onProgress?.(done, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, posts.length) }, () => worker());
  await Promise.all(workers);

  const sortedTimings = [...postTimings].sort((a, b) => b.ms - a.ms);
  logInferenceTiming("extract-posts", Date.now() - batchStarted, {
    model: ctx.model,
    total,
    concurrency,
    slowestMs: sortedTimings[0]?.ms,
    medianMs: sortedTimings[Math.floor(sortedTimings.length / 2)]?.ms,
    perPostMs: sortedTimings,
  });

  return results;
}

export async function refineAggregatedTags(
  tags: { name: string; postCount: number }[],
): Promise<string[] | null> {
  if (tags.length === 0) return [];

  const started = Date.now();
  const ctx = createLlmContext(getRefineModel());
  const payload = tags.map((tag) => ({ name: tag.name, postCount: tag.postCount }));

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(ctx.apiKey),
    body: JSON.stringify({
      model: ctx.model,
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TAG_REFINEMENT_PROMPT },
        {
          role: "user",
          content: `请精炼以下聚合标签：\n\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    logInferenceTiming("refine-tags", Date.now() - started, {
      model: ctx.model,
      tagCount: tags.length,
      ok: false,
    });
    return null;
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { keep?: string[] };
    if (!Array.isArray(parsed.keep)) return null;
    const keep = parsed.keep.filter((name) => typeof name === "string" && name.trim());
    logInferenceTiming("refine-tags", Date.now() - started, {
      model: ctx.model,
      tagCount: tags.length,
      kept: keep.length,
    });
    return keep;
  } catch {
    return null;
  }
}

export async function embedTags(tagNames: string[]): Promise<number[][]> {
  if (tagNames.length === 0) return [];

  const started = Date.now();
  const apiKey = getOpenRouterApiKey();
  const model = getEmbeddingModel();

  const response = await fetch(`${OPENROUTER_API_BASE}/embeddings`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      input: tagNames,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenRouter Embedding 请求失败 (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    data?: { embedding?: number[]; index?: number }[];
  };

  const rows = data.data ?? [];
  if (rows.length !== tagNames.length) {
    throw new Error("Embedding 返回数量与标签数量不一致");
  }

  const vectors = rows
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => row.embedding ?? []);

  logInferenceTiming("embed", Date.now() - started, {
    model,
    tagCount: tagNames.length,
  });

  return vectors;
}
