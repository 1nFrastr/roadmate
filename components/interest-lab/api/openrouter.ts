import type { PostTagDraft } from "../types";

const EXTRACT_POSTS_PATH = "/api/interest-lab/openrouter/extract-posts";
const REFINE_TAGS_PATH = "/api/interest-lab/openrouter/refine-tags";
const EMBED_PATH = "/api/interest-lab/openrouter/embed";

type ExtractStreamEvent =
  | { type: "progress"; done: number; total: number }
  | {
      type: "complete";
      results: { id: string; tags: PostTagDraft[]; extractedAt: string }[];
    }
  | { type: "error"; message: string };

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function consumeNdjsonStream<T>(
  response: Response,
  onLine: (event: T) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("服务端未返回流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onLine(JSON.parse(trimmed) as T);
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    onLine(JSON.parse(trailing) as T);
  }
}

export async function extractTagsFromPosts(
  posts: { id: string; text: string }[],
  options?: {
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Map<string, { tags: PostTagDraft[]; extractedAt: string }>> {
  const total = posts.length;
  options?.onProgress?.(0, total);

  const response = await fetch(EXTRACT_POSTS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posts }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "逐帖提取失败"));
  }

  let completeResults: { id: string; tags: PostTagDraft[]; extractedAt: string }[] | null = null;
  let streamError: string | null = null;

  await consumeNdjsonStream<ExtractStreamEvent>(response, (event) => {
    if (event.type === "progress") {
      options?.onProgress?.(event.done, event.total);
      return;
    }
    if (event.type === "error") {
      streamError = event.message;
      return;
    }
    if (event.type === "complete") {
      completeResults = event.results;
    }
  });

  if (streamError) {
    throw new Error(streamError);
  }

  if (!completeResults) {
    throw new Error("逐帖提取未完成");
  }

  const items: { id: string; tags: PostTagDraft[]; extractedAt: string }[] = completeResults;
  const results = new Map<string, { tags: PostTagDraft[]; extractedAt: string }>();
  for (const item of items) {
    results.set(item.id, { tags: item.tags, extractedAt: item.extractedAt });
  }

  return results;
}

/** profile 级标签精炼；失败时 return null，调用方应回退到聚合结果 */
export async function refineAggregatedTags(
  tags: { name: string; postCount: number }[],
): Promise<string[] | null> {
  const response = await fetch(REFINE_TAGS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { keep?: string[] | null };
  if (!Array.isArray(data.keep)) return null;
  return data.keep.filter((name) => typeof name === "string" && name.trim());
}

export async function embedTags(tagNames: string[]): Promise<number[][]> {
  if (tagNames.length === 0) return [];

  const response = await fetch(EMBED_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagNames }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Embedding 失败"));
  }

  const data = (await response.json()) as { vectors?: number[][] };
  return data.vectors ?? [];
}
