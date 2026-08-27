import { DEFAULT_EMBEDDING_MODEL } from "../constants";
import { resolveLlmModel } from "../llmModels";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Server is missing ${name}`);
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

/** Off by default; per-post prompt + denylist are enough and skip ~15s of one LLM call */
export function isTagRefinementEnabled(): boolean {
  const value = process.env.OPENROUTER_ENABLE_TAG_REFINEMENT?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** Refinement-only model; falls back to the main LLM if unset */
export function getRefineModel(): string {
  return optionalEnv("OPENROUTER_REFINE_MODEL", getLlmModel());
}
