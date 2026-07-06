"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IphoneAppFrame, IPHONE_FRAME, IphonePreviewSlot, useJourneyTransition } from "@/components/journey";
import { TagWordCloud, TagWordCloudAddOrb, type TagWordCloudHandle } from "@/components/tag-word-cloud";
import { CustomTagWeightRail } from "./CustomTagWeightRail";
import { PostListEditor } from "./PostListEditor";
import { embedTags, extractTagsFromPosts, refineAggregatedTags } from "./api/openrouter";
import { fetchUserTweets } from "./api/twitter";
import { MAX_TWEETS_FETCH } from "./constants";
import {
  applyExtractedTags,
  clearPostInference,
  getUnprocessedPosts,
  mergePosts,
  tweetsToPosts,
} from "./postUtils";
import {
  deleteProfile,
  loadProfiles,
  saveProfile,
} from "./storage";
import {
  aggregateTagsFromPosts,
  applyTagRefinement,
  buildProfileEmbeddings,
  createCustomTag,
  interestTagsToWordCloud,
} from "./tagUtils";
import type { InputMode, InterestTag, PostRecord, StoredInterestProfile } from "./types";

type Step = "idle" | "fetching" | "analyzing" | "embedding" | "done" | "error";
type FetchStatus = "idle" | "fetching" | "done" | "error";

const IPHONE_CONTENT_HEIGHT = IPHONE_FRAME.compact.contentHeight;

export function InterestLab() {
  const headerRef = useRef<HTMLElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const previewAsideRef = useRef<HTMLElement>(null);
  const iphoneFrameRef = useRef<HTMLDivElement>(null);
  const wordCloudRef = useRef<TagWordCloudHandle>(null);

  const { startTransition, isTransitioning } = useJourneyTransition();

  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [twitterPosts, setTwitterPosts] = useState<PostRecord[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [pastePosts, setPastePosts] = useState<PostRecord[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredInterestProfile | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<StoredInterestProfile[]>([]);
  const [showJson, setShowJson] = useState(false);
  const [selectedCustomTagId, setSelectedCustomTagId] = useState<string | null>(null);

  useEffect(() => {
    const profiles = loadProfiles();
    setSavedProfiles(profiles);
    if (profiles[0]) {
      setProfile(profiles[0]);
      if (profiles[0].source.type === "twitter") {
        setTwitterHandle(profiles[0].source.handle ?? "");
      }
      setStep("done");
    }
  }, []);

  const persistProfile = useCallback((next: StoredInterestProfile) => {
    setProfile(next);
    setSavedProfiles(saveProfile(next));
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
        return "正在从 twitterapi.io 拉取帖子…";
      case "analyzing":
        return analyzeProgress
          ? `逐帖分析中 ${analyzeProgress.done}/${analyzeProgress.total}…`
          : "正在逐帖推断标签…";
      case "embedding":
        return "正在生成新标签向量…";
      case "done":
        return "完成";
      case "error":
        return "出错";
      default:
        return "就绪";
    }
  }, [analyzeProgress, step]);

  const handleFetchTwitter = async () => {
    setFetchMessage(null);
    setFetchStatus("idle");
    setError(null);

    const handle = twitterHandle.replace(/^@/, "").trim();
    if (!handle) {
      setFetchStatus("error");
      setFetchMessage("请输入有效的 X 用户名");
      return;
    }

    const handleChanged =
      profile?.source.type === "twitter" && profile.source.handle !== handle;

    try {
      setFetchStatus("fetching");
      const { tweets, truncated } = await fetchUserTweets(twitterHandle);
      const incoming = tweetsToPosts(tweets);
      const basePosts = handleChanged ? [] : twitterPosts;
      const merged = mergePosts(basePosts, incoming);
      setTwitterPosts(merged);
      setFetchStatus("done");
      const limitHint = truncated ? `（已达上限 ${MAX_TWEETS_FETCH} 条）` : "";
      setFetchMessage(`已拉取 ${incoming.length} 条，列表共 ${merged.length} 条${limitHint}`);

      if (handleChanged && profile) {
        const customTags = profile.tags.filter((tag) => tag.custom);
        const customNames = new Set(customTags.map((tag) => tag.name));
        persistProfile({
          ...profile,
          source: { type: "twitter", handle },
          posts: undefined,
          tags: customTags,
          embeddings: profile.embeddings.filter((item) => customNames.has(item.name)),
          updatedAt: new Date().toISOString(),
        });
        setStep("idle");
        setSelectedCustomTagId(null);
      }
    } catch (err) {
      setFetchStatus("error");
      setFetchMessage(err instanceof Error ? err.message : "拉取失败");
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setStep("idle");
    setAnalyzeProgress(null);

    try {
      let sourcePosts: PostRecord[] = [];
      let source: StoredInterestProfile["source"] = { type: "paste" };
      const handle = twitterHandle.replace(/^@/, "").trim();

      if (inputMode === "twitter") {
        if (!handle) {
          throw new Error("请输入有效的 X 用户名");
        }
        sourcePosts = twitterPosts.filter((post) => post.text.trim());
        if (sourcePosts.length === 0) {
          throw new Error("请先点击「拉取帖子」，或确认列表中有内容");
        }
        source = { type: "twitter", handle };
      } else {
        sourcePosts = pastePosts.filter((post) => post.text.trim());
        if (sourcePosts.length === 0) {
          throw new Error("请至少添加一条帖子");
        }
      }

      const canReuseProfile =
        profile &&
        ((source.type === "twitter" &&
          profile.source.type === "twitter" &&
          profile.source.handle === handle) ||
          (source.type === "paste" && profile.source.type === "paste"));

      const mergedPosts = sourcePosts;
      const unprocessed = getUnprocessedPosts(mergedPosts);

      if (unprocessed.length === 0 && sourcePosts.length > 0) {
        throw new Error("没有新帖子需要分析，请添加或修改帖子内容");
      }

      setStep("analyzing");
      setAnalyzeProgress({ done: 0, total: unprocessed.length });

      const extractionResults = await extractTagsFromPosts(
        unprocessed.map((post) => ({ id: post.id, text: post.text })),
        {
          onProgress: (done, total) => setAnalyzeProgress({ done, total }),
        },
      );

      const postsWithTags = applyExtractedTags(mergedPosts, extractionResults);
      const aggregatedTags = aggregateTagsFromPosts(postsWithTags);

      let inferredTags = aggregatedTags;
      if (aggregatedTags.length >= 2) {
        const keepNames = await refineAggregatedTags(
          aggregatedTags.map((tag) => ({ name: tag.name, postCount: tag.postCount ?? 1 })),
        );
        if (keepNames && keepNames.length > 0) {
          const refined = applyTagRefinement(aggregatedTags, keepNames);
          if (refined.length > 0) inferredTags = refined;
        }
      }

      if (inferredTags.length === 0) {
        const hadExtractions = postsWithTags.some((post) => (post.tags?.length ?? 0) > 0);
        throw new Error(
          hadExtractions
            ? "提取到的标签经去泛化后无剩余，请点击「清空标签」后重新推断，或补充更具体的帖子"
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
        posts: postsWithTags,
        tags,
        embeddings,
        tweetCount: source.type === "twitter" ? postsWithTags.length : undefined,
      };

      if (inputMode === "paste") {
        setPastePosts(postsWithTags);
      } else {
        setTwitterPosts(postsWithTags);
      }

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
    (posts: PostRecord[]) => {
      setPastePosts(posts);
      setStep("idle");
      setError(null);
      setSelectedCustomTagId(null);

      if (!profile) return;

      const customTags = profile.tags.filter((tag) => tag.custom);
      const customNames = new Set(customTags.map((tag) => tag.name));
      persistProfile({
        ...profile,
        source: { type: "paste" },
        posts: undefined,
        tags: customTags,
        embeddings: profile.embeddings.filter((item) => customNames.has(item.name)),
        updatedAt: new Date().toISOString(),
      });
    },
    [persistProfile, profile],
  );

  const handleImportTwitterPosts = useCallback(
    (posts: PostRecord[]) => {
      setTwitterPosts(posts);
      setFetchStatus("idle");
      setFetchMessage(null);
      setStep("idle");
      setError(null);
      setSelectedCustomTagId(null);

      if (!profile) return;

      const customTags = profile.tags.filter((tag) => tag.custom);
      const customNames = new Set(customTags.map((tag) => tag.name));
      persistProfile({
        ...profile,
        source: { type: "twitter", handle: twitterHandle.replace(/^@/, "").trim() || undefined },
        posts: undefined,
        tags: customTags,
        embeddings: profile.embeddings.filter((item) => customNames.has(item.name)),
        updatedAt: new Date().toISOString(),
      });
    },
    [persistProfile, profile, twitterHandle],
  );

  const loadSavedProfile = (item: StoredInterestProfile) => {
    setProfile(item);
    setStep("done");
    setError(null);
    setSelectedCustomTagId(null);
    setPastePosts([]);
    setTwitterPosts([]);
    setFetchStatus("idle");
    setFetchMessage(null);
    if (item.source.type === "paste") {
      setInputMode("paste");
    } else if (item.source.type === "twitter") {
      setTwitterHandle(item.source.handle ?? "");
      setInputMode("twitter");
    }
  };

  const handleDeleteProfile = (id: string) => {
    setSavedProfiles(deleteProfile(id));
    if (profile?.id === id) setProfile(null);
  };

  const handleClearTags = useCallback(() => {
    const sourcePosts =
      inputMode === "paste" ? pastePosts : twitterPosts.length > 0 ? twitterPosts : (profile?.posts ?? []);
    const clearedPosts = clearPostInference(sourcePosts);

    if (inputMode === "paste") {
      setPastePosts(clearedPosts);
    } else {
      setTwitterPosts(clearedPosts);
    }

    if (profile) {
      persistProfile({
        ...profile,
        tags: [],
        embeddings: [],
        posts: clearedPosts,
        updatedAt: new Date().toISOString(),
      });
    }

    setSelectedCustomTagId(null);
    setStep("idle");
    setError(null);
  }, [inputMode, pastePosts, persistProfile, profile, twitterPosts]);

  const canClearTags = useMemo(() => {
    const posts =
      inputMode === "paste" ? pastePosts : twitterPosts.length > 0 ? twitterPosts : (profile?.posts ?? []);
    const hasInferredPosts = posts.some((post) => post.extractedAt || (post.tags?.length ?? 0) > 0);
    const hasTags = (profile?.tags.length ?? 0) > 0;
    return hasInferredPosts || hasTags;
  }, [inputMode, pastePosts, profile, twitterPosts]);

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

  const isBusy =
    step === "fetching" || step === "analyzing" || step === "embedding" || fetchStatus === "fetching";
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
            逐帖推断兴趣标签并聚合权重，右侧 App 预览词云；完成后进入近场设备雷达。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/tag-cloud"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            词云测试 →
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:gap-6">
        <div
          ref={leftPanelRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:min-h-0"
        >
          <div className="flex flex-col gap-4 pb-1">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setInputMode("paste")}
                className={`rounded-full px-3 py-1 text-sm ${
                  inputMode === "paste"
                    ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                帖子列表
              </button>
              <button
                type="button"
                onClick={() => setInputMode("twitter")}
                className={`rounded-full px-3 py-1 text-sm ${
                  inputMode === "twitter"
                    ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                X 用户名
              </button>
            </div>

            {inputMode === "twitter" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[200px] flex-1 text-xs text-zinc-500">
                    X 用户名
                    <input
                      value={twitterHandle}
                      onChange={(event) => setTwitterHandle(event.target.value)}
                      placeholder="elonmusk 或 @elonmusk"
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={isBusy || isTransitioning}
                    onClick={handleFetchTwitter}
                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {fetchStatus === "fetching" ? "拉取中…" : "拉取帖子"}
                  </button>
                </div>
                {fetchMessage ? (
                  <p
                    className={`text-xs ${fetchStatus === "error" ? "text-red-400/90" : "text-emerald-400/90"}`}
                    role="status"
                  >
                    {fetchMessage}
                  </p>
                ) : null}
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
                  拉取原创推文（1 次请求、最多 {MAX_TWEETS_FETCH} 条，免费 Key 自动重试限流）
                </p>
                <PostListEditor
                  posts={twitterPosts}
                  onChange={setTwitterPosts}
                  onImport={handleImportTwitterPosts}
                  disabled={isBusy || isTransitioning}
                />
              </div>
            ) : (
              <PostListEditor
                posts={pastePosts}
                onChange={setPastePosts}
                onImport={handleImportPosts}
                disabled={isBusy || isTransitioning}
              />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isBusy || isTransitioning}
                onClick={handleGenerate}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? "处理中…" : "推断并保存"}
              </button>
              <button
                type="button"
                disabled={isBusy || isTransitioning || !canClearTags}
                onClick={handleClearTags}
                title="清除词云与逐帖推断结果，帖子内容保留在列表中"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空标签
              </button>
              <span className="text-xs text-zinc-500">{statusText}</span>
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </section>

          {savedProfiles.length > 0 ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="mb-3 text-sm font-medium text-zinc-200">
                本地历史（{savedProfiles.length}）
              </h2>
              <ul className="space-y-2">
                {savedProfiles.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => loadSavedProfile(item)}
                      className="text-left text-sm text-zinc-300 hover:text-white"
                    >
                      {item.source.type === "twitter" ? `@${item.source.handle}` : "帖子列表"} ·{" "}
                      {item.tags.length} 标签
                      {item.posts?.length ? ` · ${item.posts.length} 帖` : ""} ·{" "}
                      <span suppressHydrationWarning>
                        {new Date(item.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProfile(item.id)}
                      className="text-xs text-zinc-500 hover:text-red-300"
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="pb-2 pr-4">标签</th>
                      <th className="pb-2 pr-4">权重</th>
                      <th className="pb-2 pr-4">帖数</th>
                      <th className="pb-2">频次</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {profile.tags.slice(0, 8).map((tag) => (
                      <tr key={tag.name} className="border-t border-zinc-800/80">
                        <td className="py-2 pr-4 font-medium">{tag.name}</td>
                        <td className="py-2 pr-4 font-mono text-cyan-300">
                          {tag.weight.toFixed(3)}
                        </td>
                        <td className="py-2 pr-4 font-mono text-zinc-400">
                          {tag.custom ? "—" : (tag.postCount ?? "—")}
                        </td>
                        <td className="py-2 font-mono">{tag.frequency.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    emptyMessage="点击顶部 + 添加自定义标签，或完成推断后显示词云"
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
                  : "请先完成兴趣标签推断"
              }
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 px-6 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-400 hover:to-emerald-300 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
            >
              {isTransitioning ? "正在进入近场雷达…" : "进入近场雷达 →"}
            </button>
            {!profile ? (
              <p className="mt-2 text-center text-xs text-zinc-500">
                完成推断后，词云将注入 App 并过渡到设备画布
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
