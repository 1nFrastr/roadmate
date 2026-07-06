import { isTagRefinementEnabled } from "@/components/interest-lab/server/env";
import { refineAggregatedTags } from "@/components/interest-lab/server/openrouter";
import { logInferenceTiming } from "@/components/interest-lab/server/timing";

export async function POST(request: Request) {
  const started = Date.now();

  try {
    const body = (await request.json()) as {
      tags?: { name: string; postCount: number }[];
    };

    const tags = body.tags ?? [];

    if (!isTagRefinementEnabled()) {
      logInferenceTiming("refine-tags", Date.now() - started, { skipped: true, tagCount: tags.length });
      return Response.json({
        keep: tags.map((tag) => tag.name),
        skipped: true,
      });
    }

    const keep = await refineAggregatedTags(tags);
    return Response.json({ keep, skipped: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "标签精炼失败";
    const status = message.includes("未配置") ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
