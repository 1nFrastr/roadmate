import type {
  CorpusInferenceResult,
  CorpusInferenceState,
  PostRecord,
  TimelineInferenceProgress,
  TimelineInferenceResult,
} from "../types";

const INFER_TIMELINE_PATH = "/api/interest-lab/openrouter/infer-timeline";
const EXTRACT_POSTS_PATH = "/api/interest-lab/openrouter/extract-posts";
const REFINE_TAGS_PATH = "/api/interest-lab/openrouter/refine-tags";
const EMBED_PATH = "/api/interest-lab/openrouter/embed";

type InferStreamEvent =
  | { type: "progress"; done: number; total: number }
  | { type: "complete"; result: CorpusInferenceResult }
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
    throw new Error("Server did not return a streaming response");
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

type TimelineInferStreamEvent =
  | { type: "progress"; stage: TimelineInferenceProgress["stage"]; done: number; total: number }
  | { type: "complete"; result: TimelineInferenceResult }
  | { type: "error"; message: string };

/** Scheme C — three-stage timeline inference (full rerun every time) */
export async function inferTagsFromTimeline(
  posts: PostRecord[],
  options?: {
    model?: string;
    onProgress?: (progress: TimelineInferenceProgress) => void;
  },
): Promise<TimelineInferenceResult> {
  options?.onProgress?.({ stage: "preprocess", done: 0, total: 1 });

  const response = await fetch(INFER_TIMELINE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posts, model: options?.model }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Timeline inference failed"));
  }

  let completeResult: TimelineInferenceResult | null = null;
  let streamError: string | null = null;

  await consumeNdjsonStream<TimelineInferStreamEvent>(response, (event) => {
    if (event.type === "progress") {
      options?.onProgress?.({
        stage: event.stage,
        done: event.done,
        total: event.total,
      });
      return;
    }
    if (event.type === "error") {
      streamError = event.message;
      return;
    }
    if (event.type === "complete") {
      completeResult = event.result;
    }
  });

  if (streamError) {
    throw new Error(streamError);
  }

  if (!completeResult) {
    throw new Error("Timeline inference did not complete");
  }

  return completeResult;
}

/** @deprecated Scheme B — rolling corpus inference (batches + compressed context) */
export async function inferTagsFromCorpus(
  posts: PostRecord[],
  options?: {
    priorState?: CorpusInferenceState | null;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<CorpusInferenceResult> {
  options?.onProgress?.(0, 1);

  const response = await fetch(EXTRACT_POSTS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      posts,
      priorState: options?.priorState ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Corpus inference failed"));
  }

  let completeResult: CorpusInferenceResult | null = null;
  let streamError: string | null = null;

  await consumeNdjsonStream<InferStreamEvent>(response, (event) => {
    if (event.type === "progress") {
      options?.onProgress?.(event.done, event.total);
      return;
    }
    if (event.type === "error") {
      streamError = event.message;
      return;
    }
    if (event.type === "complete") {
      completeResult = event.result;
    }
  });

  if (streamError) {
    throw new Error(streamError);
  }

  if (!completeResult) {
    throw new Error("Corpus inference did not complete");
  }

  return completeResult;
}

/** @deprecated Use inferTagsFromCorpus */
export async function extractTagsFromPosts(
  posts: { id: string; text: string }[],
  options?: {
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Map<string, { tags: never[]; extractedAt: string }>> {
  const result = await inferTagsFromCorpus(
    posts.map((post) => ({ ...post, createdAt: new Date().toISOString() })),
    { onProgress: options?.onProgress },
  );
  const map = new Map<string, { tags: never[]; extractedAt: string }>();
  for (const id of result.processedPostIds) {
    map.set(id, { tags: [], extractedAt: result.extractedAt });
  }
  return map;
}

/** Profile-level tag refinement; returns null on failure so callers can fall back to the aggregated result */
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
    throw new Error(await readApiError(response, "Embedding failed"));
  }

  const data = (await response.json()) as { vectors?: number[][] };
  return data.vectors ?? [];
}
