import { DEFAULT_EMBEDDING_MODEL } from "../constants";
import { resolveLlmModel } from "../llmModels";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`服务端未配置 ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function getOpenRouterApiKey(): string {
  return requireEnv("OPENROUTER_API_KEY");
}

export function getTwitterApiKey(): string {
  return requireEnv("TWITTER_API_KEY");
}

export function getLlmModel(): string {
  return resolveLlmModel(process.env.OPENROUTER_LLM_MODEL?.trim());
}

export function getEmbeddingModel(): string {
  return optionalEnv("OPENROUTER_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL);
}

/** 默认关闭；逐帖 prompt + denylist 已足够，可省 ~15s 的一次 LLM */
export function isTagRefinementEnabled(): boolean {
  const value = process.env.OPENROUTER_ENABLE_TAG_REFINEMENT?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** 精炼专用模型；未配置时与 LLM 相同 */
export function getRefineModel(): string {
  return optionalEnv("OPENROUTER_REFINE_MODEL", getLlmModel());
}
