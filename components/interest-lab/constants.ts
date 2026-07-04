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
  frequency: 0.45,
  sentiment: 0.25,
  recency: 0.3,
} as const;

export const MAX_TWEET_PAGES = 3;
