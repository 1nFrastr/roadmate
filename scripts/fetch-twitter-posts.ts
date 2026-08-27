/**
 * Test twitterapi.io last_tweets direct call and save as roadmate-posts/1 format.
 *
 * Usage:
 *   npm run fetch:twitter -- --user jack
 *   npm run fetch:twitter -- --user jack --out scripts/output/jack.posts.txt
 *   npm run fetch:twitter -- jack
 *
 * Requires TWITTER_API_KEY in .env.local.
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
    throw new Error("Missing .env.local — please set TWITTER_API_KEY");
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
  console.log(`Usage: npm run fetch:twitter -- --user <handle> [--out <path>]

Options:
  --user   X username (optional @)
  --out    Output .posts.txt path (default scripts/output/twitter-<handle>-<timestamp>.posts.txt)

Examples:
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
    throw new Error("TWITTER_API_KEY is not configured in .env.local");
  }

  const handle = user.replace(/^@/, "").trim();
  console.log(`Fetching @${handle} … (single API call, includes RT/quotes, excludes replies)`);

  const started = Date.now();
  const { tweets, truncated } = await fetchUserTweetsDirect(handle, apiKey);
  const elapsed = Date.now() - started;

  const posts = tweetsToPosts(tweets);
  const withQuote = tweets.filter((t) => t.text.includes("\n\n[Quote]\n")).length;
  const outPath = outArg ?? defaultOutPath(handle);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serializePostsToTxt(posts), "utf8");

  console.log("");
  console.log(`✓ API call succeeded (${elapsed}ms)`);
  console.log(`  Posts: ${posts.length}${truncated ? " (more may exist; no pagination)" : ""}`);
  console.log(`  With quote expansion: ${withQuote}`);
  console.log(`  Saved: ${outPath}`);
  console.log("");
  console.log("First 3 post previews:");
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
