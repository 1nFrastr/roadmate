export interface InterestTag {
  name: string;
  weight: number;
  frequency: number;
  sentiment: number;
  recency: number;
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
