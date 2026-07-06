/**
 * 同一帖子集连续跑 N 次语料滚动推断，对比结果是否一致。
 *
 * 用法:
 *   npx tsx scripts/benchmark-tag-stability.ts
 *   npx tsx scripts/benchmark-tag-stability.ts /path/to/roadmate-posts.txt 3
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePostsFromTxt } from "../components/interest-lab/postImportExport";
import { runHomepageInference } from "./lib/homepageInferencePipeline";
import type { PostRecord } from "../components/interest-lab/types";

const DEFAULT_POSTS_PATH = resolve(process.cwd(), "scripts/fixtures/roadmate-posts.txt");

function loadEnvFromLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function runOnce(posts: PostRecord[]) {
  const result = await runHomepageInference(posts, { priorState: null });
  return result.inferredTags.map((tag) => tag.name);
}

async function main() {
  loadEnvFromLocal();
  const postsPath = process.argv[2] ?? DEFAULT_POSTS_PATH;
  const runs = Math.max(2, Number.parseInt(process.argv[3] ?? "3", 10) || 3);
  const raw = readFileSync(postsPath, "utf8");
  const { posts, errors } = parsePostsFromTxt(raw);
  if (errors.length > 0) {
    console.warn("解析警告:", errors.join("; "));
  }

  console.log(`帖子 ${posts.length} 条 · 语料滚动推断 × ${runs}\n`);

  const allRuns: string[][] = [];
  for (let i = 0; i < runs; i += 1) {
    const tags = await runOnce(posts);
    allRuns.push(tags);
    console.log(`Run ${i + 1}: ${tags.length} 标签 → ${tags.join(" · ") || "(空)"}`);
  }

  const baseline = allRuns[0]?.join("|") ?? "";
  const stable = allRuns.every((tags) => tags.join("|") === baseline);
  console.log(stable ? "\n✓ 结果完全一致" : "\n✗ 存在差异");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
