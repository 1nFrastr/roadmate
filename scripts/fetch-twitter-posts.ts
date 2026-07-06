/**
 * 测试 twitterapi.io last_tweets 直连，并保存为 roadmate-posts/1 格式。
 *
 * 用法:
 *   npm run fetch:twitter -- --user jack
 *   npm run fetch:twitter -- --user jack --out scripts/output/jack.posts.txt
 *   npm run fetch:twitter -- jack
 *
 * 依赖 .env.local 中的 TWITTER_API_KEY。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fetchUserTweetsDirect } from "../components/interest-lab/api/twitter";
import { serializePostsToTxt } from "../components/interest-lab/postImportExport";
import { tweetsToPosts } from "../components/interest-lab/postUtils";

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), "scripts/output");

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  let content: string;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    throw new Error("未找到 .env.local，请配置 TWITTER_API_KEY");
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
  let user: string | null = null;
  let outPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--user" && argv[i + 1]) {
      user = argv[i + 1]!;
      i += 1;
      continue;
    }
    if (arg === "--out" && argv[i + 1]) {
      outPath = resolve(argv[i + 1]!);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (!arg.startsWith("-") && !user) {
      user = arg;
      continue;
    }
  }

  return { user, outPath };
}

function printHelp(): void {
  console.log(`用法: npm run fetch:twitter -- --user <handle> [--out <path>]

选项:
  --user   X 用户名（可带 @）
  --out    输出 .posts.txt 路径（默认 scripts/output/twitter-<handle>-<时间>.posts.txt）

示例:
  npm run fetch:twitter -- --user elonmusk
  npm run fetch:twitter -- elonmusk --out scripts/fixtures/corpus-cases/elon.posts.txt
`);
}

function defaultOutPath(handle: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return resolve(DEFAULT_OUTPUT_DIR, `twitter-${handle}-${stamp}.posts.txt`);
}

async function main(): Promise<void> {
  const { user, outPath: outArg } = parseArgs(process.argv.slice(2));
  if (!user) {
    printHelp();
    process.exit(1);
  }

  loadEnvLocal();
  const apiKey = process.env.TWITTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(".env.local 中未配置 TWITTER_API_KEY");
  }

  const handle = user.replace(/^@/, "").trim();
  console.log(`拉取 @${handle} …（单次 API，含 RT/引用，不含回复）`);

  const started = Date.now();
  const { tweets, truncated } = await fetchUserTweetsDirect(handle, apiKey);
  const elapsed = Date.now() - started;

  const posts = tweetsToPosts(tweets);
  const withQuote = tweets.filter((t) => t.text.includes("\n\n[引用]\n")).length;
  const outPath = outArg ?? defaultOutPath(handle);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serializePostsToTxt(posts), "utf8");

  console.log("");
  console.log(`✓ API 调用成功 (${elapsed}ms)`);
  console.log(`  帖子数: ${posts.length}${truncated ? "（可能还有更多，未翻页）" : ""}`);
  console.log(`  含引用展开: ${withQuote} 条`);
  console.log(`  已保存: ${outPath}`);
  console.log("");
  console.log("前 3 条预览:");
  for (const post of posts.slice(0, 3)) {
    const preview = post.text.replace(/\s+/g, " ").slice(0, 120);
    console.log(`  · ${preview}${post.text.length > 120 ? "…" : ""}`);
  }
}

main().catch((err) => {
  console.error("");
  console.error("✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
