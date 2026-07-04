import { WEIGHT_FACTORS } from "./constants";
import type { InterestTag, LlmTagDraft } from "./types";
import type { WordCloudTag } from "@/components/tag-word-cloud";

const CUSTOM_TAG_DEFAULT_WEIGHT = 0.55;

export function computeTagWeight(draft: LlmTagDraft): number {
  const raw =
    draft.frequency * WEIGHT_FACTORS.frequency +
    draft.sentiment * WEIGHT_FACTORS.sentiment +
    draft.recency * WEIGHT_FACTORS.recency;

  return Math.round(raw * 1000) / 1000;
}

export function draftsToTags(drafts: LlmTagDraft[]): InterestTag[] {
  return drafts
    .map((draft) => ({
      name: draft.name,
      frequency: draft.frequency,
      sentiment: draft.sentiment,
      recency: draft.recency,
      weight: computeTagWeight(draft),
    }))
    .sort((a, b) => b.weight - a.weight);
}

export function createCustomTag(name: string, weight = CUSTOM_TAG_DEFAULT_WEIGHT): InterestTag {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    weight,
    frequency: 0,
    sentiment: 0.5,
    recency: 1,
    custom: true,
  };
}

export function interestTagsToWordCloud(tags: InterestTag[]): WordCloudTag[] {
  return tags.map((tag, index) => ({
    id: tag.id ?? (tag.custom ? `custom-${tag.name}` : `inferred-${index}-${tag.name}`),
    name: tag.name,
    weight: tag.weight,
    custom: tag.custom,
  }));
}
