import type { WordCloudTag } from "./types";

const PLACEHOLDER_LABELS = [
  "AI",
  "Photography",
  "Hiking",
  "Coffee",
  "Indie Games",
  "Jazz",
  "Sci-Fi",
  "Cycling",
  "Open Source",
  "Travel",
  "Design",
  "Podcasts",
  "Climbing",
  "Film",
  "Writing",
  "Electronic Music",
  "Camping",
  "Reading",
  "City Walk",
  "Pour-Over",
  "Geek",
  "Skateboarding",
  "Philosophy",
  "Cooking",
  "Astronomy",
  "Vintage",
  "Running",
  "Illustration",
  "Blockchain",
  "Meditation",
  "Vinyl",
  "Surfing",
  "Architecture",
  "Cats",
  "Mechanical Keyboards",
  "Tattoos",
  "Mixology",
  "Street Dance",
  "Plants",
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
