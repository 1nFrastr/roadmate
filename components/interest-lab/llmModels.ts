export const LLM_MODEL_OPTIONS = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
] as const;

export type LlmModelId = (typeof LLM_MODEL_OPTIONS)[number]["id"];

export const DEFAULT_LLM_MODEL: LlmModelId = "deepseek/deepseek-v4-flash";

const ALLOWED_LLM_MODELS = new Set<string>(LLM_MODEL_OPTIONS.map((option) => option.id));

export function isAllowedLlmModel(model: string): model is LlmModelId {
  return ALLOWED_LLM_MODELS.has(model);
}

/** 按优先级取第一个合法 model，否则回退默认 */
export function resolveLlmModel(...candidates: (string | undefined)[]): LlmModelId {
  for (const candidate of candidates) {
    if (candidate && isAllowedLlmModel(candidate)) return candidate;
  }
  return DEFAULT_LLM_MODEL;
}
