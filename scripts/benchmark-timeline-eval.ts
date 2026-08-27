/**
 * Scheme C timeline inference eval — three-stage pipeline benchmark.
 *
 * Flow:
 *   parsePostsFromTxt → inferTagsFromTimeline(preprocess/merge/extract)
 *   → aggregateTagsFromTimeline(frequency/sentiment/recency weights)
 *
 * Usage:
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
  preprocess: "Stage 1 preprocess",
  merge: "Stage 2 timeline merge",
  extract: "Stage 3 tag extract",
};

interface CaseExpect {
  required?: string[];
  forbidden?: string[];
  anyOf?: string[][];
  minTags?: number;
  maxTags?: number;
  /** Min signal posts remaining after preprocess */
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
    throw new Error("Missing .env.local — please set OPENROUTER_API_KEY");
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
      console.log(`Usage:
  npm run bench:timeline                              # all manifest cases
  npm run bench:timeline -- --case multi-theme-user   # single case
  npm run bench:timeline -- posts.txt                 # single file
  npm run bench:timeline -- --verbose                 # print three-stage details
  npm run bench:timeline -- --json                    # JSON output`);
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
    throw new Error(`Manifest not found: ${manifestPath}`);
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
    throw new Error(`case ${caseDef.id} missing posts or postsFile`);
  }

  const { posts, errors } = parsePostsFromTxt(raw);
  if (errors.length > 0) {
    throw new Error(`case ${caseDef.id} failed to parse posts:\n${errors.join("\n")}`);
  }
  if (posts.length === 0) {
    throw new Error(`case ${caseDef.id} posts are empty`);
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
    console.log("  (no tags)");
    return;
  }

  const nameWidth = Math.max(4, ...tags.map((t) => [...t.name].length));
  console.log(
    `  ${"tag".padEnd(nameWidth)}  frequency  sentiment  recency   weight  entries`,
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
    console.log("  (empty word cloud)");
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

  console.log(`\n── Reasoning chain ──`);
  console.log(`  raw posts ${timelineResult.preprocessed.length} → signal ${signal.length} / noise ${noise.length}`);
  console.log(`  timeline entries ${timelineResult.timeline.length} → tags ${timelineResult.tags.length}`);

  if (verbose) {
    console.log(`\n── Stage 1: preprocess ──`);
    for (const post of timelineResult.preprocessed) {
      const rel = formatRelative(post.createdAt);
      if (post.isNoise) {
        console.log(`  [noise] ${rel}`);
        continue;
      }
      console.log(`  ${rel} ${post.summary.slice(0, 80)}`);
    }

    console.log(`\n── Stage 2: timeline merge ──`);
    for (const entry of timelineResult.timeline) {
      const rel = formatRelative(entry.createdAt);
      const merged =
        entry.sourcePostIds.length > 1 ? ` (merged ${entry.sourcePostIds.length} posts)` : "";
      console.log(`  [${entry.id}] ${rel}${merged}`);
      console.log(`    ${entry.summary.slice(0, 100)}`);
    }

    console.log(`\n── Stage 3: tag attribution ──`);
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
    console.log(`\n── Timing ── ${timingParts.join(" · ")} · total ${result.wallMs}ms`);
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
    throw new Error(`Failed to parse posts:\n${errors.join("\n")}`);
  }

  console.log(`File: ${postsPath}`);
  console.log(`Posts: ${posts.length} · model: ${model}`);
  console.log(`Flow: Scheme C — preprocess → timeline merge → tag extract → weight aggregate\n`);

  const result = await runWithModel(posts, model, verbose);
  printPipelineDetail(result, verbose);

  console.log(`\n── Tag weight details ──`);
  printTagTable(result.inferredTags);

  console.log(`\n── Word-cloud preview (relative size within batch) ──`);
  printWordCloud(result.inferredTags);
}

function printCaseResult(result: CaseEvalResult, verbose: boolean) {
  const mark = result.pass ? "✓" : "✗";
  console.log(`\n${mark} ${result.id} — ${result.description}`);
  console.log(
    `  ${result.model} · ${result.postCount} posts · signal ${result.signalPosts} · timeline ${result.timelineEntries} · ${result.wallMs}ms · ${result.tags.length} tags · score ${(result.score * 100).toFixed(0)}%`,
  );
  if (result.error) {
    console.log(`  Error: ${result.error}`);
    return;
  }

  console.log(`\n── Tag weight details ──`);
  printTagTable(result.tags);

  console.log(`\n── Word-cloud preview (relative size within batch) ──`);
  printWordCloud(result.tags);

  const { checks } = result;
  for (const item of checks.anyOf) {
    const status = item.hit ? `✓ → ${item.hit}` : `✗ miss (${item.group.join("|")})`;
    console.log(`  Theme group ${item.group.slice(0, 3).join("|")}${item.group.length > 3 ? "…" : ""}: ${status}`);
  }
  for (const item of checks.required) {
    const status = item.hit ? `✓ → ${item.hit}` : "✗ miss";
    console.log(`  Required "${item.needle}": ${status}`);
  }
  for (const item of checks.forbidden) {
    const status = item.hit ? `✗ violation → ${item.hit}` : "✓ absent";
    console.log(`  Forbidden "${item.needle}": ${status}`);
  }
  if (checks.tagCount.min !== undefined || checks.tagCount.max !== undefined) {
    const range = `${checks.tagCount.min ?? 0}~${checks.tagCount.max ?? "∞"}`;
    console.log(`  Tag count ${checks.tagCount.actual} (expected ${range}): ${checks.tagCount.ok ? "✓" : "✗"}`);
  }
  if (checks.signalPosts.min !== undefined) {
    console.log(
      `  Signal posts ${checks.signalPosts.actual} (expected ≥${checks.signalPosts.min}): ${checks.signalPosts.ok ? "✓" : "✗"}`,
    );
  }
}

function printSummary(results: CaseEvalResult[]) {
  const passed = results.filter((r) => r.pass && !r.error).length;
  const failed = results.filter((r) => !r.pass && !r.error).length;
  const errored = results.filter((r) => r.error).length;
  const avgScore =
    results.length === 0 ? 0 : results.reduce((sum, r) => sum + r.score, 0) / results.length;

  console.log("\n=== Summary ===");
  console.log(`Passed ${passed} · failed ${failed} · errored ${errored} · avg score ${(avgScore * 100).toFixed(0)}%`);
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
      throw new Error(`Case not found: ${options.caseFilter}`);
    }
  }

  console.log(`Eval directory: ${options.casesDir}`);
  console.log(`schema: ${manifest.schema ?? "(unspecified)"}`);
  console.log(`Cases: ${cases.length} · models: ${options.models.join(", ")}`);
  console.log("Flow: Scheme C — preprocess → timeline merge → tag extract → aggregateTagsFromTimeline\n");

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
          console.log(`\n--- ${caseDef.id} (${posts.length} posts) ---`);
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
    throw new Error("OPENROUTER_API_KEY is not configured");
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
