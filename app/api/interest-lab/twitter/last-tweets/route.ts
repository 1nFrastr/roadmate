import { NextRequest, NextResponse } from "next/server";
import { TWITTER_API_BASE, TWITTER_CACHE_REVALIDATE_SEC } from "@/components/interest-lab/constants";
import { getTwitterApiKey } from "@/components/interest-lab/server/env";

function twitterCacheTag(userName: string, cursor?: string): string {
  const handle = userName.replace(/^@/, "").trim().toLowerCase();
  const page = cursor?.trim();
  return page ? `twitter:${handle}:${page}` : `twitter:${handle}`;
}

/** Browser cannot call twitterapi.io directly (no CORS); proxy on the server. Key is read from env. */
export async function GET(request: NextRequest) {
  const userName = request.nextUrl.searchParams.get("userName")?.trim();
  const cursor = request.nextUrl.searchParams.get("cursor")?.trim();

  if (!userName) {
    return NextResponse.json({ status: "error", message: "Missing userName" }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = getTwitterApiKey();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server TWITTER_API_KEY is not configured";
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }

  const params = new URLSearchParams({ userName });
  if (cursor) params.set("cursor", cursor);

  try {
    const response = await fetch(`${TWITTER_API_BASE}/twitter/user/last_tweets?${params}`, {
      headers: { "X-API-Key": apiKey },
      cache: "force-cache",
      next: {
        revalidate: TWITTER_CACHE_REVALIDATE_SEC,
        tags: [twitterCacheTag(userName, cursor)],
      },
    });

    const data = (await response.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Twitter API proxy request failed" },
      { status: 502 },
    );
  }
}
