import { normalizeTagKey } from "./postUtils";

/** 同义标签归一：减少 LLM 措辞波动对聚合的影响 */
const TAG_ALIASES: Record<string, string> = {
  费曼技巧: "费曼学习法",
  费曼法: "费曼学习法",
  feynman: "费曼学习法",
  temporal: "Temporal",
  状态机即服务: "Temporal",
  ai学习: "AI学习",
  ai学习工具: "AI学习",
  baas: "BaaS",
  infra: "Infra",
  技术深耕: "技术选型",
  架构精简: "技术选型",
  选型方案: "技术选型",
  架构思路: "技术选型",
  quizgecko: "AI学习",
  genspark: "AI学习",
  stepfunc: "Temporal",
  "step func": "Temporal",
};

export function canonicalTagName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return TAG_ALIASES[normalizeTagKey(trimmed)] ?? trimmed;
}
