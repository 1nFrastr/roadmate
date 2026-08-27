import {
  MAX_TWEET_PAGES,
  MAX_TWEETS_FETCH,
  TWITTER_API_BASE,
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
  /** Truncated because of MAX_TWEETS_FETCH */
  truncated: boolean;
}

interface TwitterTweetRaw {
  id?: string;
  text?: string;
  createdAt?: string;
  quoted_tweet?: TwitterTweetRaw | null;
  retweeted_tweet?: TwitterTweetRaw | null;
}

/** Max nested quote-chain depth within a single response (no extra API calls) */
const MAX_NESTED_QUOTE_DEPTH = 5;
const QUOTE_SEPARATOR = "\n\n[Quote]\n";

/** Expand RT / quote-chain body from a single last_tweets Tweet object */
export function extractTweetText(tweet: TwitterTweetRaw): string {
  const body = tweet.retweeted_tweet ?? tweet;
  const parts: string[] = [];

  function appendChain(node: TwitterTweetRaw | null | undefined, depth: number): void {
    if (!node || depth >= MAX_NESTED_QUOTE_DEPTH) return;
    const own = node.text?.trim();
    if (own) parts.push(own);
    if (node.quoted_tweet) appendChain(node.quoted_tweet, depth + 1);
  }

  appendChain(body, 0);
  return parts.join(QUOTE_SEPARATOR);
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
  /** Flat shape from older docs / examples */
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

/** Twitter date from twitterapi.io → ISO */
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
  init?: RequestInit,
  attempt = 0,
): Promise<{ response: Response; data: TwitterLastTweetsResponse }> {
  const response = await fetch(url, init);

  let data: TwitterLastTweetsResponse;
  try {
    data = (await response.json()) as TwitterLastTweetsResponse;
  } catch {
    if (RETRYABLE_STATUSES.has(response.status) && attempt < TWITTER_FETCH_MAX_RETRIES) {
      await sleep(retryDelayMs(response, attempt));
      return fetchTwitterJson(url, init, attempt + 1);
    }
    throw new Error(`Failed to parse Twitter API response (${response.status})`);
  }

  const shouldRetry =
    attempt < TWITTER_FETCH_MAX_RETRIES &&
    (RETRYABLE_STATUSES.has(response.status) ||
      (data.status === "error" && isRateLimitMessage(getApiErrorMessage(data))));

  if (shouldRetry) {
    await sleep(retryDelayMs(response, attempt));
    return fetchTwitterJson(url, init, attempt + 1);
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

    const text = extractTweetText(tweet);
    if (!text) continue;

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

async function fetchUserTweetsPaged(
  handle: string,
  cap: number,
  maxPages: number,
  requestPage: (cursor: string) => Promise<{ response: Response; data: TwitterLastTweetsResponse }>,
): Promise<FetchUserTweetsResult> {
  const tweets: FetchedTweet[] = [];
  const seenIds = new Set<string>();
  let cursor = "";
  let page = 0;
  let lastHasNext = false;

  while (page < maxPages && tweets.length < cap) {
    if (page > 0) {
      await sleep(TWITTER_PAGE_DELAY_MS);
    }

    const { response, data } = await requestPage(cursor);

    if (!response.ok) {
      throw new Error(getApiErrorMessage(data) || `Twitter API request failed (${response.status})`);
    }
    if (!isApiSuccess(data)) {
      throw new Error(getApiErrorMessage(data) || "Twitter API returned an error");
    }

    appendTweetsFromPage(data, tweets, seenIds, cap);
    lastHasNext = Boolean(data.has_next_page && data.next_cursor);

    if (tweets.length >= cap) break;
    if (!lastHasNext) break;

    cursor = data.next_cursor!;
    page += 1;
  }

  if (tweets.length === 0) {
    throw new Error("No posts fetched; check the username or whether the account has public tweets");
  }

  return { tweets, truncated: tweets.length >= cap || lastHasNext };
}

/** Scripts / server: call twitterapi.io directly (not via Next proxy) */
export async function fetchUserTweetsDirect(
  userName: string,
  apiKey: string,
  options?: { maxTweets?: number; maxPages?: number },
): Promise<FetchUserTweetsResult> {
  const handle = userName.replace(/^@/, "").trim();
  if (!handle) throw new Error("Enter a valid X username");
  if (!apiKey.trim()) throw new Error("Missing TWITTER_API_KEY");

  const cap = Math.max(1, Math.min(options?.maxTweets ?? MAX_TWEETS_FETCH, MAX_TWEETS_FETCH));
  const maxPages = Math.max(1, options?.maxPages ?? MAX_TWEET_PAGES);

  return fetchUserTweetsPaged(handle, cap, maxPages, (cursor) => {
    const params = new URLSearchParams({ userName: handle });
    if (cursor) params.set("cursor", cursor);
    const url = `${TWITTER_API_BASE}/twitter/user/last_tweets?${params}`;
    return fetchTwitterJson(url, { headers: { "X-API-Key": apiKey.trim() } });
  });
}

export async function fetchUserTweets(
  userName: string,
  maxTweets = MAX_TWEETS_FETCH,
): Promise<FetchUserTweetsResult> {
  const handle = userName.replace(/^@/, "").trim();
  if (!handle) throw new Error("Enter a valid X username");

  const cap = Math.max(1, Math.min(maxTweets, MAX_TWEETS_FETCH));

  return fetchUserTweetsPaged(handle, cap, MAX_TWEET_PAGES, (cursor) => {
    const params = new URLSearchParams({ userName: handle });
    if (cursor) params.set("cursor", cursor);
    const url = `${TWITTER_PROXY_PATH}?${params}`;
    return fetchTwitterJson(url);
  });
}
