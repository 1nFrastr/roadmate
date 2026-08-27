export const STORAGE_KEYS = {
  profiles: "roadmate:interest-lab:profiles",
  draft: "roadmate:interest-lab:draft",
} as const;

export { DEFAULT_LLM_MODEL } from "./llmModels";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export const TWITTER_API_BASE = "https://api.twitterapi.io";
/** Browser access via Next proxy (twitterapi.io has no CORS) */
export const TWITTER_PROXY_PATH = "/api/interest-lab/twitter/last-tweets";
/** Next.js Data Cache revalidate (seconds) for the same X username fetch result */
export const TWITTER_CACHE_REVALIDATE_SEC = 60 * 60;
export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export const WEIGHT_FACTORS = {
  frequency: 0.4,
  sentiment: 0.2,
  recency: 0.4,
} as const;

/** last_tweets per-page API limit (twitterapi.io docs: max 20 per page) */
export const TWITTER_TWEETS_PER_PAGE = 20;

/** Max API page requests per fetch (1 = one request for testing, ~20 tweets) */
export const MAX_TWEET_PAGES = 1;

/** Max tweets per fetch (includes RTs/quotes, excludes replies; = pages × per-page limit) */
export const MAX_TWEETS_FETCH = MAX_TWEET_PAGES * TWITTER_TWEETS_PER_PAGE;

/** Delay between page requests; free keys are ~0.2 QPS, so ≥5s */
export const TWITTER_PAGE_DELAY_MS = 5_000;

/** Max retries for retryable statuses like 429/503 */
export const TWITTER_FETCH_MAX_RETRIES = 4;

/** Exponential backoff cap (ms) */
export const TWITTER_RETRY_MAX_DELAY_MS = 30_000;

/** Max tags the LLM may extract per post */
export const MAX_TAGS_PER_POST = 3;

/** Max tag name length (word-cloud chip + icebreaker topics should stay short) */
export const MAX_TAG_NAME_LENGTH = 6;

/** Per-post extraction temperature (0 = max stability) */
export const LLM_EXTRACT_TEMPERATURE = 0;

/** Tag refinement temperature */
export const LLM_REFINE_TEMPERATURE = 0;

/** OpenRouter seed (supported by some models; ignored otherwise) */
export const LLM_SEED = 42;

/**
 * Structured JSON extraction does not need thinking; DeepSeek V4 Flash enables
 * reasoning by default, which slows things down and can fill max_tokens with
 * reasoning so content is empty. OpenRouter: reasoning.effort = "none"
 */
export const LLM_REASONING_EFFORT = "none" as const;

/** Corpus rolling inference max_tokens (800 is enough with reasoning off) */
export const LLM_CORPUS_MAX_TOKENS = 800;

/** Scheme C — Stage 1 single-post preprocess max_tokens */
export const LLM_PREPROCESS_MAX_TOKENS = 200;

/** Scheme C — Stage 2 timeline merge max_tokens */
export const LLM_TIMELINE_MERGE_MAX_TOKENS = 1200;

/** Scheme C — Stage 3 final tag extraction max_tokens */
export const LLM_TIMELINE_EXTRACT_MAX_TOKENS = 800;

/** Scheme C — adjacent-post merge window (days) */
export const TIMELINE_MERGE_WINDOW_DAYS = 7;

/** Scheme C — max characters for a single-post compressed summary */
export const TIMELINE_PREPROCESS_SUMMARY_MAX_CHARS = 120;

/** Scheme C — final tag cap */
export const MAX_TIMELINE_TAGS = 12;

/** Tag refinement max_tokens */
export const LLM_REFINE_MAX_TOKENS = 400;

/** Corpus batching: max posts per batch */
export const CORPUS_BATCH_MAX_POSTS = 5;

/** Corpus batching: max total post-body characters per batch */
export const CORPUS_BATCH_MAX_CHARS = 8000;

/** Max characters for the rolling compressed summary */
export const CORPUS_SUMMARY_MAX_CHARS = 220;

/** Corpus inference final tag cap (rolling cumulative output) */
export const MAX_CORPUS_TAGS = 12;

/** Max concurrent LLM requests */
export const LLM_CONCURRENCY = 30;

/** Cap on inferred tags kept in the end */
export const MAX_INFERRED_TAGS = 20;

/** Keep only tags that appear in at least this many posts (custom tags exempt); per-post extraction has low tag overlap, so keep at 1 */
export const MIN_TAG_POST_COUNT = 1;

/** When a tag appears in only 1 post, drop it if sentiment is below this (filters casual mentions) */
export const MIN_SINGLE_POST_SENTIMENT = 0.45;

/** Max inferred tags kept after profile-level refinement */
export const MAX_REFINED_TAGS = 12;

/** Recency exponential decay λ (per day); 0.08 → ~0.09 at 30 days, ~0.001 at 90 days */
export const RECENCY_DECAY_LAMBDA = 0.08;

/** Drop tags older than this many days when postCount=1 */
export const STALE_TAG_DAYS = 60;
