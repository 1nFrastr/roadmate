import { MAX_TWEET_PAGES, TWITTER_API_BASE } from "../constants";

export interface FetchedTweet {
  text: string;
  createdAt: string;
}

interface TwitterLastTweetsResponse {
  tweets?: { text?: string; createdAt?: string }[];
  has_next_page?: boolean;
  next_cursor?: string;
  status?: string;
  message?: string;
}

export async function fetchUserTweets(
  userName: string,
  apiKey: string,
  maxPages = MAX_TWEET_PAGES,
): Promise<FetchedTweet[]> {
  const handle = userName.replace(/^@/, "").trim();
  if (!handle) throw new Error("请输入有效的 X 用户名");

  const tweets: FetchedTweet[] = [];
  let cursor = "";
  let page = 0;

  while (page < maxPages) {
    const params = new URLSearchParams({ userName: handle });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`${TWITTER_API_BASE}/twitter/user/last_tweets?${params}`, {
      headers: { "X-API-Key": apiKey },
    });

    if (!response.ok) {
      throw new Error(`Twitter API 请求失败 (${response.status})`);
    }

    const data = (await response.json()) as TwitterLastTweetsResponse;
    if (data.status === "error") {
      throw new Error(data.message || "Twitter API 返回错误");
    }

    for (const tweet of data.tweets ?? []) {
      if (tweet.text) {
        tweets.push({
          text: tweet.text,
          createdAt: tweet.createdAt ?? "",
        });
      }
    }

    if (!data.has_next_page || !data.next_cursor) break;
    cursor = data.next_cursor;
    page += 1;
  }

  if (tweets.length === 0) {
    throw new Error("未获取到任何帖子，请检查用户名或 API Key");
  }

  return tweets;
}

export function tweetsToCorpus(tweets: FetchedTweet[]): string {
  return tweets
    .map((tweet, index) => {
      const date = tweet.createdAt ? `[${tweet.createdAt}] ` : "";
      return `${index + 1}. ${date}${tweet.text}`;
    })
    .join("\n\n");
}
