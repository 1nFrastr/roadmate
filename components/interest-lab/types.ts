export interface InterestTag {
  /** Stable id for custom tags; inferred tags do not need a persistent id */
  id?: string;
  name: string;
  weight: number;
  frequency: number;
  sentiment: number;
  recency: number;
  /** Number of posts the tag appeared in (inferred tags) */
  postCount?: number;
  /** ISO timestamp of the most recent appearance */
  lastSeenAt?: string;
  /** User-added tag with editable weight */
  custom?: boolean;
}

export interface TagEmbedding {
  name: string;
  vector: number[];
}

export interface PostTagDraft {
  name: string;
  sentiment: number;
}

export interface PostRecord {
  id: string;
  text: string;
  createdAt: string;
  extractedAt?: string;
  tags?: PostTagDraft[];
}

/** Tag + embedding slice for device matching / Journey handoff */
export interface InterestProfileSlice {
  tags: InterestTag[];
  embeddings: TagEmbedding[];
}

export interface StoredInterestProfile {
  id: string;
  createdAt: string;
  updatedAt?: string;
  source: {
    type: "twitter" | "paste";
    handle?: string;
  };
  posts?: PostRecord[];
  tags: InterestTag[];
  embeddings: TagEmbedding[];
  tweetCount?: number;
}

/** @deprecated Legacy type from whole-corpus inference */
export interface LlmTagDraft {
  name: string;
  frequency: number;
  sentiment: number;
  recency: number;
}

export interface LlmTagResponse {
  tags: LlmTagDraft[];
}

export interface PostTagResponse {
  tags: PostTagDraft[];
}

/** Intermediate / final state for rolling corpus inference */
export interface CorpusInferenceState {
  summary: string;
  tags: PostTagDraft[];
  processedPostIds: string[];
  inferredAt: string;
}

export interface CorpusInferenceResult {
  tags: PostTagDraft[];
  summary: string;
  extractedAt: string;
  processedPostIds: string[];
}

export interface CorpusRollingResponse {
  summary: string;
  tags: PostTagDraft[];
}

/** Scheme C — Stage 1: single-post preprocess */
export interface PreprocessedPost {
  id: string;
  createdAt: string;
  isNoise: boolean;
  summary: string;
}

/** Scheme C — Stage 2: timeline merge entry */
export interface TimelineEntry {
  id: string;
  createdAt: string;
  summary: string;
  sourcePostIds: string[];
}

/** Scheme C — Stage 3: tag with timeline entry attribution */
export interface TimelineTagDraft extends PostTagDraft {
  entryIds: string[];
}

export interface TimelineInferenceResult {
  preprocessed: PreprocessedPost[];
  timeline: TimelineEntry[];
  tags: TimelineTagDraft[];
  extractedAt: string;
  processedPostIds: string[];
}

export type TimelineInferenceStage = "preprocess" | "merge" | "extract";

export interface TimelineInferenceProgress {
  stage: TimelineInferenceStage;
  done: number;
  total: number;
}

export type InputMode = "twitter" | "paste";
