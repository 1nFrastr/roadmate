export const STORAGE_KEYS = {
  apiKeys: "roadmate:interest-lab:api-keys",
  profiles: "roadmate:interest-lab:profiles",
  settings: "roadmate:interest-lab:settings",
} as const;

export const DEFAULT_LLM_MODEL = "minimax/minimax-m3";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export const TWITTER_API_BASE = "https://api.twitterapi.io";
export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export const WEIGHT_FACTORS = {
  frequency: 0.4,
  sentiment: 0.2,
  recency: 0.4,
} as const;

export const MAX_TWEET_PAGES = 3;

/** 每帖 LLM 最多提取标签数 */
export const MAX_TAGS_PER_POST = 3;

/** 并发 LLM 请求上限 */
export const LLM_CONCURRENCY = 6;

/** 最终保留的推断标签上限 */
export const MAX_INFERRED_TAGS = 20;

/** 至少出现在多少帖才保留（custom 不受限） */
export const MIN_TAG_POST_COUNT = 1;

/** recency 指数衰减 λ（每天）；0.08 → 约 30 天降至 0.09，90 天降至 0.001 */
export const RECENCY_DECAY_LAMBDA = 0.08;

/** 超过此天数未出现且 postCount=1 的标签淘汰 */
export const STALE_TAG_DAYS = 60;
