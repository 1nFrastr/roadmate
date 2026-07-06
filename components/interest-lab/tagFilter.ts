import { MAX_TAG_NAME_LENGTH } from "./constants";
import { canonicalTagName } from "./tagCanonical";
import { normalizeTagKey } from "./postUtils";
import type { PostTagDraft } from "./types";

export function tagNameLength(name: string): number {
  return [...name.trim()].length;
}

export function isTagNameTooLong(name: string): boolean {
  return tagNameLength(name) > MAX_TAG_NAME_LENGTH;
}

/** 过宽大类 / 性格推断 / 产品功能名 / 无法体现公共上下文的标签 */
const GENERIC_TAG_DENYLIST = new Set(
  [
    // 中文 — 生活大类
    "生活",
    "日常",
    "工作",
    "职场",
    "学习",
    "科技",
    "技术",
    "编程",
    "代码",
    "音乐",
    "旅行",
    "旅游",
    "出行",
    "分享",
    "社交",
    "情感",
    "思考",
    "深度思考",
    "正能量",
    "积极",
    "娱乐",
    "电影",
    "影视",
    "美食",
    "运动",
    "健身",
    "健康",
    "时尚",
    "艺术",
    "文化",
    "阅读",
    "游戏",
    "理财",
    "投资",
    "创业",
    "家庭",
    "爱情",
    "心情",
    "感悟",
    "人生",
    "世界",
    "社会",
    "新闻",
    "时事",
    "互联网",
    "数码",
    "摄影",
    "设计",
    "人工智能",
    "ai",
    // 情绪 / 性格 / 心态
    "内耗",
    "自我攻击",
    "不配得感",
    "躺平",
    "躺平哲学",
    "面试焦虑",
    "工作心态",
    "主动学习",
    "爱情长跑",
    "录像带",
    "沉浸式学习",
    "发散思考",
    "普通平和",
    "重考高考",
    "创造性思考",
    "规划调研",
    "架构思路",
    // 产品功能 / 元标签（来自产品构想帖误提取）
    "近场社交",
    "搭子匹配",
    "设备碰一碰",
    "社媒聚合",
    "社媒轨迹",
    "社媒主页",
    "数字身份",
    "路友",
    "线下搭子",
    "线下社交",
    "ai画像",
    "主动录入",
    // 英文
    "life",
    "daily",
    "work",
    "study",
    "learning",
    "tech",
    "technology",
    "music",
    "travel",
    "social",
    "sharing",
    "thinking",
    "entertainment",
    "movie",
    "movies",
    "food",
    "sports",
    "fitness",
    "fashion",
    "art",
    "culture",
    "reading",
    "gaming",
    "games",
    "coding",
    "programming",
    "news",
    "roadmate",
    "road mate",
  ].map(normalizeTagKey),
);

export function isGenericTag(name: string): boolean {
  const key = normalizeTagKey(name);
  if (!key) return true;
  return GENERIC_TAG_DENYLIST.has(key);
}

export function filterPostTagDrafts(tags: PostTagDraft[]): PostTagDraft[] {
  const seen = new Set<string>();
  const result: PostTagDraft[] = [];

  for (const tag of tags) {
    const name = canonicalTagName(tag.name);
    if (!name || isGenericTag(name) || isTagNameTooLong(name)) continue;

    const key = normalizeTagKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ name, sentiment: tag.sentiment });
  }

  return result;
}
