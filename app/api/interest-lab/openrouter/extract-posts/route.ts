import { extractTagsFromPosts } from "@/components/interest-lab/server/openrouter";
import type { PostTagDraft } from "@/components/interest-lab/types";

type ExtractStreamEvent =
  | { type: "progress"; done: number; total: number }
  | {
      type: "complete";
      results: { id: string; tags: PostTagDraft[]; extractedAt: string }[];
    }
  | { type: "error"; message: string };

export async function POST(request: Request) {
  let posts: { id: string; text: string }[];

  try {
    const body = (await request.json()) as {
      posts?: { id: string; text: string }[];
    };
    posts = body.posts ?? [];
  } catch {
    return Response.json({ error: "请求体无效" }, { status: 400 });
  }

  if (posts.length === 0) {
    return Response.json({ error: "缺少 posts" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: ExtractStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const results = await extractTagsFromPosts(posts, {
          onProgress: (done, total) => send({ type: "progress", done, total }),
        });

        send({
          type: "complete",
          results: [...results.entries()].map(([id, value]) => ({ id, ...value })),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "逐帖提取失败";
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
