import { getEligiblePosts } from "@/components/interest-lab/timelineUtils";
import { inferTagsFromTimeline } from "@/components/interest-lab/server/timelineInference";
import type {
  PostRecord,
  TimelineInferenceProgress,
  TimelineInferenceResult,
} from "@/components/interest-lab/types";

type InferStreamEvent =
  | { type: "progress"; stage: TimelineInferenceProgress["stage"]; done: number; total: number }
  | { type: "complete"; result: TimelineInferenceResult }
  | { type: "error"; message: string };

export async function POST(request: Request) {
  let posts: PostRecord[];

  try {
    const body = (await request.json()) as { posts?: PostRecord[] };
    posts = body.posts ?? [];
  } catch {
    return Response.json({ error: "请求体无效" }, { status: 400 });
  }

  const eligible = getEligiblePosts(posts);

  if (eligible.length === 0) {
    return Response.json({ error: "没有可分析的帖子内容" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: InferStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const result = await inferTagsFromTimeline(
          eligible.map((post) => ({ id: post.id, text: post.text, createdAt: post.createdAt })),
          {
            onProgress: (progress) =>
              send({
                type: "progress",
                stage: progress.stage,
                done: progress.done,
                total: progress.total,
              }),
          },
        );

        send({ type: "complete", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "时间线推断失败";
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
