import { WEIGHT_FACTORS } from "./constants";
import type { InterestTag, LlmTagDraft } from "./types";

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
