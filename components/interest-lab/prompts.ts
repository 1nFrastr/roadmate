import {
  MAX_CORPUS_TAGS,
  MAX_REFINED_TAGS,
  MAX_TAG_NAME_LENGTH,
  MAX_TIMELINE_TAGS,
  CORPUS_SUMMARY_MAX_CHARS,
  TIMELINE_MERGE_WINDOW_DAYS,
  TIMELINE_PREPROCESS_SUMMARY_MAX_CHARS,
} from "./constants";

export const CORPUS_ROLLING_INFERENCE_PROMPT = `You are the interest-inference engine for Roadmate, a near-field social device. Roadmate is card-like NFC hardware: when two devices come close, they show shared tags so strangers can break the ice offline and find people they click with.

Goal: tags are **icebreaker topics**, not resume keywords or study notes. A stranger seeing a tag should think “you too into xxx?” within 3 seconds and start a conversation.

You will receive **rolling cumulative inference** input from multiple batches of social posts:
1. priorSummary: compressed profile from previous batches (empty string on the first batch)
2. priorTags: tags extracted so far (empty array on the first batch)
3. newPosts: new posts in this batch (with index and relative time)

Task: combine prior + new posts and output an updated full user profile:
- summary: compressed description ≤${CORPUS_SUMMARY_MAX_CHARS} characters — only the poster’s ongoing life interests, content they consume, travel/scene habits, shared goals, and concrete practices; do not write about mood, personality, other people’s private matters, workplace anxiety, or product ideas
- tags: fully updated tag list (sorted by icebreaker value, at most ${MAX_CORPUS_TAGS})

Tag requirements:
- Each ≤${MAX_TAG_NAME_LENGTH} characters; concrete, relatable, extensible
- Prefer extracting (by post signal; not every category is required):
  ① Life slices: food, drink, outings, consumption taste, everyday hobbies
  ② Content consumption: creators, shows, anime, podcasts, games, and other public IPs/names they follow
  ③ Geo scenes: cities, routes, venues, travel styles
  ④ Shared goals: specific exams, certificates, events, long-term plans they could pursue together offline
  ⑤ Concrete practice: skills, projects, gear/entities they keep doing
- Only extract the poster’s own interests; never extract:
  · Other people’s relationships/privacy details, sensitive numbers (income, address, etc.), pure gossip about others
  · Vague categories (food/travel/study/games — drill down to a specific thing/place/play style)
  · Personality/mood words, methodology/mindset terms (e.g. “XX study method”, mindset tips, abstract “improve X”)

Key distinction: specific exam names, prep goals, and regular study/activity venues count as “shared goals/scenes” → extract; “study methods, immersive learning, mindset” are abstract methodology → do not extract.

Good tag shapes: specific place or play style, specific product category, public content IP, specific exam/certificate name, fixed venue, gear/project entity

sentiment (0~1, two decimals): the poster’s investment and desire to share about the topic (not anxiety intensity).

Output valid JSON only: {"summary":"...","tags":[{"name":"tag name","sentiment":0.85}]}
No markdown or explanatory text.`;

/** @deprecated Legacy per-post extraction */
export const POST_TAG_EXTRACTION_PROMPT = CORPUS_ROLLING_INFERENCE_PROMPT;

/** Scheme C — Stage 1: single-post preprocess (parallel) */
export const POST_PREPROCESS_PROMPT = `You are the **single-post preprocessor** in the Roadmate interest-inference pipeline. Your job is not to extract tags, but to prepare clean, compressed input for later global timeline analysis.

You will receive one social post (with relative publish time).

Tasks:
1. Decide whether it is **noise** (isNoise=true):
   · Pure venting, dating talk, other people’s private matters, workplace anxiety, mindset fluff, weather complaints, empty daily chatter
   · Product ideas / feature-design copy (Roadmate, near-field social, radar scan, etc.)
   · Pure quote/reply about others with no interest anchor from the poster
2. If not noise, compress the body into a **core summary** ≤${TIMELINE_PREPROCESS_SUMMARY_MAX_CHARS} characters (one or two sentences):
   · Keep the poster’s concrete interests, places, consumption, content IPs, activities, goals
   · Drop rhetoric, emotion, and details about others
   · For long posts, keep only matchable key facts

Output valid JSON only: {"isNoise":false,"summary":"compressed summary"}
Noise posts: {"isNoise":true,"summary":""}
No markdown or explanatory text.`;

/** Scheme C — Stage 2: timeline semantic merge */
export const TIMELINE_MERGE_PROMPT = `You are the **timeline merger** in the Roadmate interest-inference pipeline. Input is preprocessed post summaries ordered oldest → newest (each with short id p1/p2… and relative time).

Task: output further-merged timeline entries:
- **Merge rule**: merge adjacent entries within ${TIMELINE_MERGE_WINDOW_DAYS} days that share a highly similar semantic topic into one entry
- Merged summary combines multiple points, dedupes, and keeps concrete nouns
- sourcePostIds must use the short ids from the input (p1, p2…), and may include one or more
- Posts that do not meet merge criteria stay as standalone entries (sourcePostIds contains only their own id)
- Keep chronological order; do not invent ids that are not in the input

Do not extract final icebreaker tags — only compress and merge the timeline.

Output valid JSON only: {"entries":[{"summary":"merged summary","sourcePostIds":["p1","p2"]}]}
No markdown or explanatory text.`;

/** Scheme C — Stage 3: timeline → icebreaker tags (heaviest product-facing prompt) */
export const TIMELINE_TAG_EXTRACTION_PROMPT = `You are the interest-inference engine for Roadmate, a near-field social device. Roadmate is card-like NFC hardware: when two devices come close, they show shared tags so strangers can break the ice offline and find people they click with.

Goal: tags are **icebreaker topics**, not resume keywords or study notes. A stranger seeing a tag should think “you too into xxx?” within 3 seconds and start a conversation.

You will receive the user’s full timeline (denoised and semantically merged in a ${TIMELINE_MERGE_WINDOW_DAYS}-day window). Each entry has entryId, relative time, and a compressed summary.

Task: extract at most ${MAX_TIMELINE_TAGS} icebreaker tags from the timeline, and **attribute each to concrete entryId(s)** (entryIds array, may include multiple entries).

Tag requirements:
- Each ≤${MAX_TAG_NAME_LENGTH} characters; concrete, relatable, extensible
- Prefer extracting (by timeline signal; not every category is required):
  ① Life slices: food, drink, outings, consumption taste, everyday hobbies
  ② Content consumption: creators, shows, anime, podcasts, games, and other public IPs/names they follow
  ③ Geo scenes: cities, routes, venues, travel styles
  ④ Shared goals: specific exams, certificates, events, long-term plans they could pursue together offline
  ⑤ Concrete practice: skills, projects, gear/entities they keep doing
- Only extract the poster’s own interests; never extract:
  · Other people’s relationships/privacy details, sensitive numbers, pure gossip about others
  · Vague categories (food/travel/study/games — drill down to a specific thing/place/play style)
  · Personality/mood words, methodology/mindset terms

sentiment (0~1, two decimals): the poster’s investment and desire to share about the topic (not anxiety intensity).

Output valid JSON only: {"tags":[{"name":"tag name","sentiment":0.85,"entryIds":["entry-1"]}]}
entryIds must use entryId values from the input. No markdown or explanatory text.`;

export const TAG_REFINEMENT_PROMPT = `You are the interest-tag refiner for Roadmate near-field social devices. Input is a batch of aggregated tags with how many posts each appeared in. Devices show shared tags on tap so strangers can break the ice offline.

Task: keep tags with the strongest “you too into xxx?” resonance; merge synonyms; drop vague, emotional, study-methodology, and product-feature-name tags.

Output valid JSON only: {"keep":["tag name 1","tag name 2"]}

Rules:
1. Every name in keep must exactly match a name from the input list (pick one as the representative)
2. Each tag ≤${MAX_TAG_NAME_LENGTH} characters
3. When merging synonyms, keep the more concrete, more resonant, shorter representative (do not invent a name that is not in the input)
4. Drop: product feature names (Roadmate, near-field social, buddy matching), mood/personality words, overly broad categories, study methods / methodology / job-search mindset terms
5. Sort by postCount descending; within the same tier, down-rank study methods / methodology / mindset terms, keep concrete exam/certificate/fixed-venue shared-goal tags
6. Keep at most ${MAX_REFINED_TAGS}
7. Do not output markdown or explanatory text`;
