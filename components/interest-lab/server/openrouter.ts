import {
  LLM_REASONING_EFFORT,
  LLM_REFINE_MAX_TOKENS,
  LLM_REFINE_TEMPERATURE,
  LLM_SEED,
  OPENROUTER_API_BASE,
} from "../constants";
import { TAG_REFINEMENT_PROMPT } from "../prompts";
import type { PostTagDraft } from "../types";
import { getEmbeddingModel, getLlmModel, getOpenRouterApiKey, getRefineModel } from "./env";
import { logInferenceTiming } from "./timing";

export { inferTagsFromCorpus, type InferCorpusOptions } from "./corpusInference";

function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
    "X-OpenRouter-Title": "Roadmate Interest Lab",
  };
}

export async function refineAggregatedTags(
  tags: { name: string; postCount: number }[],
): Promise<string[] | null> {
  if (tags.length === 0) return [];

  const started = Date.now();
  const apiKey = getOpenRouterApiKey();
  const model = getRefineModel();

  const payload = tags.map((tag) => ({ name: tag.name, postCount: tag.postCount }));

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: LLM_REFINE_TEMPERATURE,
      seed: LLM_SEED,
      max_tokens: LLM_REFINE_MAX_TOKENS,
      response_format: { type: "json_object" },
      reasoning: { effort: LLM_REASONING_EFFORT },
      messages: [
        { role: "system", content: TAG_REFINEMENT_PROMPT },
        {
          role: "user",
          content: `请精炼以下聚合标签，优先保留最有公共上下文共鸣的（≤6 字）：\n\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    logInferenceTiming("refine-tags", Date.now() - started, {
      model,
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
      model,
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

/** @deprecated 逐帖提取已替换为语料滚动推断 */
export type { PostTagDraft };
