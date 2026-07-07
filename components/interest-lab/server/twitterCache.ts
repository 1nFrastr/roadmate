import { TWITTER_CACHE_HIT_DELAY_MS, TWITTER_CACHE_TTL_MS } from "../constants";

interface TwitterCacheEntry {
  status: number;
  body: unknown;
  expiresAt: number;
}

const cache = new Map<string, TwitterCacheEntry>();

export function twitterCacheKey(userName: string, cursor?: string): string {
  const handle = userName.replace(/^@/, "").trim().toLowerCase();
  const page = cursor?.trim() || "";
  return `${handle}:${page}`;
}

export function getTwitterCached(key: string): TwitterCacheEntry | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setTwitterCached(key: string, status: number, body: unknown): void {
  cache.set(key, {
    status,
    body,
    expiresAt: Date.now() + TWITTER_CACHE_TTL_MS,
  });
}

export function isTwitterResponseCacheable(status: number, body: Record<string, unknown>): boolean {
  if (status < 200 || status >= 300) return false;
  if (body.status === "error") return false;
  if (typeof body.error === "string" && body.error) return false;
  return true;
}

export async function delayTwitterCacheHit(): Promise<void> {
  const { min, max } = TWITTER_CACHE_HIT_DELAY_MS;
  const delay = min + Math.floor(Math.random() * (max - min + 1));
  await new Promise((resolve) => setTimeout(resolve, delay));
}
