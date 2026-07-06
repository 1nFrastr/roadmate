import { normalizeTagKey } from "./postUtils";
import type { PostTagDraft } from "./types";

/** 过宽大类 / 性格推断 / 对近场匹配无意义的标签 */
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
  ].map(normalizeTagKey),
);

export function isGenericTag(name: string): boolean {
  const key = normalizeTagKey(name);
  if (!key) return true;
  return GENERIC_TAG_DENYLIST.has(key);
}

export function filterPostTagDrafts(tags: PostTagDraft[]): PostTagDraft[] {
  return tags.filter((tag) => tag.name.trim() && !isGenericTag(tag.name));
}
