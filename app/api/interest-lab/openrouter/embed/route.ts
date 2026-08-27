import { NextRequest, NextResponse } from "next/server";
import { embedTags } from "@/components/interest-lab/server/openrouter";

function isConfigError(message: string): boolean {
  return /not configured|missing|is not set/i.test(message);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      tagNames?: string[];
    };

    const tagNames = body.tagNames ?? [];

    if (tagNames.length === 0) {
      return NextResponse.json({ vectors: [] });
    }

    const vectors = await embedTags(tagNames);
    return NextResponse.json({ vectors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding failed";
    const status = isConfigError(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
