import { createPostRecord, isoToRelative, relativeToIso, type RelativeTimeUnit } from "./postUtils";
import type { PostRecord } from "./types";

/** roadmate-posts txt schema 版本 */
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
  小时: "hours",
  d: "days",
  day: "days",
  days: "days",
  天: "days",
  w: "weeks",
  week: "weeks",
  weeks: "weeks",
  周: "weeks",
  m: "months",
  month: "months",
  months: "months",
  月: "months",
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

/** 解析 roadmate-posts/1 格式 txt */
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
      warnings.push(`第 ${lineNo} 行附近：帖子正文为空，已跳过`);
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
      errors.push(`第 ${lineNo} 行：缺少 @时间 头（如 @3d、@6h），正文不能以 @ 以外内容开头`);
      continue;
    }

    bodyLines.push(rawLine);
  }

  flush();

  if (posts.length === 0 && errors.length === 0) {
    errors.push("未解析到任何帖子，请检查格式是否符合 roadmate-posts/1");
  }

  return { posts, errors, warnings };
}

/** 将帖子列表序列化为 roadmate-posts/1 txt */
export function serializePostsToTxt(posts: PostRecord[]): string {
  const lines: string[] = [
    `# ${POSTS_TXT_SCHEMA}`,
    "# 每帖一行 @<数量><单位>，随后为正文（可多行）；下一条 @ 开头为新帖",
    "# 单位: h=小时 d=天 w=周 m=月（也支持 @3 days、@2 周 等写法）",
    "# 以 # 开头的行为注释，空行忽略",
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

/** 导出文件名：roadmate-posts-YYYYMMDD-HHmmss.txt（本地时间） */
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
