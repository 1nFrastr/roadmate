export const STORAGE_KEYS = {
  profiles: "roadmate:interest-lab:profiles",
} as const;

export const DEFAULT_LLM_MODEL = "deepseek/deepseek-v4-flash";
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

/** 标签名最大字数（词云 chip + 破冰话题宜短） */
export const MAX_TAG_NAME_LENGTH = 6;

/** 逐帖提取 temperature（0 = 最大稳定性） */
export const LLM_EXTRACT_TEMPERATURE = 0;

/** 标签精炼 temperature */
export const LLM_REFINE_TEMPERATURE = 0;

/** OpenRouter seed（部分模型支持，不支持时忽略） */
export const LLM_SEED = 42;

/**
 * 结构化 JSON 提取不需要 thinking；DeepSeek V4 Flash 默认开 reasoning 会显著变慢，
 * 且 max_tokens 会先被思考占满导致 content 为空。OpenRouter: reasoning.effort = "none"
 */
export const LLM_REASONING_EFFORT = "none" as const;

/** 语料滚动推断 max_tokens（关闭 reasoning 后 800 足够） */
export const LLM_CORPUS_MAX_TOKENS = 800;

/** 标签精炼 max_tokens */
export const LLM_REFINE_MAX_TOKENS = 400;

/** 语料分批：每批最多帖数 */
export const CORPUS_BATCH_MAX_POSTS = 5;

/** 语料分批：每批帖子正文总字符上限 */
export const CORPUS_BATCH_MAX_CHARS = 8000;

/** 滚动压缩 summary 最大字数 */
export const CORPUS_SUMMARY_MAX_CHARS = 220;

/** 语料推断最终标签上限（滚动累积输出） */
export const MAX_CORPUS_TAGS = 12;

/** 并发 LLM 请求上限（单次最多约 20 帖，12 并发 ≈ 两轮跑完） */
export const LLM_CONCURRENCY = 12;

/** 最终保留的推断标签上限 */
export const MAX_INFERRED_TAGS = 20;

/** 至少出现在多少帖才保留（custom 不受限）；逐帖提取下标签重复率低，保持 1 */
export const MIN_TAG_POST_COUNT = 1;

/** 仅出现 1 帖时，sentiment 低于此值的标签丢弃（过滤顺带提及） */
export const MIN_SINGLE_POST_SENTIMENT = 0.45;

/** profile 级精炼后最多保留的推断标签数 */
export const MAX_REFINED_TAGS = 12;

/** recency 指数衰减 λ（每天）；0.08 → 约 30 天降至 0.09，90 天降至 0.001 */
export const RECENCY_DECAY_LAMBDA = 0.08;

/** 超过此天数未出现且 postCount=1 的标签淘汰 */
export const STALE_TAG_DAYS = 60;
