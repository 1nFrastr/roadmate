import {
  MAX_TWEET_PAGES,
  MAX_TWEETS_FETCH,
  TWITTER_FETCH_MAX_RETRIES,
  TWITTER_PAGE_DELAY_MS,
  TWITTER_PROXY_PATH,
  TWITTER_RETRY_MAX_DELAY_MS,
} from "../constants";

export interface FetchedTweet {
  id: string;
  text: string;
  createdAt: string;
}

export interface FetchUserTweetsResult {
  tweets: FetchedTweet[];
  /** 因 MAX_TWEETS_FETCH 截断 */
  truncated: boolean;
}

interface TwitterTweetRaw {
  id?: string;
  text?: string;
  createdAt?: string;
  retweeted_tweet?: unknown;
}

interface TwitterLastTweetsResponse {
  status?: string;
  code?: number;
  msg?: string;
  message?: string;
  error?: string;
  data?: {
    tweets?: TwitterTweetRaw[];
    pin_tweet?: unknown;
  };
  /** 旧版/文档示例中的扁平结构 */
  tweets?: TwitterTweetRaw[];
  has_next_page?: boolean;
  next_cursor?: string;
}

function getPageTweets(data: TwitterLastTweetsResponse): TwitterTweetRaw[] {
  return data.data?.tweets ?? data.tweets ?? [];
}

function getApiErrorMessage(data: TwitterLastTweetsResponse): string | undefined {
  return data.message ?? data.msg ?? data.error;
}

function isApiSuccess(data: TwitterLastTweetsResponse): boolean {
  if (data.status === "error") return false;
  if (data.error) return false;
  if (data.status === "success") return true;
  if (data.code === 0) return true;
  return getPageTweets(data).length > 0;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** twitterapi.io 返回的 Twitter 日期 → ISO */
export function parseTwitterCreatedAt(raw: string | undefined): string {
  if (!raw?.trim()) return new Date().toISOString();
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function parseRetryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return null;

  const seconds = Number.parseInt(raw, 10);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);

  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function parseRateLimitResetMs(response: Response): number | null {
  const raw = response.headers.get("x-rate-limit-reset")?.trim();
  if (!raw) return null;

  const resetSec = Number.parseInt(raw, 10);
  if (Number.isNaN(resetSec)) return null;
  return Math.max(0, resetSec * 1000 - Date.now() + 1000);
}

function retryDelayMs(response: Response, attempt: number): number {
  const fromHeader = parseRetryAfterMs(response) ?? parseRateLimitResetMs(response);
  if (fromHeader != null) return Math.min(TWITTER_RETRY_MAX_DELAY_MS, fromHeader);

  return Math.min(TWITTER_RETRY_MAX_DELAY_MS, 1000 * 2 ** attempt);
}

function isRateLimitMessage(message: string | undefined): boolean {
  if (!message) return false;
  return /rate.?limit|too many|qps|throttl/i.test(message);
}

async function fetchTwitterJson(
  url: string,
  apiKey: string,
  attempt = 0,
): Promise<{ response: Response; data: TwitterLastTweetsResponse }> {
  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey.trim() },
  });

  let data: TwitterLastTweetsResponse;
  try {
    data = (await response.json()) as TwitterLastTweetsResponse;
  } catch {
    if (RETRYABLE_STATUSES.has(response.status) && attempt < TWITTER_FETCH_MAX_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      return fetchTwitterJson(url, apiKey, attempt + 1);
    }
    throw new Error(`Twitter API 响应解析失败 (${response.status})`);
  }

  const shouldRetry =
    attempt < TWITTER_FETCH_MAX_RETRIES &&
    (RETRYABLE_STATUSES.has(response.status) ||
      (data.status === "error" && isRateLimitMessage(getApiErrorMessage(data))));

  if (shouldRetry) {
    await sleep(retryDelayMs(response, attempt));
    return fetchTwitterJson(url, apiKey, attempt + 1);
  }

  return { response, data };
}

function appendTweetsFromPage(
  data: TwitterLastTweetsResponse,
  tweets: FetchedTweet[],
  seenIds: Set<string>,
  cap: number,
): void {
  for (const tweet of getPageTweets(data)) {
    if (tweets.length >= cap) return;

    const text = tweet.text?.trim();
    if (!text) continue;
    if (tweet.retweeted_tweet) continue;

    const id = tweet.id?.trim() || `hash-${text.slice(0, 32)}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    tweets.push({
      id,
      text,
      createdAt: parseTwitterCreatedAt(tweet.createdAt),
    });
  }
}

export async function fetchUserTweets(
  userName: string,
  apiKey: string,
  maxTweets = MAX_TWEETS_FETCH,
): Promise<FetchUserTweetsResult> {
  const handle = userName.replace(/^@/, "").trim();
  if (!handle) throw new Error("请输入有效的 X 用户名");
  if (!apiKey.trim()) throw new Error("请填写 twitterapi.io API Key");

  const cap = Math.max(1, Math.min(maxTweets, MAX_TWEETS_FETCH));
  const tweets: FetchedTweet[] = [];
  const seenIds = new Set<string>();
  let cursor = "";
  let page = 0;
  let lastHasNext = false;

  while (page < MAX_TWEET_PAGES && tweets.length < cap) {
    if (page > 0) {
      await sleep(TWITTER_PAGE_DELAY_MS);
    }

    const params = new URLSearchParams({ userName: handle });
    if (cursor) params.set("cursor", cursor);

    const url = `${TWITTER_PROXY_PATH}?${params}`;
    const { response, data } = await fetchTwitterJson(url, apiKey);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(data) || `Twitter API 请求失败 (${response.status})`);
    }
    if (!isApiSuccess(data)) {
      throw new Error(getApiErrorMessage(data) || "Twitter API 返回错误");
    }

    appendTweetsFromPage(data, tweets, seenIds, cap);
    lastHasNext = Boolean(data.has_next_page && data.next_cursor);

    if (tweets.length >= cap) break;
    if (!lastHasNext) break;

    cursor = data.next_cursor!;
    page += 1;
  }

  if (tweets.length === 0) {
    throw new Error("未获取到任何帖子，请检查用户名、API Key 或账号是否有公开推文");
  }

  return { tweets, truncated: tweets.length >= cap || lastHasNext };
}
