import { MAX_TAG_NAME_LENGTH } from "./constants";
import { normalizeTagKey } from "./postUtils";
import type { PostTagDraft } from "./types";

export function tagNameLength(name: string): number {
  return [...name.trim()].length;
}

export function isTagNameTooLong(name: string): boolean {
  return tagNameLength(name) > MAX_TAG_NAME_LENGTH;
}

/** Structural filter: length constraints and within-batch dedupe only; semantic choices are left to the prompt */
export function filterPostTagDrafts(tags: PostTagDraft[]): PostTagDraft[] {
  const seen = new Set<string>();
  const result: PostTagDraft[] = [];

  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name || isTagNameTooLong(name)) continue;

    const key = normalizeTagKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    result.push({ name, sentiment: tag.sentiment });
  }

  return result;
}
