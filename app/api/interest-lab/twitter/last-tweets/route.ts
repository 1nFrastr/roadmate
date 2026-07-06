import { NextRequest, NextResponse } from "next/server";
import { TWITTER_API_BASE } from "@/components/interest-lab/constants";
import { getTwitterApiKey } from "@/components/interest-lab/server/env";

/** 浏览器无法直连 twitterapi.io（无 CORS），由服务端转发；Key 从环境变量读取 */
export async function GET(request: NextRequest) {
  const userName = request.nextUrl.searchParams.get("userName")?.trim();
  const cursor = request.nextUrl.searchParams.get("cursor")?.trim();

  if (!userName) {
    return NextResponse.json({ status: "error", message: "缺少 userName" }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = getTwitterApiKey();
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务端未配置 TWITTER_API_KEY";
    return NextResponse.json({ status: "error", message }, { status: 503 });
  }

  const params = new URLSearchParams({ userName });
  if (cursor) params.set("cursor", cursor);

  try {
    const response = await fetch(`${TWITTER_API_BASE}/twitter/user/last_tweets?${params}`, {
      headers: { "X-API-Key": apiKey },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Twitter API 代理请求失败" },
      { status: 502 },
    );
  }
}
