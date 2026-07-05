import { NextRequest, NextResponse } from "next/server";
import { TWITTER_API_BASE } from "@/components/interest-lab/constants";

/** 浏览器无法直连 twitterapi.io（无 CORS），由服务端转发；Key 仍由客户端传入，不落盘 */
export async function GET(request: NextRequest) {
  const userName = request.nextUrl.searchParams.get("userName")?.trim();
  const cursor = request.nextUrl.searchParams.get("cursor")?.trim();
  const apiKey = request.headers.get("x-api-key")?.trim();

  if (!userName) {
    return NextResponse.json({ status: "error", message: "缺少 userName" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ status: "error", message: "缺少 X-API-Key" }, { status: 401 });
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
