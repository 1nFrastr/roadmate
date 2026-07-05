export const STORAGE_KEYS = {
  apiKeys: "roadmate:interest-lab:api-keys",
  profiles: "roadmate:interest-lab:profiles",
  settings: "roadmate:interest-lab:settings",
} as const;

export const DEFAULT_LLM_MODEL = "minimax/minimax-m3";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export const TWITTER_API_BASE = "https://api.twitterapi.io";
/** 浏览器经 Next 代理访问（twitterapi.io 无 CORS） */
export const TWITTER_PROXY_PATH = "/api/interest-lab/twitter/last-tweets";
export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export const WEIGHT_FACTORS = {
  frequency: 0.4,
  sentiment: 0.2,
  recency: 0.4,
} as const;

/** last_tweets 每页 API 上限（twitterapi.io 文档：每页最多 20 条） */
export const TWITTER_TWEETS_PER_PAGE = 20;

/** 单次拉取 API 请求次数（1 = 测试时只打 1 次，约 20 条） */
export const MAX_TWEET_PAGES = 1;

/** 单次拉取最多帖子数（原创，不含转推；= 页数 × 每页上限） */
export const MAX_TWEETS_FETCH = MAX_TWEET_PAGES * TWITTER_TWEETS_PER_PAGE;

/** 分页请求间隔；免费 Key 约 0.2 QPS，需 ≥5s */
export const TWITTER_PAGE_DELAY_MS = 5_000;

/** 429/503 等可重试状态的最大重试次数 */
export const TWITTER_FETCH_MAX_RETRIES = 4;

/** 指数退避上限（毫秒） */
export const TWITTER_RETRY_MAX_DELAY_MS = 30_000;

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
