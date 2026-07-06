import { planCorpusInference } from "@/components/interest-lab/corpusUtils";
import { inferTagsFromCorpus } from "@/components/interest-lab/server/corpusInference";
import type { CorpusInferenceResult, CorpusInferenceState, PostRecord } from "@/components/interest-lab/types";

type InferStreamEvent =
  | { type: "progress"; done: number; total: number }
  | { type: "complete"; result: CorpusInferenceResult }
  | { type: "error"; message: string };

export async function POST(request: Request) {
  let posts: PostRecord[];
  let priorState: CorpusInferenceState | null = null;

  try {
    const body = (await request.json()) as {
      posts?: PostRecord[];
      priorState?: CorpusInferenceState | null;
    };
    posts = body.posts ?? [];
    priorState = body.priorState ?? null;
  } catch {
    return Response.json({ error: "请求体无效" }, { status: 400 });
  }

  if (posts.length === 0) {
    return Response.json({ error: "缺少 posts" }, { status: 400 });
  }

  const plan = planCorpusInference(posts, priorState);

  if (plan.mode === "noop") {
    return Response.json({ error: "没有新帖子需要分析" }, { status: 400 });
  }

  if (plan.posts.length === 0) {
    return Response.json({ error: "没有可分析的帖子内容" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: InferStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const result = await inferTagsFromCorpus(
          plan.posts.map((post) => ({ id: post.id, text: post.text, createdAt: post.createdAt })),
          {
            priorState: plan.mode === "incremental" ? plan.priorState : null,
            mode: plan.mode,
            onProgress: (done, total) => send({ type: "progress", done, total }),
          },
        );

        // 增量模式：合并 processedPostIds
        if (plan.mode === "incremental") {
          const mergedIds = [
            ...new Set([...plan.priorState.processedPostIds, ...result.processedPostIds]),
          ];
          result.processedPostIds = mergedIds;
        }

        send({ type: "complete", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "语料推断失败";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
