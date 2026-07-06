/**
 * 调试语料滚动推断：打印每批 LLM 原始 JSON 响应
 * npx tsx scripts/debug-corpus-inference.ts [posts.txt]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePostsFromTxt } from "../components/interest-lab/postImportExport";
import {
  formatBatchPostsForPrompt,
  splitPostsIntoBatches,
} from "../components/interest-lab/server/corpusBatch";
import { CORPUS_ROLLING_INFERENCE_PROMPT } from "../components/interest-lab/prompts";
import {
  LLM_CORPUS_MAX_TOKENS,
  LLM_EXTRACT_TEMPERATURE,
  LLM_REASONING_EFFORT,
  LLM_SEED,
  OPENROUTER_API_BASE,
} from "../components/interest-lab/constants";
import { filterPostTagDrafts } from "../components/interest-lab/tagFilter";

function loadEnvFromLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function runBatch(
  apiKey: string,
  model: string,
  batchIdx: number,
  total: number,
  batchPosts: { id: string; text: string; createdAt: string }[],
  priorSummary: string,
  priorTags: { name: string; sentiment: number }[],
) {
  const payload = {
    priorSummary,
    priorTags,
    newPosts: formatBatchPostsForPrompt(batchPosts),
  };

  console.log(`\n=== Batch ${batchIdx + 1}/${total} · ${batchPosts.length} posts ===`);

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-OpenRouter-Title": "Roadmate Interest Lab",
    },
    body: JSON.stringify({
      model,
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

  console.log("HTTP", response.status);
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    console.log("Error:", data.error?.message ?? JSON.stringify(data).slice(0, 300));
    return { summary: priorSummary, tags: priorTags };
  }

  const content = data.choices?.[0]?.message?.content;
  console.log("RAW:", content);

  if (!content) return { summary: priorSummary, tags: priorTags };

  try {
    const parsed = JSON.parse(content) as {
      summary?: string;
      tags?: { name: string; sentiment: number }[];
    };
    const filtered = filterPostTagDrafts(
      (parsed.tags ?? []).map((tag) => ({
        name: tag.name?.trim() ?? "",
        sentiment: tag.sentiment ?? 0,
      })),
    );
    console.log("summary:", parsed.summary?.slice(0, 150));
    console.log("raw tags:", parsed.tags?.length ?? 0, "→ filtered:", filtered.length);
    console.log("tags:", filtered.map((t) => t.name).join(" · ") || "(空)");
    return { summary: parsed.summary ?? priorSummary, tags: filtered };
  } catch {
    console.log("JSON parse failed");
    return { summary: priorSummary, tags: priorTags };
  }
}

async function main() {
  loadEnvFromLocal();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY 未配置");

  const model = process.env.INTEREST_LAB_LLM_MODEL ?? "deepseek/deepseek-v4-flash";
  const postsPath =
    process.argv[2] ?? "/Users/xb/Downloads/roadmate-posts-20260705-195629.txt";

  const { posts } = parsePostsFromTxt(readFileSync(postsPath, "utf8"));
  const batches = splitPostsIntoBatches(
    posts.map((p) => ({ id: p.id, text: p.text, createdAt: p.createdAt })),
  );

  console.log(`模型: ${model} · 帖子 ${posts.length} · 批次 ${batches.length}`);

  let summary = "";
  let tags: { name: string; sentiment: number }[] = [];

  for (let i = 0; i < batches.length; i += 1) {
    const result = await runBatch(
      apiKey,
      model,
      i,
      batches.length,
      batches[i]!.posts,
      summary,
      tags,
    );
    summary = result.summary;
    tags = result.tags;
  }

  console.log(`\n=== 最终: ${tags.length} 标签 ===`);
  console.log(tags.map((t) => t.name).join(" · ") || "(空)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
