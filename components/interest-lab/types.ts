export interface InterestTag {
  /** 自定义标签的稳定 id；推断标签无需持久化 id */
  id?: string;
  name: string;
  weight: number;
  frequency: number;
  sentiment: number;
  recency: number;
  /** 用户手动添加的标签，可编辑权重 */
  custom?: boolean;
}

export interface TagEmbedding {
  name: string;
  vector: number[];
}

export interface StoredInterestProfile {
  id: string;
  createdAt: string;
  source: {
    type: "twitter" | "paste";
    handle?: string;
  };
  tags: InterestTag[];
  embeddings: TagEmbedding[];
  tweetCount?: number;
}

export interface ApiKeys {
  openRouterKey: string;
  twitterApiKey: string;
}

export interface LlmTagDraft {
  name: string;
  frequency: number;
  sentiment: number;
  recency: number;
}

export interface LlmTagResponse {
  tags: LlmTagDraft[];
}

export type InputMode = "twitter" | "paste";
