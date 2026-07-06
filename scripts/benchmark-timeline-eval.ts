/**
 * 方案 C 时间线推断评测 — 三阶段流水线 benchmark。
 *
 * 流程:
 *   parsePostsFromTxt → inferTagsFromTimeline(预处理/合并/提取)
 *   → aggregateTagsFromTimeline(频率/情感/新鲜度权重)
 *
 * 用法:
 *   npm run bench:timeline
 *   npm run bench:timeline -- --case multi-theme-user
 *   npm run bench:timeline -- /path/to/roadmate-posts.txt
 *   npm run bench:timeline -- --verbose
 *   npm run bench:timeline -- --json
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parsePostsFromTxt } from "../components/interest-lab/postImportExport";
import { normalizeTagKey } from "../components/interest-lab/postUtils";
import { isoToRelative } from "../components/interest-lab/postUtils";
import type { InterestTag, PostRecord, TimelineInferenceProgress } from "../components/interest-lab/types";
import { runTimelineInference } from "./lib/timelineInferencePipeline";

const DEFAULT_CASES_DIR = resolve(process.cwd(), "scripts/fixtures/corpus-cases");

const STAGE_LABELS: Record<TimelineInferenceProgress["stage"], string> = {
  preprocess: "阶段1 预处理",
  merge: "阶段2 时间线合并",
  extract: "阶段3 标签提取",
};

interface CaseExpect {
  required?: string[];
  forbidden?: string[];
  anyOf?: string[][];
  minTags?: number;
  maxTags?: number;
  /** 预处理后至少保留的有效帖数 */
  minSignalPosts?: number;
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
  signalPosts: number;
  noisePosts: number;
  timelineEntries: number;
  wallMs: number;
  stageTiming: Partial<Record<TimelineInferenceProgress["stage"], number>>;
  tags: InterestTag[];
  pass: boolean;
  score: number;
  checks: {
    required: { needle: string; hit: string | null }[];
    forbidden: { needle: string; hit: string | null }[];
    anyOf: { group: string[]; hit: string | null }[];
    tagCount: { actual: number; min?: number; max?: number; ok: boolean };
    signalPosts: { actual: number; min?: number; ok: boolean };
  };
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
  npm run bench:timeline                              # manifest 全部 case
  npm run bench:timeline -- --case multi-theme-user   # 单个 case
  npm run bench:timeline -- posts.txt                 # 单文件
  npm run bench:timeline -- --verbose                 # 打印三阶段明细
  npm run bench:timeline -- --json                    # JSON 输出`);
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

function findMatchingTag(needle: string, tags: InterestTag[]): string | null {
  return tags.find((tag) => tagMatches(needle, tag.name))?.name ?? null;
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
  tags: InterestTag[],
  signalPosts: number,
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
        signalPosts: { actual: signalPosts, ok: true },
      },
    };
  }

  const required = expect.required ?? [];
  const forbidden = expect.forbidden ?? [];
  const anyOf = expect.anyOf ?? [];
  const minTags = expect.minTags;
  const maxTags = expect.maxTags;
  const minSignalPosts = expect.minSignalPosts;

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

  const signalPostsOk = minSignalPosts === undefined || signalPosts >= minSignalPosts;

  const requiredOk = requiredChecks.every((item) => item.hit !== null);
  const forbiddenOk = forbiddenChecks.every((item) => item.hit === null);
  const anyOfOk = anyOfChecks.every((item) => item.hit !== null);

  const totalChecks =
    required.length +
    forbidden.length +
    anyOf.length +
    (minTags !== undefined || maxTags !== undefined ? 1 : 0) +
    (minSignalPosts !== undefined ? 1 : 0);
  const passedChecks =
    requiredChecks.filter((item) => item.hit).length +
    forbiddenChecks.filter((item) => !item.hit).length +
    anyOfChecks.filter((item) => item.hit).length +
    (tagCountOk ? 1 : 0) +
    (signalPostsOk ? 1 : 0);

  const score = totalChecks === 0 ? 1 : passedChecks / totalChecks;
  const pass = requiredOk && forbiddenOk && anyOfOk && tagCountOk && signalPostsOk;

  return {
    pass,
    score,
    checks: {
      required: requiredChecks,
      forbidden: forbiddenChecks,
      anyOf: anyOfChecks,
      tagCount: { actual: tags.length, min: minTags, max: maxTags, ok: tagCountOk },
      signalPosts: { actual: signalPosts, min: minSignalPosts, ok: signalPostsOk },
    },
  };
}

function formatRelative(iso: string): string {
  const rel = isoToRelative(iso);
  const unitMap: Record<string, string> = { hours: "h", days: "d", weeks: "w", months: "m" };
  return `@${rel.amount}${unitMap[rel.unit] ?? "d"}`;
}

function printTagTable(tags: InterestTag[]) {
  if (tags.length === 0) {
    console.log("  (无标签)");
    return;
  }

  const nameWidth = Math.max(4, ...tags.map((t) => [...t.name].length));
  console.log(
    `  ${"标签".padEnd(nameWidth)}  frequency  sentiment  recency   weight  entries`,
  );
  console.log(`  ${"─".repeat(nameWidth + 52)}`);

  for (const tag of tags) {
    const name = tag.name.padEnd(nameWidth);
    console.log(
      `  ${name}  ${tag.frequency.toFixed(3).padStart(9)}  ${tag.sentiment.toFixed(3).padStart(9)}  ${tag.recency.toFixed(3).padStart(7)}  ${tag.weight.toFixed(3).padStart(6)}  ${String(tag.postCount ?? 0).padStart(7)}`,
    );
  }
}

function printWordCloud(tags: InterestTag[]) {
  if (tags.length === 0) {
    console.log("  (空词云)");
    return;
  }

  const weights = tags.map((t) => t.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const barMax = 16;

  for (const tag of tags) {
    const norm = (tag.weight - minW) / range;
    const bars = Math.max(1, Math.round(norm * barMax));
    const bar = "█".repeat(bars) + "░".repeat(barMax - bars);
    console.log(`  ${tag.name.padEnd(8)} ${bar} ${tag.weight.toFixed(3)}`);
  }
}

function printPipelineDetail(
  result: Awaited<ReturnType<typeof runTimelineInference>>,
  verbose: boolean,
) {
  const { timelineResult, stageTiming } = result;
  const signal = timelineResult.preprocessed.filter((p) => !p.isNoise);
  const noise = timelineResult.preprocessed.filter((p) => p.isNoise);

  console.log(`\n── 思维链路 ──`);
  console.log(`  原始帖 ${timelineResult.preprocessed.length} → 有效 ${signal.length} / 噪音 ${noise.length}`);
  console.log(`  时间线条目 ${timelineResult.timeline.length} → 标签 ${timelineResult.tags.length}`);

  if (verbose) {
    console.log(`\n── 阶段 1：预处理 ──`);
    for (const post of timelineResult.preprocessed) {
      const rel = formatRelative(post.createdAt);
      if (post.isNoise) {
        console.log(`  [噪音] ${rel}`);
        continue;
      }
      console.log(`  ${rel} ${post.summary.slice(0, 80)}`);
    }

    console.log(`\n── 阶段 2：时间线合并 ──`);
    for (const entry of timelineResult.timeline) {
      const rel = formatRelative(entry.createdAt);
      const merged =
        entry.sourcePostIds.length > 1 ? ` (合并 ${entry.sourcePostIds.length} 帖)` : "";
      console.log(`  [${entry.id}] ${rel}${merged}`);
      console.log(`    ${entry.summary.slice(0, 100)}`);
    }

    console.log(`\n── 阶段 3：标签归因 ──`);
    for (const tag of timelineResult.tags) {
      console.log(
        `  ${tag.name} (sentiment ${tag.sentiment.toFixed(2)}) → ${tag.entryIds.join(", ")}`,
      );
    }
  }

  const timingParts = (["preprocess", "merge", "extract"] as const)
    .filter((stage) => stageTiming[stage] !== undefined)
    .map((stage) => `${STAGE_LABELS[stage]} ${stageTiming[stage]}ms`);
  if (timingParts.length > 0) {
    console.log(`\n── 耗时 ── ${timingParts.join(" · ")} · 总计 ${result.wallMs}ms`);
  }
}

async function runWithModel(posts: PostRecord[], model: string, verbose: boolean) {
  const prevModel = process.env.OPENROUTER_LLM_MODEL;
  process.env.OPENROUTER_LLM_MODEL = model;

  try {
    const result = await runTimelineInference(posts, {
      onProgress: verbose
        ? (progress) => {
            process.stdout.write(
              `    ${STAGE_LABELS[progress.stage]} ${progress.done}/${progress.total}\n`,
            );
          }
        : undefined,
    });

    return result;
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

  console.log(`文件: ${postsPath}`);
  console.log(`帖子: ${posts.length} · 模型: ${model}`);
  console.log(`流程: 方案 C — 预处理 → 时间线合并 → 标签提取 → 权重聚合\n`);

  const result = await runWithModel(posts, model, verbose);
  printPipelineDetail(result, verbose);

  console.log(`\n── 标签权重明细 ──`);
  printTagTable(result.inferredTags);

  console.log(`\n── 词云预览（batch 内相对大小）──`);
  printWordCloud(result.inferredTags);
}

function printCaseResult(result: CaseEvalResult, verbose: boolean) {
  const mark = result.pass ? "✓" : "✗";
  console.log(`\n${mark} ${result.id} — ${result.description}`);
  console.log(
    `  ${result.model} · ${result.postCount} 帖 · 有效 ${result.signalPosts} · 时间线 ${result.timelineEntries} · ${result.wallMs}ms · ${result.tags.length} 标签 · 得分 ${(result.score * 100).toFixed(0)}%`,
  );
  if (result.error) {
    console.log(`  错误: ${result.error}`);
    return;
  }

  console.log(`\n── 标签权重明细 ──`);
  printTagTable(result.tags);

  console.log(`\n── 词云预览（batch 内相对大小）──`);
  printWordCloud(result.tags);

  const { checks } = result;
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
  if (checks.signalPosts.min !== undefined) {
    console.log(
      `  有效帖 ${checks.signalPosts.actual} (期望 ≥${checks.signalPosts.min}): ${checks.signalPosts.ok ? "✓" : "✗"}`,
    );
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
  console.log("流程: 方案 C — 预处理 → 时间线合并 → 标签提取 → aggregateTagsFromTimeline\n");

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
        const pipeline = await runWithModel(posts, model, options.verbose);
        const signalPosts = pipeline.timelineResult.preprocessed.filter((p) => !p.isNoise).length;
        const evalResult = evaluateCase(
          pipeline.inferredTags,
          signalPosts,
          caseDef.expect,
        );
        results.push({
          ...base,
          signalPosts,
          noisePosts: pipeline.timelineResult.preprocessed.length - signalPosts,
          timelineEntries: pipeline.timelineResult.timeline.length,
          wallMs: pipeline.wallMs,
          stageTiming: pipeline.stageTiming,
          tags: pipeline.inferredTags,
          ...evalResult,
        });
      } catch (err) {
        results.push({
          ...base,
          signalPosts: 0,
          noisePosts: 0,
          timelineEntries: 0,
          wallMs: 0,
          stageTiming: {},
          tags: [],
          pass: false,
          score: 0,
          checks: {
            required: [],
            forbidden: [],
            anyOf: [],
            tagCount: { actual: 0, ok: false },
            signalPosts: { actual: 0, ok: false },
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
