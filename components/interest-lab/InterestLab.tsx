"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { embedTags, extractTagsWithLlm } from "./api/openrouter";
import { fetchUserTweets, tweetsToCorpus } from "./api/twitter";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_LLM_MODEL } from "./constants";
import {
  deleteProfile,
  loadApiKeys,
  loadProfiles,
  loadSettings,
  saveApiKeys,
  saveProfile,
  saveSettings,
} from "./storage";
import { TagWordCloud } from "@/components/tag-word-cloud";
import { draftsToTags } from "./tagUtils";
import type { InputMode, StoredInterestProfile } from "./types";

type Step = "idle" | "fetching" | "analyzing" | "embedding" | "done" | "error";

export function InterestLab() {
  const [apiKeys, setApiKeys] = useState(() => loadApiKeys());
  const [llmModel, setLlmModel] = useState(() => loadSettings().llmModel || DEFAULT_LLM_MODEL);
  const [embeddingModel, setEmbeddingModel] = useState(
    () => loadSettings().embeddingModel || DEFAULT_EMBEDDING_MODEL,
  );
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredInterestProfile | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<StoredInterestProfile[]>([]);
  const [showJson, setShowJson] = useState(true);

  useEffect(() => {
    const profiles = loadProfiles();
    setSavedProfiles(profiles);
    if (profiles[0]) {
      setProfile(profiles[0]);
      setStep("done");
    }
  }, []);

  const persistKeys = useCallback((next: typeof apiKeys) => {
    setApiKeys(next);
    saveApiKeys(next);
  }, []);

  const persistSettings = useCallback((llm: string, embedding: string) => {
    setLlmModel(llm);
    setEmbeddingModel(embedding);
    saveSettings({ llmModel: llm, embeddingModel: embedding });
  }, []);

  const statusText = useMemo(() => {
    switch (step) {
      case "fetching":
        return "正在从 twitterapi.io 拉取帖子…";
      case "analyzing":
        return "OpenRouter LLM 正在推断兴趣标签…";
      case "embedding":
        return "OpenRouter 正在生成标签向量…";
      case "done":
        return "完成";
      case "error":
        return "出错";
      default:
        return "就绪";
    }
  }, [step]);

  const handleGenerate = async () => {
    setError(null);
    setStep("idle");

    if (!apiKeys.openRouterKey.trim()) {
      setError("请先填写 OpenRouter API Key");
      setStep("error");
      return;
    }

    try {
      let corpus = pasteText.trim();
      let source: StoredInterestProfile["source"] = { type: "paste" };
      let tweetCount: number | undefined;

      if (inputMode === "twitter") {
        if (!apiKeys.twitterApiKey.trim()) {
          throw new Error("Twitter 模式需要填写 twitterapi.io API Key");
        }
        setStep("fetching");
        const tweets = await fetchUserTweets(twitterHandle, apiKeys.twitterApiKey);
        corpus = tweetsToCorpus(tweets);
        tweetCount = tweets.length;
        source = { type: "twitter", handle: twitterHandle.replace(/^@/, "") };
      } else if (!corpus) {
        throw new Error("请粘贴测试文本");
      }

      setStep("analyzing");
      const drafts = await extractTagsWithLlm(corpus, apiKeys.openRouterKey, llmModel);
      const tags = draftsToTags(drafts);

      setStep("embedding");
      const vectors = await embedTags(
        tags.map((tag) => tag.name),
        apiKeys.openRouterKey,
        embeddingModel,
      );

      const nextProfile: StoredInterestProfile = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source,
        tags,
        embeddings: tags.map((tag, index) => ({
          name: tag.name,
          vector: vectors[index] ?? [],
        })),
        tweetCount,
      };

      setProfile(nextProfile);
      setSavedProfiles(saveProfile(nextProfile));
      setStep("done");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "未知错误");
    }
  };

  const loadSavedProfile = (item: StoredInterestProfile) => {
    setProfile(item);
    setStep("done");
    setError(null);
  };

  const handleDeleteProfile = (id: string) => {
    setSavedProfiles(deleteProfile(id));
    if (profile?.id === id) setProfile(null);
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

  return (
    <div className="interest-lab mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-cyan-400/80">Interest Lab</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-100">兴趣标签推断</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            从 X 帖子或粘贴文本推断兴趣标签，权重综合频次 / 情感 / 新近度；向量与标签列表保存在浏览器本地。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/tag-cloud"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            词云测试 →
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            ← 设备 Demo
          </Link>
        </div>
      </header>

      <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-200">API Keys（仅存本地）</h2>
          <label className="block text-xs text-zinc-500">
            OpenRouter Key
            <input
              type="password"
              value={apiKeys.openRouterKey}
              onChange={(event) =>
                persistKeys({ ...apiKeys, openRouterKey: event.target.value })
              }
              placeholder="sk-or-..."
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            twitterapi.io Key（仅 X 模式）
            <input
              type="password"
              value={apiKeys.twitterApiKey}
              onChange={(event) =>
                persistKeys({ ...apiKeys, twitterApiKey: event.target.value })
              }
              placeholder="X-API-Key"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-200">模型</h2>
          <label className="block text-xs text-zinc-500">
            LLM 模型
            <input
              value={llmModel}
              onChange={(event) => persistSettings(event.target.value, embeddingModel)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Embedding 模型
            <input
              value={embeddingModel}
              onChange={(event) => persistSettings(llmModel, event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
        </div>
      </section>

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
            粘贴文本
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
          <label className="block text-xs text-zinc-500">
            X 用户名
            <input
              value={twitterHandle}
              onChange={(event) => setTwitterHandle(event.target.value)}
              placeholder="elonmusk 或 @elonmusk"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
        ) : (
          <label className="block text-xs text-zinc-500">
            测试文本（多段帖子可直接粘贴）
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={8}
              placeholder="粘贴用户发帖内容…"
              className="mt-1 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-cyan-500/60"
            />
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleGenerate}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? "处理中…" : "推断并保存"}
          </button>
          <span className="text-xs text-zinc-500">{statusText}</span>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-200">
            标签词云
            {profile ? ` · ${profile.tags.length} 个标签${profile.tweetCount ? ` · ${profile.tweetCount} 条帖子` : ""}` : ""}
          </h2>
          <p className="text-xs text-zinc-500">圆形标签从上方落下，可拖拽；大小随权重变化</p>
        </div>
        <TagWordCloud
          tags={profile?.tags ?? []}
          emptyMessage="完成推断后将在此显示标签词云"
        />
      </section>

      {savedProfiles.length > 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-200">本地历史（{savedProfiles.length}）</h2>
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
                  {item.source.type === "twitter" ? `@${item.source.handle}` : "粘贴文本"} ·{" "}
                  {item.tags.length} 标签 ·{" "}
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
              <h2 className="text-sm font-medium text-zinc-200">结构化结果预览</h2>
              <button
                type="button"
                onClick={() => setShowJson((value) => !value)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                {showJson ? "收起" : "展开"} JSON
              </button>
            </div>

            <div className="mb-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4">标签</th>
                    <th className="pb-2 pr-4">权重</th>
                    <th className="pb-2 pr-4">频次</th>
                    <th className="pb-2 pr-4">情感</th>
                    <th className="pb-2">新近</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {profile.tags.map((tag) => (
                    <tr key={tag.name} className="border-t border-zinc-800/80">
                      <td className="py-2 pr-4 font-medium">{tag.name}</td>
                      <td className="py-2 pr-4 font-mono text-cyan-300">{tag.weight.toFixed(3)}</td>
                      <td className="py-2 pr-4 font-mono">{tag.frequency.toFixed(2)}</td>
                      <td className="py-2 pr-4 font-mono">{tag.sentiment.toFixed(2)}</td>
                      <td className="py-2 font-mono">{tag.recency.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showJson ? (
              <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                {jsonPreview}
              </pre>
            ) : null}
          </section>
      ) : null}
    </div>
  );
}
