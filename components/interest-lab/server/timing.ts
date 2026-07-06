/** 开发环境或 INFERENCE_TIMING=1 时输出各阶段耗时 */
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
