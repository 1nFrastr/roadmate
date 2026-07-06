export const DEFAULT_LLM_MODEL = "deepseek/deepseek-v4-flash" as const;

/** 按优先级取第一个非空 model，否则回退默认 */
export function resolveLlmModel(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate?.trim()) return candidate.trim();
  }
  return DEFAULT_LLM_MODEL;
}
