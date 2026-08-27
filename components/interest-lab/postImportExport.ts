import {
  createPostRecord,
  isoToRelative,
  relativeToIso,
  sortPostsByCreatedAtDesc,
  type RelativeTimeUnit,
} from "./postUtils";
import type { PostRecord } from "./types";

/** roadmate-posts txt schema version */
export const POSTS_TXT_SCHEMA = "roadmate-posts/1";

const UNIT_CHAR: Record<RelativeTimeUnit, string> = {
  hours: "h",
  days: "d",
  weeks: "w",
  months: "m",
};

const CHAR_TO_UNIT: Record<string, RelativeTimeUnit> = {
  h: "hours",
  d: "days",
  w: "weeks",
  m: "months",
};

const WORD_TO_UNIT: Record<string, RelativeTimeUnit> = {
  h: "hours",
  hour: "hours",
  hours: "hours",
  d: "days",
  day: "days",
  days: "days",
  w: "weeks",
  week: "weeks",
  weeks: "weeks",
  m: "months",
  month: "months",
  months: "months",
};

const COMPACT_HEADER_RE = /^@\s*(\d+)\s*([hdwm])\s*$/i;
const WORD_HEADER_RE = /^@\s*(\d+)\s*(\S+)\s*$/;

function parseTimeHeader(line: string): { amount: number; unit: RelativeTimeUnit } | null {
  const compact = line.match(COMPACT_HEADER_RE);
  if (compact) {
    const unit = CHAR_TO_UNIT[compact[2].toLowerCase()];
    if (!unit) return null;
    return { amount: Number.parseInt(compact[1], 10), unit };
  }

  const word = line.match(WORD_HEADER_RE);
  if (!word) return null;

  const unit = WORD_TO_UNIT[word[2].toLowerCase()];
  if (!unit) return null;
  return { amount: Number.parseInt(word[1], 10), unit };
}

function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

export interface ParsePostsTxtResult {
  posts: PostRecord[];
  errors: string[];
  warnings: string[];
}

/** Parse roadmate-posts/1 format txt */
export function parsePostsFromTxt(content: string): ParsePostsTxtResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const posts: PostRecord[] = [];

  let currentTime: { amount: number; unit: RelativeTimeUnit } | null = null;
  let bodyLines: string[] = [];
  let lineNo = 0;

  const flush = () => {
    if (!currentTime) return;
    const text = bodyLines.join("\n").trim();
    if (!text) {
      warnings.push(`Near line ${lineNo}: post body is empty, skipped`);
    } else {
      posts.push(createPostRecord(text, relativeToIso(currentTime.amount, currentTime.unit)));
    }
    bodyLines = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    lineNo += 1;
    const line = rawLine.trimEnd();

    if (isCommentOrBlank(line)) continue;

    const header = parseTimeHeader(line.trim());
    if (header) {
      flush();
      currentTime = header;
      continue;
    }

    if (!currentTime) {
      errors.push(
        `Line ${lineNo}: missing @time header (e.g. @3d, @6h); body cannot start with content other than @`,
      );
      continue;
    }

    bodyLines.push(rawLine);
  }

  flush();

  if (posts.length === 0 && errors.length === 0) {
    errors.push("No posts parsed; check that the format matches roadmate-posts/1");
  }

  return { posts: sortPostsByCreatedAtDesc(posts), errors, warnings };
}

/** Serialize a post list to roadmate-posts/1 txt */
export function serializePostsToTxt(posts: PostRecord[]): string {
  const lines: string[] = [
    `# ${POSTS_TXT_SCHEMA}`,
    "# Each post starts with one line @<amount><unit>, then the body (may be multi-line); the next @ starts a new post",
    "# Units: h=hours d=days w=weeks m=months (also supports @3 days, @2 weeks, etc.)",
    "# Lines starting with # are comments; blank lines are ignored",
    "",
  ];

  for (const post of posts) {
    if (!post.text.trim()) continue;
    const { amount, unit } = isoToRelative(post.createdAt);
    lines.push(`@${amount}${UNIT_CHAR[unit]}`);
    lines.push(post.text.trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** Export filename: roadmate-posts-YYYYMMDD-HHmmss.txt (local time) */
export function buildPostsExportFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `roadmate-posts-${date}-${time}.txt`;
}

export function downloadPostsTxt(posts: PostRecord[], filename?: string): void {
  const blob = new Blob([serializePostsToTxt(posts)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? buildPostsExportFilename();
  anchor.click();
  URL.revokeObjectURL(url);
}
