import { LLM_CONCURRENCY, OPENROUTER_API_BASE } from "../constants";
import type { LlmTagDraft, LlmTagResponse, PostTagDraft, PostTagResponse } from "../types";

function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    "X-OpenRouter-Title": "Roadmate Interest Lab",
  };
}

const POST_TAG_EXTRACTION_PROMPT = `你是一位用户兴趣分析助手。根据单条用户发帖，提取最多 3 个兴趣标签。

对每个标签只评估 sentiment（0~1，保留两位小数）：用户对该主题的情感强度（越 passionate / 明确立场越高，中性约 0.4~0.6）。

只输出合法 JSON，格式：
{"tags":[{"name":"标签名","sentiment":0.85}]}

要求：
- 标签名简洁（2~8 字或英文词组），不要带 # 号
- 若内容无明确兴趣点（纯转发、emoji、过短），返回 {"tags":[]}
- 不要输出 markdown 或解释文字`;

export async function extractTagsFromPost(
  text: string,
  apiKey: string,
  model: string,
): Promise<PostTagDraft[]> {
  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: POST_TAG_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `请分析以下单条发帖并提取兴趣标签：\n\n${text.slice(0, 2000)}`,
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

  return parsed.tags
    .filter((tag) => tag.name?.trim())
    .slice(0, 3)
    .map((tag) => ({
      name: tag.name.trim(),
      sentiment: clamp01(tag.sentiment),
    }));
}

export async function extractTagsFromPosts(
  posts: { id: string; text: string }[],
  apiKey: string,
  model: string,
  options?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Map<string, { tags: PostTagDraft[]; extractedAt: string }>> {
  const concurrency = options?.concurrency ?? LLM_CONCURRENCY;
  const results = new Map<string, { tags: PostTagDraft[]; extractedAt: string }>();
  let done = 0;
  const total = posts.length;

  const queue = [...posts];

  async function worker() {
    while (queue.length > 0) {
      const post = queue.shift();
      if (!post) break;

      try {
        const tags = await extractTagsFromPost(post.text, apiKey, model);
        results.set(post.id, { tags, extractedAt: new Date().toISOString() });
      } catch {
        results.set(post.id, { tags: [], extractedAt: new Date().toISOString() });
      }

      done += 1;
      options?.onProgress?.(done, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, posts.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/** @deprecated 整段语料一次性推断，已由逐帖提取替代 */
export async function extractTagsWithLlm(
  corpus: string,
  apiKey: string,
  model: string,
): Promise<LlmTagDraft[]> {
  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一位用户兴趣分析助手。根据以下用户发帖/文本内容，推断 8~20 个兴趣标签。
对每个标签评估 frequency、sentiment、recency（各 0~1）。
只输出 {"tags":[{"name":"标签名","frequency":0.8,"sentiment":0.7,"recency":0.9}]}`,
        },
        {
          role: "user",
          content: `请分析以下文本并提取兴趣标签：\n\n${corpus.slice(0, 12000)}`,
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
  if (!content) throw new Error("LLM 未返回有效内容");

  const parsed = JSON.parse(content) as LlmTagResponse;
  if (!Array.isArray(parsed.tags) || parsed.tags.length === 0) {
    throw new Error("LLM 未返回任何标签");
  }

  return parsed.tags
    .filter((tag) => tag.name?.trim())
    .map((tag) => ({
      name: tag.name.trim(),
      frequency: clamp01(tag.frequency),
      sentiment: clamp01(tag.sentiment),
      recency: clamp01(tag.recency),
    }));
}

export async function embedTags(
  tagNames: string[],
  apiKey: string,
  model: string,
): Promise<number[][]> {
  if (tagNames.length === 0) return [];

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

  return rows
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => row.embedding ?? []);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
