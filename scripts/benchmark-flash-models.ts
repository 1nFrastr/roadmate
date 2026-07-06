/**
 * 用固定帖子集对比多个 Flash 模型的逐帖提取速度。
 *
 * 用法:
 *   npm run bench:flash
 *   npm run bench:flash -- /path/to/roadmate-posts.txt
 *   npm run bench:flash -- --models qwen/qwen3.6-flash,deepseek/deepseek-v4-flash
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LLM_CONCURRENCY,
  LLM_EXTRACT_TEMPERATURE,
  LLM_SEED,
  MAX_TAGS_PER_POST,
  OPENROUTER_API_BASE,
} from "../components/interest-lab/constants";
import { parsePostsFromTxt } from "../components/interest-lab/postImportExport";
import { POST_TAG_EXTRACTION_PROMPT } from "../components/interest-lab/prompts";
import { filterPostTagDrafts } from "../components/interest-lab/tagFilter";
import { canonicalTagName } from "../components/interest-lab/tagCanonical";
import { shouldSkipTagExtraction } from "../components/interest-lab/server/postExtractionSkip";
import type { PostTagDraft, PostTagResponse } from "../components/interest-lab/types";

const DEFAULT_POSTS_PATH = resolve(process.cwd(), "scripts/fixtures/roadmate-posts.txt");
const DEFAULT_MODELS = [
  "google/gemini-2.5-flash",
  "qwen/qwen3.6-flash",
  "deepseek/deepseek-v4-flash",
  "qwen/qwen3.5-flash-02-23",
  "z-ai/glm-4.7-flash",
  "minimax/minimax-m3",
];

interface ModelBenchmarkResult {
  model: string;
  postCount: number;
  concurrency: number;
  wallMs: number;
  slowestMs: number;
  medianMs: number;
  meanMs: number;
  totalTags: number;
  errors: number;
  perPostMs: { id: string; ms: number; tagCount: number; error?: string }[];
}

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  let content: string;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    throw new Error("未找到 .env.local，请配置 OPENROUTER_API_KEY");
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: string[]) {
  let postsPath = DEFAULT_POSTS_PATH;
  let models = [...DEFAULT_MODELS];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--models" && argv[i + 1]) {
      models = argv[i + 1]!.split(",").map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`用法: npm run bench:flash -- [posts.txt] [--models a,b,c]`);
      process.exit(0);
    }
    if (!arg.startsWith("-")) {
      postsPath = resolve(arg);
    }
  }

  return { postsPath, models };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
    "X-OpenRouter-Title": "Roadmate Flash Benchmark",
  };
}

async function extractTagsFromPost(
  apiKey: string,
  model: string,
  text: string,
): Promise<{ tags: PostTagDraft[]; reasoningTokens?: number; completionTokens?: number }> {
  if (shouldSkipTagExtraction(text)) return { tags: [] };

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: LLM_EXTRACT_TEMPERATURE,
      seed: LLM_SEED,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: POST_TAG_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `请分析以下发帖，提取能体现公共上下文的搭子标签（≤6 字）：\n\n${text.slice(0, 2000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status}: ${detail.slice(0, 160)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { completion_tokens?: number; reasoning_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) return { tags: [] };

  let parsed: PostTagResponse;
  try {
    parsed = JSON.parse(content) as PostTagResponse;
  } catch {
    return { tags: [] };
  }

  if (!Array.isArray(parsed.tags)) return { tags: [] };

  const tags = filterPostTagDrafts(
    parsed.tags
      .filter((tag) => tag.name?.trim())
      .slice(0, MAX_TAGS_PER_POST)
      .map((tag) => ({
        name: canonicalTagName(tag.name.trim()),
        sentiment: clamp01(tag.sentiment),
      })),
  );

  return {
    tags,
    completionTokens: data.usage?.completion_tokens,
    reasoningTokens: data.usage?.reasoning_tokens,
  };
}

async function benchmarkModel(
  apiKey: string,
  model: string,
  posts: { id: string; text: string }[],
  concurrency: number,
): Promise<ModelBenchmarkResult> {
  const queue = [...posts];
  const perPostMs: ModelBenchmarkResult["perPostMs"] = [];
  let totalTags = 0;
  let errors = 0;
  const batchStarted = Date.now();

  async function worker() {
    while (queue.length > 0) {
      const post = queue.shift();
      if (!post) break;

      const started = Date.now();
      try {
        const { tags } = await extractTagsFromPost(apiKey, model, post.text);
        totalTags += tags.length;
        perPostMs.push({ id: post.id, ms: Date.now() - started, tagCount: tags.length });
      } catch (err) {
        errors += 1;
        perPostMs.push({
          id: post.id,
          ms: Date.now() - started,
          tagCount: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, posts.length) }, () => worker());
  await Promise.all(workers);

  const timings = perPostMs.map((item) => item.ms).sort((a, b) => a - b);
  const wallMs = Date.now() - batchStarted;

  return {
    model,
    postCount: posts.length,
    concurrency,
    wallMs,
    slowestMs: timings[timings.length - 1] ?? 0,
    medianMs: timings[Math.floor(timings.length / 2)] ?? 0,
    meanMs: timings.length ? Math.round(timings.reduce((sum, ms) => sum + ms, 0) / timings.length) : 0,
    totalTags,
    errors,
    perPostMs: perPostMs.sort((a, b) => b.ms - a.ms),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isEligibleResult(row: ModelBenchmarkResult): boolean {
  return row.errors === 0 && row.totalTags > 0;
}

function ineligibleReason(row: ModelBenchmarkResult): string {
  if (row.errors > 0) return `错误 ${row.errors}/${row.postCount}`;
  if (row.totalTags === 0) return "无有效标签";
  return "";
}

function printResults(results: ModelBenchmarkResult[]) {
  const eligible = [...results].filter(isEligibleResult).sort((a, b) => a.wallMs - b.wallMs);
  const ineligible = [...results].filter((row) => !isEligibleResult(row)).sort((a, b) => a.wallMs - b.wallMs);
  const fastest = eligible[0];

  console.log("\n=== Flash 模型逐帖提取基准（与 Interest Lab 相同 prompt / 并发）===\n");
  console.log("有效排名：无 API 错误且至少提取到 1 个标签\n");

  if (eligible.length === 0) {
    console.log("（无有效模型）\n");
  } else {
    console.log(
      ["排名", "模型", "墙钟(ms)", "最慢帖(ms)", "中位(ms)", "均耗(ms)", "标签数"].join("\t"),
    );
    eligible.forEach((row, index) => {
      const mark = row.model === fastest?.model ? " 🏆" : "";
      console.log(
        [
          index + 1,
          `${row.model}${mark}`,
          row.wallMs,
          row.slowestMs,
          row.medianMs,
          row.meanMs,
          row.totalTags,
        ].join("\t"),
      );
    });
    console.log(
      `\n推荐: ${fastest!.model}（墙钟 ${fastest!.wallMs}ms，${fastest!.totalTags} 标签，${fastest!.postCount} 帖）`,
    );
  }

  if (ineligible.length > 0) {
    console.log("\n--- 未纳入排名（403 / 全空标签 / 请求失败）---\n");
    console.log(["模型", "墙钟(ms)", "标签数", "错误", "原因"].join("\t"));
    for (const row of ineligible) {
      console.log(
        [row.model, row.wallMs, row.totalTags, row.errors, ineligibleReason(row)].join("\t"),
      );
    }
  }

  console.log("\n--- 各模型最慢 3 帖 ---");
  for (const row of [...results].sort((a, b) => a.wallMs - b.wallMs)) {
    console.log(`\n${row.model}${isEligibleResult(row) ? "" : " (无效)"}`);
    for (const item of row.perPostMs.slice(0, 3)) {
      const err = item.error ? ` ERR ${item.error}` : "";
      console.log(`  ${item.ms}ms  tags=${item.tagCount}${err}`);
    }
  }
}

async function main() {
  loadEnvLocal();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY 未配置");

  const { postsPath, models } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(postsPath, "utf8");
  const { posts, errors } = parsePostsFromTxt(raw);

  if (errors.length > 0) {
    throw new Error(`帖子解析失败:\n${errors.join("\n")}`);
  }
  if (posts.length === 0) {
    throw new Error("帖子为空");
  }

  const payload = posts.map((post) => ({ id: post.id, text: post.text }));

  console.log(`帖子文件: ${postsPath}`);
  console.log(`帖子数: ${posts.length}，并发: ${LLM_CONCURRENCY}`);
  console.log(`待测模型: ${models.join(", ")}\n`);

  const results: ModelBenchmarkResult[] = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    process.stdout.write(`[${i + 1}/${models.length}] ${model} … `);
    const result = await benchmarkModel(apiKey, model, payload, LLM_CONCURRENCY);
    results.push(result);
    console.log(`墙钟 ${result.wallMs}ms，标签 ${result.totalTags}，错误 ${result.errors}`);

    if (i < models.length - 1) {
      await sleep(2000);
    }
  }

  printResults(results);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
