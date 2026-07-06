import { MAX_TAG_NAME_LENGTH } from "./constants";
import { normalizeTagKey } from "./postUtils";
import type { PostTagDraft } from "./types";

export function tagNameLength(name: string): number {
  return [...name.trim()].length;
}

export function isTagNameTooLong(name: string): boolean {
  return tagNameLength(name) > MAX_TAG_NAME_LENGTH;
}

/** 结构性过滤：仅做长度约束与同批次去重；标签的语义取舍全部交给 prompt */
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
