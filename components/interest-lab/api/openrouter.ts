import { OPENROUTER_API_BASE } from "../constants";
import type { LlmTagDraft, LlmTagResponse } from "../types";

function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    "X-OpenRouter-Title": "Roadmate Interest Lab",
  };
}

const TAG_EXTRACTION_PROMPT = `你是一位用户兴趣分析助手。根据以下用户发帖/文本内容，推断 8~20 个兴趣标签。

对每个标签评估三个 0~1 分数（保留两位小数）：
- frequency：该主题在文本中的出现频次与占比
- sentiment：用户对该主题的情感强度（越 passionate / 明确立场越高，中性话题约 0.4~0.6）
- recency：该主题是否出现在较新的内容中（越新越高）

只输出合法 JSON，格式：
{"tags":[{"name":"标签名","frequency":0.8,"sentiment":0.7,"recency":0.9}]}

要求：
- 标签名简洁（2~8 字或英文词组），不要带 # 号
- 合并同义标签
- 不要输出 markdown 或解释文字`;

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
        { role: "system", content: TAG_EXTRACTION_PROMPT },
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

  let parsed: LlmTagResponse;
  try {
    parsed = JSON.parse(content) as LlmTagResponse;
  } catch {
    throw new Error("LLM 返回的 JSON 无法解析");
  }

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
