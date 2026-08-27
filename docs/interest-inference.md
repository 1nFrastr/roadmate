# Interest inference design

Extract concrete icebreaker interest tags from a user’s recent posts, then weight and embed them to drive device match scores and the word-cloud display.

The current main path is a three-stage timeline. Code entry: `components/interest-lab/`.

## Problem to solve

The product needs concrete topics you can open with in person — not vague buckets like “music / travel.”

Examples: “weekend pour-over,” “embedded Rust,” “sci-fi documentaries.”

It also needs to answer:

1. How often does this interest appear?
2. How recent is it?
3. Which posts support it?

Without an attribution chain, recency weights are hard to compute, and it is hard to evaluate whether inference is reliable.

## Why naive approaches fall short

Three approaches were tried in sequence.

**Scheme A: Per-post parallel extraction**

Good throughput and clear per-post attribution. But each post emits tags independently; near-duplicates are hard to merge, and a global view is missing.

**Scheme B: Rolling corpus compression**

Can carry a prior forward and save context. But after batch merges it is hard to stably return to individual posts; freshness weights become unreliable, and intermediate steps are hard to assert.

What is actually needed: keep post-level timestamps, do global semantic deduplication, and trace final tags back to source posts.

## Core design

Scheme C splits the work into three stages, then lets code compute weights:

```
Post input
  → Stage 1 parallel preprocess
  → Stage 2 timeline merge
  → Stage 3 tag extraction
  → Code aggregates frequency / sentiment / recency / weight
  → Embedding
  → Word cloud / device match
```

| Stage | What the model does | What code does |
| --- | --- | --- |
| 1 Preprocess | Detect spam/noise posts; compress into short summaries | Concurrent scheduling; filter noise |
| 2 Timeline merge | Merge semantically similar posts within ~7 days | Take the newest post’s time as the merge time |
| 3 Tag extraction | Produce icebreaker tags, sentiment, and source entries | Frequency, recency, weight, and pruning |

Product-facing icebreaker rules concentrate in stage 3. The first two stages are engineering preprocess and can be tuned independently without cascading changes.

Scheme A/B code remains for comparison, but the Web UI and `bench:timeline` both use Scheme C.

## Key mechanisms

### 1. Attribution chain

Tags are not finished by merely binding post IDs. The chain is:

```
Tag entryIds → timeline entry sourcePostIds → post createdAt
```

Thus frequency and recency are computed in code from real timestamps — the model does not verbally estimate freshness.

### 2. Timeline merge window

Content that is highly semantically similar within adjacent 7 days may merge, controlling context length.

Same-theme posts more than 7 days apart do not merge. That way frequency still reflects recurring interests across periods — e.g. coffee mentioned again weeks later.

If the model fails to merge, fall back to “one post, one entry.” Posts are not dropped; dedupe simply weakens.

### 3. Weight formula

Same-name tags merge by lowercase first, then three dimensions:

- **frequency**: expanded source-post count / total posts
- **sentiment**: mean sentiment across source entries
- **recency**: based on last occurrence, `exp(-λ × days_ago)`, λ = 0.08

Final:

```
weight = 0.40 × frequency + 0.20 × sentiment × recency + 0.40 × recency
```

Sentiment is multiplied by recency so older interests’ sentiment contribution also decays with time.

Filter rules:

- Keep only if it appears in at least 1 post
- Appears only once and older than 60 days → drop
- Take top 20 by weight

Coefficients and windows live in `constants.ts`.

### 4. Full re-run

Each “Infer and save” re-runs all three stages — no incremental skip.

The trade-off is reproducible results and avoiding rolling-prior drift. The cost is higher latency on long lists.

### 5. Embedding and word cloud

Vectors are built only from aggregated tag names. New tags are generated lazily.

Sphere size in the word cloud is relative rank after min-max normalization within the current batch — not a linear pixel map of absolute weight. Custom tags map absolute slider weights.

## Execution flow

```mermaid
flowchart LR
  P[Post list / X fetch] --> S1[Stage 1 preprocess]
  S1 --> S2[Stage 2 merge]
  S2 --> S3[Stage 3 extract]
  S3 --> A[Code aggregate]
  A --> E[Embedding]
  E --> U[Word cloud / match score]
```

Two input modes:

- Post list: paste, or import/export as `roadmate-posts/1` text
- X username: fetch original tweets via twitterapi.io into the same post schema

The post list is not written to localStorage. After refresh, re-import or re-fetch. The profile stores only tags and embeddings.

## Deliberately not done

- Do not treat Scheme A/B as the main path. They are comparison only.
- Do not let the model emit final weight directly. Frequency and recency are computed in code.
- Do not do incremental inference. Prefer reproducibility and evaluability first.
- Do not persist raw post text into the browser profile.

## Relationship to other modules

After inference writes the local profile, Playground computes match score via embedding cosine and tag overlap.

The device side does not care about three-stage details — it only consumes final tag vectors. The split lets “who is worth approaching” and “how to feedback while approaching” iterate independently.

Device interaction: [Device Playground design](./device-playground.md).

## Evaluation

CLI and Web UI share the same pipeline:

```bash
npm run bench:timeline
npm run bench:timeline -- --verbose
npm run bench:timeline -- --case multi-theme-user
```

Cases live in `scripts/fixtures/corpus-cases/`. Assertions can check keyword hits, banned words, tag count, and minimum valid-post floor.

`--verbose` prints per-post noise judgments, merge entries, and the final weight table — useful for locating which stage went wrong.

## Tuning entry points

| Constant | Role |
| --- | --- |
| `WEIGHT_FACTORS` | Three-dimension weight ratios |
| `RECENCY_DECAY_LAMBDA` | Steepness of time decay |
| `TIMELINE_MERGE_WINDOW_DAYS` | Merge window |
| `MAX_INFERRED_TAGS` / `STALE_TAG_DAYS` / `LLM_CONCURRENCY` | Output cap, stale pruning, concurrency |

Orchestration and prompts mainly live in:

- `server/timelineInference.ts`
- `prompts.ts`
- `tagUtils.ts`
- `api/openrouter.ts`

## Summary

The core of this inference design:

> Preserve post-level time attribution first, then do global semantic dedupe, and finally compute reproducible interest weights in code.

Concretely:

- Stage 1 preserves throughput and noise filtering
- Stage 2 controls duplicates and context length
- Stage 3 produces icebreaker-worthy tags
- Code owns frequency / recency / weight and connects embeddings

The result: tags that are more concrete, more explainable, and more evaluable — and that stably drive near-field matching.
