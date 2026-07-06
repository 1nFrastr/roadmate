/**
 * 语料滚动推断评测 — 对齐首页「导入 txt → 推断并保存」完整链路。
 *
 * 流程（与 extract-posts API + InterestLab.handleGenerate 一致）:
 *   parsePostsFromTxt → planCorpusInference → inferTagsFromCorpus(分批滚动)
 *   → applyCorpusInference → corpusTagsToInterestTags → buildInferenceContext
 *
 * 用法:
 *   npm run bench:corpus
 *   npm run bench:corpus -- /path/to/roadmate-posts.txt
 *   npm run bench:corpus -- --case multi-theme-user
 *   npm run bench:corpus -- --verbose
 *   npm run bench:corpus -- --json
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePostsFromTxt } from "../components/interest-lab/postImportExport";
import { normalizeTagKey } from "../components/interest-lab/postUtils";
import { splitPostsIntoBatches } from "../components/interest-lab/server/corpusBatch";
import { runHomepageInference } from "./lib/homepageInferencePipeline";
import type { PostRecord } from "../components/interest-lab/types";

const DEFAULT_CASES_DIR = resolve(process.cwd(), "scripts/fixtures/corpus-cases");

interface CaseExpect {
  required?: string[];
  forbidden?: string[];
  anyOf?: string[][];
  minTags?: number;
  maxTags?: number;
  /** 至少触发 N 批滚动（模拟首页分批进度） */
  minBatches?: number;
}

interface CorpusCase {
  id: string;
  description?: string;
  postsFile?: string;
  posts?: string;
  expect?: CaseExpect;
}

interface Manifest {
  schema?: string;
  cases: CorpusCase[];
}

interface CaseEvalResult {
  id: string;
  description: string;
  model: string;
  postCount: number;
  planMode: string;
  batchCount: number;
  wallMs: number;
  tags: string[];
  summary: string;
  pass: boolean;
  score: number;
  checks: {
    required: { needle: string; hit: string | null }[];
    forbidden: { needle: string; hit: string | null }[];
    anyOf: { group: string[]; hit: string | null }[];
    tagCount: { actual: number; min?: number; max?: number; ok: boolean };
    batches: { actual: number; min?: number; ok: boolean };
  };
  batchProgress?: { done: number; total: number }[];
  error?: string;
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
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: string[]) {
  let casesDir = DEFAULT_CASES_DIR;
  let singlePostsPath: string | null = null;
  let caseFilter: string | null = null;
  let models: string[] | null = null;
  let jsonOutput = false;
  let verbose = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--cases" && argv[i + 1]) {
      casesDir = resolve(argv[i + 1]!);
      i += 1;
      continue;
    }
    if (arg === "--case" && argv[i + 1]) {
      caseFilter = argv[i + 1]!;
      i += 1;
      continue;
    }
    if (arg === "--models" && argv[i + 1]) {
      models = argv[i + 1]!.split(",").map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === "--json") {
      jsonOutput = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`用法:
  npm run bench:corpus                              # manifest 全部 case
  npm run bench:corpus -- --case multi-theme-user   # 单个 case
  npm run bench:corpus -- posts.txt                 # 单文件（首页同款流程）
  npm run bench:corpus -- --verbose                 # 打印分批滚动进度
  npm run bench:corpus -- --json                    # JSON 输出`);
      process.exit(0);
    }
    if (!arg.startsWith("-")) {
      singlePostsPath = resolve(arg);
    }
  }

  return { casesDir, singlePostsPath, caseFilter, models, jsonOutput, verbose };
}

function tagMatches(needle: string, tagName: string): boolean {
  const n = normalizeTagKey(needle);
  const t = normalizeTagKey(tagName);
  if (!n || !t) return false;
  return t.includes(n) || n.includes(t);
}

function findMatchingTag(needle: string, tags: string[]): string | null {
  return tags.find((tag) => tagMatches(needle, tag)) ?? null;
}

function loadManifest(casesDir: string): Manifest {
  const manifestPath = join(casesDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`未找到 manifest: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
}

function loadCasePosts(caseDef: CorpusCase, casesDir: string): PostRecord[] {
  let raw: string;
  if (caseDef.posts) {
    raw = caseDef.posts;
  } else if (caseDef.postsFile) {
    const postsPath = join(casesDir, caseDef.postsFile);
    raw = readFileSync(postsPath, "utf8");
  } else {
    throw new Error(`case ${caseDef.id} 缺少 posts 或 postsFile`);
  }

  const { posts, errors } = parsePostsFromTxt(raw);
  if (errors.length > 0) {
    throw new Error(`case ${caseDef.id} 帖子解析失败:\n${errors.join("\n")}`);
  }
  if (posts.length === 0) {
    throw new Error(`case ${caseDef.id} 帖子为空`);
  }
  return posts;
}

function evaluateCase(
  tags: string[],
  batchCount: number,
  expect: CaseExpect | undefined,
): Pick<CaseEvalResult, "pass" | "score" | "checks"> {
  if (!expect) {
    return {
      pass: tags.length > 0,
      score: tags.length > 0 ? 1 : 0,
      checks: {
        required: [],
        forbidden: [],
        anyOf: [],
        tagCount: { actual: tags.length, ok: true },
        batches: { actual: batchCount, ok: true },
      },
    };
  }

  const required = expect.required ?? [];
  const forbidden = expect.forbidden ?? [];
  const anyOf = expect.anyOf ?? [];
  const minTags = expect.minTags;
  const maxTags = expect.maxTags;
  const minBatches = expect.minBatches;

  const requiredChecks = required.map((needle) => ({
    needle,
    hit: findMatchingTag(needle, tags),
  }));

  const forbiddenChecks = forbidden.map((needle) => ({
    needle,
    hit: findMatchingTag(needle, tags),
  }));

  const anyOfChecks = anyOf.map((group) => {
    for (const needle of group) {
      const hit = findMatchingTag(needle, tags);
      if (hit) return { group, hit };
    }
    return { group, hit: null };
  });

  const tagCountOk =
    (minTags === undefined || tags.length >= minTags) &&
    (maxTags === undefined || tags.length <= maxTags);

  const batchesOk = minBatches === undefined || batchCount >= minBatches;

  const requiredOk = requiredChecks.every((item) => item.hit !== null);
  const forbiddenOk = forbiddenChecks.every((item) => item.hit === null);
  const anyOfOk = anyOfChecks.every((item) => item.hit !== null);

  const totalChecks =
    required.length +
    forbidden.length +
    anyOf.length +
    (minTags !== undefined || maxTags !== undefined ? 1 : 0) +
    (minBatches !== undefined ? 1 : 0);
  const passedChecks =
    requiredChecks.filter((item) => item.hit).length +
    forbiddenChecks.filter((item) => !item.hit).length +
    anyOfChecks.filter((item) => item.hit).length +
    (tagCountOk ? 1 : 0) +
    (batchesOk ? 1 : 0);

  const score = totalChecks === 0 ? 1 : passedChecks / totalChecks;
  const pass = requiredOk && forbiddenOk && anyOfOk && tagCountOk && batchesOk;

  return {
    pass,
    score,
    checks: {
      required: requiredChecks,
      forbidden: forbiddenChecks,
      anyOf: anyOfChecks,
      tagCount: { actual: tags.length, min: minTags, max: maxTags, ok: tagCountOk },
      batches: { actual: batchCount, min: minBatches, ok: batchesOk },
    },
  };
}

async function runWithModel(posts: PostRecord[], model: string, verbose: boolean) {
  const prevModel = process.env.OPENROUTER_LLM_MODEL;
  process.env.OPENROUTER_LLM_MODEL = model;

  try {
    const result = await runHomepageInference(posts, {
      priorState: null,
      onProgress: verbose
        ? (done, total) => {
            process.stdout.write(`    分批 ${done}/${total}\n`);
          }
        : undefined,
    });

    return {
      tags: result.inferredTags.map((tag) => tag.name),
      summary: result.corpusResult.summary,
      wallMs: result.wallMs,
      planMode: result.plan.mode,
      batchCount: result.batchCount,
      batchProgress: result.batchProgress,
    };
  } finally {
    if (prevModel === undefined) {
      delete process.env.OPENROUTER_LLM_MODEL;
    } else {
      process.env.OPENROUTER_LLM_MODEL = prevModel;
    }
  }
}

async function runSingleFile(postsPath: string, model: string, verbose: boolean) {
  const raw = readFileSync(postsPath, "utf8");
  const { posts, errors } = parsePostsFromTxt(raw);
  if (errors.length > 0) {
    throw new Error(`帖子解析失败:\n${errors.join("\n")}`);
  }

  const batchCount = splitPostsIntoBatches(
    posts.map((p) => ({ id: p.id, text: p.text, createdAt: p.createdAt })),
  ).length;

  console.log(`文件: ${postsPath}`);
  console.log(`帖子: ${posts.length} · 预估分批: ${batchCount} · 模型: ${model}`);
  console.log(`流程: 导入(parsePostsFromTxt) → planCorpusInference(full) → 滚动分批推断 → corpusTagsToInterestTags\n`);

  const { tags, summary, wallMs, planMode, batchCount: actualBatches, batchProgress } =
    await runWithModel(posts, model, verbose);

  console.log(`模式 ${planMode} · 分批 ${actualBatches} · 耗时 ${wallMs}ms · ${tags.length} 标签\n`);
  if (verbose && batchProgress.length > 0) {
    console.log("滚动进度:", batchProgress.map((p) => `${p.done}/${p.total}`).join(" → "));
    console.log();
  }
  console.log("summary:", summary || "(空)");
  console.log("\n标签:", tags.join(" · ") || "(空)");
}

function printCaseResult(result: CaseEvalResult, verbose: boolean) {
  const mark = result.pass ? "✓" : "✗";
  console.log(`\n${mark} ${result.id} — ${result.description}`);
  console.log(
    `  ${result.model} · ${result.postCount} 帖 · ${result.planMode} · ${result.batchCount} 批 · ${result.wallMs}ms · ${result.tags.length} 标签 · 得分 ${(result.score * 100).toFixed(0)}%`,
  );
  if (result.error) {
    console.log(`  错误: ${result.error}`);
    return;
  }
  console.log(`  标签: ${result.tags.join(" · ") || "(空)"}`);
  if (verbose) {
    console.log(`  summary: ${result.summary.slice(0, 120) || "(空)"}`);
    if (result.batchProgress?.length) {
      console.log(`  滚动: ${result.batchProgress.map((p) => `${p.done}/${p.total}`).join(" → ")}`);
    }
  }

  const { checks } = result;
  if (checks.batches.min !== undefined) {
    console.log(
      `  分批 ${checks.batches.actual} (期望 ≥${checks.batches.min}): ${checks.batches.ok ? "✓" : "✗"}`,
    );
  }
  for (const item of checks.anyOf) {
    const status = item.hit ? `✓ → ${item.hit}` : `✗ 未命中 (${item.group.join("|")})`;
    console.log(`  主题组 ${item.group.slice(0, 3).join("|")}${item.group.length > 3 ? "…" : ""}: ${status}`);
  }
  for (const item of checks.required) {
    const status = item.hit ? `✓ → ${item.hit}` : "✗ 未命中";
    console.log(`  必需「${item.needle}」: ${status}`);
  }
  for (const item of checks.forbidden) {
    const status = item.hit ? `✗ 违规 → ${item.hit}` : "✓ 未出现";
    console.log(`  禁止「${item.needle}」: ${status}`);
  }
  if (checks.tagCount.min !== undefined || checks.tagCount.max !== undefined) {
    const range = `${checks.tagCount.min ?? 0}~${checks.tagCount.max ?? "∞"}`;
    console.log(`  标签数 ${checks.tagCount.actual} (期望 ${range}): ${checks.tagCount.ok ? "✓" : "✗"}`);
  }
}

function printSummary(results: CaseEvalResult[]) {
  const passed = results.filter((r) => r.pass && !r.error).length;
  const failed = results.filter((r) => !r.pass && !r.error).length;
  const errored = results.filter((r) => r.error).length;
  const avgScore =
    results.length === 0 ? 0 : results.reduce((sum, r) => sum + r.score, 0) / results.length;

  console.log("\n=== 汇总 ===");
  console.log(`通过 ${passed} · 失败 ${failed} · 错误 ${errored} · 平均得分 ${(avgScore * 100).toFixed(0)}%`);

  const byModel = new Map<string, CaseEvalResult[]>();
  for (const row of results) {
    const list = byModel.get(row.model) ?? [];
    list.push(row);
    byModel.set(row.model, list);
  }

  if (byModel.size > 1) {
    console.log("\n按模型:");
    for (const [model, rows] of byModel) {
      const modelPassed = rows.filter((r) => r.pass && !r.error).length;
      const modelScore = rows.reduce((s, r) => s + r.score, 0) / rows.length;
      console.log(`  ${model}: ${modelPassed}/${rows.length} 通过, 均分 ${(modelScore * 100).toFixed(0)}%`);
    }
  }
}

async function runManifestEval(options: {
  casesDir: string;
  caseFilter: string | null;
  models: string[];
  jsonOutput: boolean;
  verbose: boolean;
}) {
  const manifest = loadManifest(options.casesDir);
  let cases = manifest.cases;

  if (options.caseFilter) {
    cases = cases.filter((c) => c.id === options.caseFilter);
    if (cases.length === 0) {
      throw new Error(`未找到 case: ${options.caseFilter}`);
    }
  }

  console.log(`评测目录: ${options.casesDir}`);
  console.log(`schema: ${manifest.schema ?? "(未标注)"}`);
  console.log(`case 数: ${cases.length} · 模型: ${options.models.join(", ")}`);
  console.log("流程: 首页同款 — planCorpusInference → 滚动分批 → corpusTagsToInterestTags\n");

  const results: CaseEvalResult[] = [];

  for (const model of options.models) {
    for (const caseDef of cases) {
      const posts = loadCasePosts(caseDef, options.casesDir);
      const base = {
        id: caseDef.id,
        description: caseDef.description ?? caseDef.id,
        model,
        postCount: posts.length,
      };

      try {
        if (options.verbose) {
          console.log(`\n--- ${caseDef.id} (${posts.length} 帖) ---`);
        }
        const { tags, summary, wallMs, planMode, batchCount, batchProgress } = await runWithModel(
          posts,
          model,
          options.verbose,
        );
        const evalResult = evaluateCase(tags, batchCount, caseDef.expect);
        results.push({
          ...base,
          planMode,
          batchCount,
          wallMs,
          tags,
          summary,
          batchProgress,
          ...evalResult,
        });
      } catch (err) {
        results.push({
          ...base,
          planMode: "error",
          batchCount: 0,
          wallMs: 0,
          tags: [],
          summary: "",
          pass: false,
          score: 0,
          checks: {
            required: [],
            forbidden: [],
            anyOf: [],
            tagCount: { actual: 0, ok: false },
            batches: { actual: 0, ok: false },
          },
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (options.jsonOutput) {
    console.log(JSON.stringify({ results }, null, 2));
  } else {
    for (const result of results) {
      printCaseResult(result, options.verbose);
    }
    printSummary(results);
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error("OPENROUTER_API_KEY 未配置");
  }

  const { casesDir, singlePostsPath, caseFilter, models, jsonOutput, verbose } = parseArgs(
    process.argv.slice(2),
  );
  const modelList = models ?? [process.env.OPENROUTER_LLM_MODEL?.trim() || "deepseek/deepseek-v4-flash"];

  if (singlePostsPath) {
    await runSingleFile(singlePostsPath, modelList[0]!, verbose);
    return;
  }

  await runManifestEval({ casesDir, caseFilter, models: modelList, jsonOutput, verbose });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
