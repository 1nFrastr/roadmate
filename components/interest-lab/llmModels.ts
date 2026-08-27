export const DEFAULT_LLM_MODEL = "deepseek/deepseek-v4-flash" as const;

/** Return the first non-empty model by priority, else the default */
export function resolveLlmModel(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate?.trim()) return candidate.trim();
  }
  return DEFAULT_LLM_MODEL;
}
