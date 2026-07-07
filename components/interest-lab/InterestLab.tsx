"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IphoneAppFrame, IPHONE_FRAME, IphonePreviewSlot, useJourneyTransition } from "@/components/journey";
import { TagWordCloud, TagWordCloudAddOrb, type TagWordCloudHandle } from "@/components/tag-word-cloud";
import { CustomTagWeightRail } from "./CustomTagWeightRail";
import { PostListEditor } from "./PostListEditor";
import { embedTags, inferTagsFromTimeline } from "./api/openrouter";
import { fetchUserTweets } from "./api/twitter";
import { MAX_TWEETS_FETCH } from "./constants";
import {
  applyTimelineInference,
  getEligiblePosts,
  timelineResultToInterestTags,
} from "./timelineUtils";
import {
  tweetsToPosts,
} from "./postUtils";
import { loadDraft, loadProfiles, saveDraft, saveProfile } from "./storage";
import {
  buildProfileEmbeddings,
  createCustomTag,
  interestTagsToWordCloud,
} from "./tagUtils";
import type {
  InterestTag,
  PostRecord,
  StoredInterestProfile,
  TimelineInferenceProgress,
} from "./types";

type Step = "idle" | "fetching" | "analyzing" | "embedding" | "done" | "error";

const IPHONE_CONTENT_HEIGHT = IPHONE_FRAME.compact.contentHeight;

const STAGE_LABELS: Record<TimelineInferenceProgress["stage"], string> = {
  preprocess: "预处理",
  merge: "时间线合并",
  extract: "标签提取",
};

export function InterestLab() {
  const headerRef = useRef<HTMLElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const previewAsideRef = useRef<HTMLElement>(null);
  const iphoneFrameRef = useRef<HTMLDivElement>(null);
  const wordCloudRef = useRef<TagWordCloudHandle>(null);

  const { startTransition, isTransitioning } = useJourneyTransition();

  const [twitterHandle, setTwitterHandle] = useState("");
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [analyzeProgress, setAnalyzeProgress] = useState<TimelineInferenceProgress | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredInterestProfile | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [selectedCustomTagId, setSelectedCustomTagId] = useState<string | null>(null);
  const skipDraftSaveRef = useRef(true);

  useEffect(() => {
    const draft = loadDraft();
    setPosts(draft.posts);
    setTwitterHandle(draft.twitterHandle);

    const profiles = loadProfiles();
    if (profiles[0]) {
      const loaded = profiles[0];
      setProfile(loaded);
      setPosts((current) => (current.length > 0 ? current : (loaded.posts ?? [])));
      setTwitterHandle((current) => {
        if (current.trim()) return current;
        return loaded.source.type === "twitter" ? (loaded.source.handle ?? "") : "";
      });
      setStep(loaded.tags.length > 0 ? "done" : "idle");
    }
  }, []);

  useEffect(() => {
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    saveDraft({ posts, twitterHandle });
  }, [posts, twitterHandle]);

  const persistProfile = useCallback((next: StoredInterestProfile) => {
    setProfile(next);
    saveProfile(next);
  }, []);

  const wordCloudTags = useMemo(
    () => (profile ? interestTagsToWordCloud(profile.tags) : []),
    [profile],
  );

  const selectedCustomTag = useMemo(() => {
    if (!profile || !selectedCustomTagId) return null;
    return profile.tags.find((tag) => tag.custom && tag.id === selectedCustomTagId) ?? null;
  }, [profile, selectedCustomTagId]);

  const updateProfileTags = useCallback(
    (updater: (tags: InterestTag[]) => InterestTag[]) => {
      if (!profile) return;
      const nextTags = updater(profile.tags);
      persistProfile({ ...profile, tags: nextTags });
    },
    [persistProfile, profile],
  );

  const handleAddCustomTag = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const duplicate = profile?.tags.some(
        (tag) => tag.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (duplicate) {
        setError("该标签已存在");
        return;
      }

      setError(null);
      const newTag = createCustomTag(trimmed);

      if (profile) {
        persistProfile({ ...profile, tags: [...profile.tags, newTag] });
      } else {
        const nextProfile: StoredInterestProfile = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          source: { type: "paste" },
          tags: [newTag],
          embeddings: [],
        };
        persistProfile(nextProfile);
        setStep("done");
      }

      setSelectedCustomTagId(newTag.id ?? null);
    },
    [persistProfile, profile],
  );

  const handleCustomTagWeightChange = useCallback(
    (weight: number) => {
      if (!selectedCustomTagId) return;
      updateProfileTags((tags) =>
        tags.map((tag) =>
          tag.custom && tag.id === selectedCustomTagId ? { ...tag, weight } : tag,
        ),
      );
    },
    [selectedCustomTagId, updateProfileTags],
  );

  const handleRemoveCustomTag = useCallback(() => {
    if (!selectedCustomTagId) return;
    updateProfileTags((tags) => tags.filter((tag) => tag.id !== selectedCustomTagId));
    setSelectedCustomTagId(null);
  }, [selectedCustomTagId, updateProfileTags]);

  const statusText = useMemo(() => {
    switch (step) {
      case "fetching":
        return "正在获取 X 动态…";
      case "analyzing":
        return analyzeProgress
          ? `${STAGE_LABELS[analyzeProgress.stage]} ${analyzeProgress.done}/${analyzeProgress.total}…`
          : "正在推断兴趣标签…";
      case "embedding":
        return "正在生成标签向量…";
      default:
        return null;
    }
  }, [analyzeProgress, step]);

  const handleFetchTwitter = async () => {
    setFetchMessage(null);
    setError(null);

    const handle = twitterHandle.replace(/^@/, "").trim();
    if (!handle) {
      setFetchMessage("请输入有效的 X 用户名");
      return;
    }

    try {
      setStep("fetching");
      const { tweets, truncated } = await fetchUserTweets(twitterHandle);
      const incoming = tweetsToPosts(tweets).filter((post) => post.text.trim());
      if (incoming.length === 0) {
        throw new Error("未能从该 X 账号获取到有效动态");
      }
      setPosts(incoming);
      setStep("idle");
      const limitHint = truncated ? `（已达上限 ${MAX_TWEETS_FETCH} 条）` : "";
      setFetchMessage(`已获取 ${incoming.length} 条动态${limitHint}`);

      if (profile) {
        const customTags = profile.tags.filter((tag) => tag.custom);
        const customNames = new Set(customTags.map((tag) => tag.name));
        persistProfile({
          ...profile,
          source: { type: "twitter", handle },
          posts: incoming,
          tags: customTags,
          embeddings: profile.embeddings.filter((item) => customNames.has(item.name)),
          updatedAt: new Date().toISOString(),
        });
        setSelectedCustomTagId(null);
      }
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "获取失败");
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setStep("idle");
    setAnalyzeProgress(null);

    try {
      const handle = twitterHandle.replace(/^@/, "").trim();
      const sourcePosts = posts.filter((post) => post.text.trim());
      if (sourcePosts.length === 0) {
        throw new Error("请先获取动态、添加帖子，或从文件导入");
      }
      const source: StoredInterestProfile["source"] = handle
        ? { type: "twitter", handle }
        : { type: "paste" };

      const canReuseProfile =
        profile &&
        ((source.type === "twitter" &&
          profile.source.type === "twitter" &&
          profile.source.handle === handle) ||
          (source.type === "paste" && profile.source.type === "paste"));

      const mergedPosts = sourcePosts;
      const eligiblePosts = getEligiblePosts(mergedPosts);

      if (eligiblePosts.length === 0) {
        throw new Error("请至少添加一条有内容的帖子");
      }

      setStep("analyzing");
      setAnalyzeProgress({ stage: "preprocess", done: 0, total: 1 });

      const timelineResult = await inferTagsFromTimeline(mergedPosts, {
        onProgress: (progress) => setAnalyzeProgress(progress),
      });

      const postsWithInference = applyTimelineInference(mergedPosts, timelineResult);
      const inferredTags = timelineResultToInterestTags(timelineResult, mergedPosts);

      if (inferredTags.length === 0) {
        throw new Error(
          timelineResult.tags.length > 0
            ? "提取到的标签经去泛化后无剩余，请点击「清空」后重新推断，或补充更具体的帖子"
            : "未能从帖子中提取到有效兴趣标签，请尝试更丰富的内容",
        );
      }

      const customTags = (canReuseProfile ? profile?.tags : [])?.filter((tag) => tag.custom) ?? [];
      const tags = [...inferredTags, ...customTags];

      setStep("embedding");
      const existingEmbeddings = canReuseProfile ? (profile?.embeddings ?? []) : [];
      const existingNames = new Set(existingEmbeddings.map((item) => item.name));
      const namesToEmbed = inferredTags
        .map((tag) => tag.name)
        .filter((name) => !existingNames.has(name));

      const vectors = await embedTags(namesToEmbed);
      const newlyEmbedded = namesToEmbed.map((name, index) => ({
        name,
        vector: vectors[index] ?? [],
      }));
      const embeddings = buildProfileEmbeddings(tags, existingEmbeddings, newlyEmbedded);

      const now = new Date().toISOString();
      const nextProfile: StoredInterestProfile = {
        id: canReuseProfile && profile ? profile.id : crypto.randomUUID(),
        createdAt: canReuseProfile && profile ? profile.createdAt : now,
        updatedAt: now,
        source,
        posts: postsWithInference,
        tags,
        embeddings,
        tweetCount: source.type === "twitter" ? postsWithInference.length : undefined,
      };

      setPosts(postsWithInference);
      setSelectedCustomTagId(null);
      persistProfile(nextProfile);
      setAnalyzeProgress(null);
      setStep("done");
    } catch (err) {
      setAnalyzeProgress(null);
      setStep("error");
      setError(err instanceof Error ? err.message : "未知错误");
    }
  };

  const handleImportPosts = useCallback(
    (imported: PostRecord[], _filename: string) => {
      setPosts(imported);
      setStep("idle");
      setError(null);
      setSelectedCustomTagId(null);

      if (!profile) return;

      persistProfile({
        ...profile,
        source: { type: "paste" },
        posts: imported,
        tags: [],
        embeddings: [],
        updatedAt: new Date().toISOString(),
      });
    },
    [persistProfile, profile],
  );

  const handleClearTags = useCallback(() => {
    setPosts([]);
    setTwitterHandle("");
    setFetchMessage(null);
    setSelectedCustomTagId(null);
    setStep("idle");
    setError(null);

    if (profile) {
      persistProfile({
        ...profile,
        source: { type: "paste" },
        tags: [],
        embeddings: [],
        posts: undefined,
        tweetCount: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [persistProfile, profile]);

  const canClearTags = useMemo(() => {
    const hasPosts = posts.length > 0 || (profile?.posts?.length ?? 0) > 0;
    const hasHandle = twitterHandle.trim().length > 0;
    const hasTags = (profile?.tags.length ?? 0) > 0;
    return hasPosts || hasHandle || hasTags;
  }, [posts, profile, twitterHandle]);

  const handleEnterPlayground = () => {
    if (
      !profile ||
      !headerRef.current ||
      !leftPanelRef.current ||
      !previewAsideRef.current ||
      !iphoneFrameRef.current ||
      !wordCloudRef.current
    ) {
      return;
    }

    const tagSnapshots = wordCloudRef.current.freezeAndSnapshot();
    if (tagSnapshots.length === 0) return;

    startTransition({
      header: headerRef.current,
      leftPanel: leftPanelRef.current,
      previewAside: previewAsideRef.current,
      iphoneFrame: iphoneFrameRef.current,
      tagSnapshots,
      tagNames: profile.tags.map((tag) => tag.name),
      ownerProfile: {
        tags: profile.tags,
        embeddings: profile.embeddings,
      },
    });
  };

  const jsonPreview = profile
    ? JSON.stringify(
        {
          tags: profile.tags,
          embeddings: profile.embeddings.map((item) => ({
            name: item.name,
            dim: item.vector.length,
            vector: item.vector,
          })),
        },
        null,
        2,
      )
    : "";

  const isBusy = step === "fetching" || step === "analyzing" || step === "embedding";
  const canEnterPlayground = Boolean(profile?.tags.length) && step === "done" && !isTransitioning;

  return (
    <div className="interest-lab mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col gap-4 overflow-hidden px-4 py-4 lg:px-8">
      <header
        ref={headerRef}
        className="flex shrink-0 flex-wrap items-start justify-between gap-3"
      >
        <div>
          <p className="text-xs uppercase tracking-widest text-cyan-400/80">Roadmate · Step 1</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-100">兴趣标签推断</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            从 X 或本地帖子推断兴趣标签，右侧预览词云后进入近场雷达。
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-6">
        <div
          ref={leftPanelRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:min-h-0"
        >
          <div className="flex flex-col gap-4 pb-1">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1 text-xs text-zinc-500">
                  X 用户名
                  <span className="ml-1 text-zinc-600">（选填）</span>
                  <input
                    value={twitterHandle}
                    onChange={(event) => setTwitterHandle(event.target.value)}
                    placeholder="elonmusk 或 @elonmusk"
                    disabled={isBusy || isTransitioning}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60 disabled:opacity-50"
                  />
                </label>
                <button
                  type="button"
                  disabled={isBusy || isTransitioning || !twitterHandle.trim()}
                  onClick={handleFetchTwitter}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {step === "fetching" ? "获取中…" : "获取动态"}
                </button>
              </div>
              {fetchMessage ? (
                <p className="text-xs text-emerald-400/90" role="status">
                  {fetchMessage}
                </p>
              ) : null}
              {twitterHandle.trim() ? (
                <p className="text-xs text-zinc-500">
                  通过{" "}
                  <a
                    href="https://twitterapi.io/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400/80 underline-offset-2 hover:text-cyan-300 hover:underline"
                  >
                    twitterapi.io
                  </a>{" "}
                  获取原创动态（最多 {MAX_TWEETS_FETCH} 条）
                </p>
              ) : null}
              <PostListEditor
                posts={posts}
                onChange={setPosts}
                onImport={handleImportPosts}
                disabled={isBusy || isTransitioning}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isBusy || isTransitioning}
                onClick={handleGenerate}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? "处理中…" : "AI 推断"}
              </button>
              <button
                type="button"
                disabled={isBusy || isTransitioning || !canClearTags}
                onClick={handleClearTags}
                title="清空帖子、X 用户名与推断结果"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空
              </button>
              {statusText ? (
                <span className="text-xs text-zinc-500">{statusText}</span>
              ) : null}
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </section>

          {profile ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-200">结构化结果</h2>
                <button
                  type="button"
                  onClick={() => setShowJson((value) => !value)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  {showJson ? "收起" : "展开"} JSON
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="pb-2 pr-3">标签</th>
                      <th className="pb-2 pr-3 font-mono">frequency</th>
                      <th className="pb-2 pr-3 font-mono">sentiment</th>
                      <th className="pb-2 pr-3 font-mono">recency</th>
                      <th className="pb-2 pr-3 font-mono">weight</th>
                      <th className="pb-2 font-mono">entries</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {profile.tags
                      .filter((tag) => !tag.custom)
                      .map((tag) => (
                        <tr key={tag.name} className="border-t border-zinc-800/80">
                          <td className="py-2 pr-3 font-medium">{tag.name}</td>
                          <td className="py-2 pr-3 font-mono">{tag.frequency.toFixed(3)}</td>
                          <td className="py-2 pr-3 font-mono">{tag.sentiment.toFixed(3)}</td>
                          <td className="py-2 pr-3 font-mono">{tag.recency.toFixed(3)}</td>
                          <td className="py-2 pr-3 font-mono text-cyan-300">{tag.weight.toFixed(3)}</td>
                          <td className="py-2 font-mono text-zinc-400">{tag.postCount ?? 0}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {profile.tags.some((tag) => tag.custom) ? (
                  <div className="mt-4 border-t border-zinc-800/80 pt-3">
                    <p className="mb-2 text-[11px] text-zinc-500">自定义标签（仅 weight 可调）</p>
                    <ul className="space-y-1 text-xs text-zinc-400">
                      {profile.tags
                        .filter((tag) => tag.custom)
                        .map((tag) => (
                          <li key={tag.id ?? tag.name} className="flex justify-between gap-4">
                            <span>{tag.name}</span>
                            <span className="font-mono text-cyan-300">{tag.weight.toFixed(3)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {showJson ? (
                <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                  {jsonPreview}
                </pre>
              ) : null}
            </section>
          ) : null}
          </div>
        </div>

        <aside
          ref={previewAsideRef}
          className="flex min-h-[240px] max-h-[42dvh] shrink-0 flex-col gap-3 overflow-hidden lg:max-h-none lg:min-h-0 lg:shrink lg:self-stretch"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-zinc-200">
                App 预览
                {profile
                  ? ` · ${profile.tags.length} 标签${(profile.posts?.length ?? profile.tweetCount) ? ` · ${profile.posts?.length ?? profile.tweetCount} 帖` : ""}`
                  : ""}
              </h2>
            </div>
            <IphonePreviewSlot>
              <IphoneAppFrame ref={iphoneFrameRef} size="compact">
                <div className="relative h-full min-h-0 overflow-hidden">
                  <TagWordCloud
                    ref={wordCloudRef}
                    tags={wordCloudTags}
                    height={IPHONE_CONTENT_HEIGHT}
                    size="compact"
                    interactive={!isTransitioning}
                    enableCustomTags
                    selectedTagId={selectedCustomTagId}
                    onSelectTag={setSelectedCustomTagId}
                    className="h-full border-0 rounded-none"
                    emptyMessage="点击顶部 + 添加自定义标签，或 AI 推断后显示词云"
                  />
                  <div className="pointer-events-auto absolute inset-x-0 top-0 z-30">
                    {selectedCustomTag ? (
                      <CustomTagWeightRail
                        inScreen
                        tagName={selectedCustomTag.name}
                        weight={selectedCustomTag.weight}
                        onWeightChange={handleCustomTagWeightChange}
                        onRemove={handleRemoveCustomTag}
                      />
                    ) : (
                      <TagWordCloudAddOrb
                        inScreen
                        disabled={isTransitioning}
                        onSubmit={handleAddCustomTag}
                      />
                    )}
                  </div>
                </div>
              </IphoneAppFrame>
            </IphonePreviewSlot>
          </div>

          <div className="z-20 shrink-0">
            <button
              type="button"
              disabled={!canEnterPlayground}
              onClick={handleEnterPlayground}
              title={
                canEnterPlayground
                  ? "将词云注入设备并进入近场雷达"
                  : "请先 AI 推断兴趣标签"
              }
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 px-6 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-400 hover:to-emerald-300 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
            >
              {isTransitioning ? "正在进入近场雷达…" : "进入近场雷达 →"}
            </button>
            {!profile ? (
              <p className="mt-2 text-center text-xs text-zinc-500">
                AI 推断后，词云将注入 App 并过渡到设备画布
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
