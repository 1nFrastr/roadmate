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
  /** 滚动语料推断压缩上下文，供增量批次使用 */
  inferenceContext?: CorpusInferenceState;
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

export type InputMode = "twitter" | "paste";
