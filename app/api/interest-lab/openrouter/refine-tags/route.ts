import { MAX_REFINED_TAGS } from "@/components/interest-lab/constants";
import { isTagRefinementEnabled } from "@/components/interest-lab/server/env";
import { refineAggregatedTags } from "@/components/interest-lab/server/openrouter";
import { logInferenceTiming } from "@/components/interest-lab/server/timing";
import { normalizeTagKey } from "@/components/interest-lab/postUtils";

function deterministicKeep(tags: { name: string; postCount: number }[]): string[] {
  const seen = new Set<string>();
  const keep: string[] = [];

  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name) continue;

    const key = normalizeTagKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(name);
    if (keep.length >= MAX_REFINED_TAGS) break;
  }

  return keep;
}

function isConfigError(message: string): boolean {
  return /not configured|missing|is not set/i.test(message);
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    const body = (await request.json()) as {
      tags?: { name: string; postCount: number }[];
    };

    const tags = body.tags ?? [];

    if (!isTagRefinementEnabled()) {
      const keep = deterministicKeep(tags);
      logInferenceTiming("refine-tags", Date.now() - started, { skipped: true, tagCount: tags.length, kept: keep.length });
      return Response.json({
        keep,
        skipped: true,
      });
    }

    const keep = await refineAggregatedTags(tags);
    return Response.json({ keep: keep ?? deterministicKeep(tags), skipped: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tag refinement failed";
    const status = isConfigError(message) ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
