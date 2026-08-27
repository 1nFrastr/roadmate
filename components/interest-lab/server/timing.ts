/** Log stage timings in development or when INFERENCE_TIMING=1 */
export function logInferenceTiming(
  phase: string,
  ms: number,
  meta?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "development" && process.env.INFERENCE_TIMING !== "1") {
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[interest-lab] ${phase} ${ms}ms${suffix}`);
}
