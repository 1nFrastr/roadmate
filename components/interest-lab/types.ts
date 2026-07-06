export interface InterestTag {
  /** 自定义标签的稳定 id；推断标签无需持久化 id */
  id?: string;
  name: string;
  weight: number;
  frequency: number;
  sentiment: number;
  recency: number;
  /** 出现该标签的帖子数（推断标签） */
  postCount?: number;
  /** 最近一次出现时间 ISO */
  lastSeenAt?: string;
  /** 用户手动添加的标签，可编辑权重 */
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

/** 设备匹配 / Journey handoff 用的标签 + 向量切片 */
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

/** @deprecated 整段语料推断遗留类型 */
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

/** 滚动语料推断的中间/最终状态 */
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

/** 方案 C — 阶段 1：单帖预处理 */
export interface PreprocessedPost {
  id: string;
  createdAt: string;
  isNoise: boolean;
  summary: string;
}

/** 方案 C — 阶段 2：时间线合并条目 */
export interface TimelineEntry {
  id: string;
  createdAt: string;
  summary: string;
  sourcePostIds: string[];
}

/** 方案 C — 阶段 3：带时间线条目归因的标签 */
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
