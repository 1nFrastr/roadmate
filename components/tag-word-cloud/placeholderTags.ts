import type { WordCloudTag } from "./types";

const PLACEHOLDER_LABELS = [
  "AI",
  "摄影",
  "徒步",
  "咖啡",
  "独立游戏",
  "爵士乐",
  "科幻",
  "骑行",
  "开源",
  "旅行",
  "设计",
  "播客",
  "攀岩",
  "电影",
  "写作",
  "电子音乐",
  "露营",
  "阅读",
  "City Walk",
  "手冲",
  "极客",
  "滑板",
  "哲学",
  "烹饪",
  "天文",
  "复古",
  "跑步",
  "插画",
  "区块链",
  "冥想",
  "黑胶",
  "冲浪",
  "建筑",
  "猫咪",
  "机械键盘",
  "纹身",
  "调酒",
  "街舞",
  "植物",
  "VR",
] as const;

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function randomWeight(index: number, total: number): number {
  const rank = 1 - index / Math.max(total - 1, 1);
  const jitter = Math.random() * 0.35;
  return Math.round(Math.max(0.08, rank * 0.75 + jitter) * 1000) / 1000;
}

export function generatePlaceholderTags(count = 16): WordCloudTag[] {
  const size = Math.max(4, Math.min(count, PLACEHOLDER_LABELS.length));
  return shuffle([...PLACEHOLDER_LABELS])
    .slice(0, size)
    .map((name, index) => ({
      name,
      weight: randomWeight(index, size),
    }))
    .sort((a, b) => b.weight - a.weight);
}
