# Interest Lab — 推断与权重

## 流程概览（方案 C）

```
帖子输入 → 阶段1 并行预处理 → 阶段2 时间线合并 → 阶段3 标签提取 → 代码聚合 → Embedding → 词云展示
```

| 阶段 | LLM 职责 | 代码职责 |
|------|----------|----------|
| **1 预处理** | 并行读单帖：判水贴 + 压缩摘要（1~2 句） | 并发调度、过滤 noise |
| **2 时间线合并** | 看完整时间线，相邻 7 天内语义相近帖合并为一条 | 合并时间取最新帖 `createdAt` |
| **3 标签提取** | 从合并时间线输出破冰标签 + sentiment + entryId 归因 | 频次/新近度/weight、淘汰、排序 |

- **Embedding**：仅对聚合后的标签名生成向量（新标签惰性 embed）

输入模式：

| 模式 | 帖子来源 |
|------|----------|
| 帖子列表 | 用户逐条添加，时间用「距今」（小时/天/周/月）；支持 `.txt` 批量导入/导出 |
| X 用户名 | [twitterapi.io](https://twitterapi.io/dashboard) 拉取原创推文 → 与帖子列表相同的 `PostRecord` schema；可编辑、txt 导入/导出 |

## 阶段 1 — 单帖预处理

- 每条帖子单独调用 OpenRouter LLM（并发上限 6）
- 输出：`{ isNoise, summary }`；水贴 `isNoise: true` 跳过后续阶段
- 长文压缩为核心要点（见 `PREPROCESS_SUMMARY_MAX_CHARS`）

## 阶段 2 — 时间线合并

- 单次 LLM 调用，输入按时间排序的全部有效摘要
- 相邻 **7 天**内语义高度相似的条目可合并（`TIMELINE_MERGE_WINDOW_DAYS`）
- 合并后 `createdAt` = 源帖中最新的时间；`sourcePostIds` 保留归因

## 阶段 3 — 标签提取

- 单次 LLM 调用，输入合并后的时间线
- 输出标签：`{ name, sentiment, entryIds }`；sentiment 0~1
- 产品向 prompt 集中在此阶段（`TIMELINE_TAG_EXTRACTION_PROMPT`）

## 推断触发

- 每次点击「推断并保存」均**全量重跑**三阶段流水线（不做增量跳过）
- 「清空标签」：清除聚合标签与各帖推断状态，帖子文本和时间保留

## 聚合

同名标签按 `trim + lowercase` 合并，然后计算三维度：

| 维度 | 算法 |
|------|------|
| **frequency** | 纯频次：`sourcePostIds 展开计数 / 总帖数`（不与时间耦合） |
| **sentiment** | 各 entry 归因 sentiment 算术平均 |
| **recency** | 以**最后一次出现**为准：`exp(-λ × 距今天数)` |

时间衰减系数 **λ = 0.08**（约 30 天 → 0.09，90 天 → 0.001），**仅用于 recency**（及 weight 中的 `sentiment × recency`）。

### 最终 weight

```
weight = 0.40 × frequency + 0.20 × sentiment × recency + 0.40 × recency
```

- sentiment 乘以 recency：旧兴趣的情感贡献也随时间减弱
- 合并条目：frequency 按 `sourcePostIds` 展开计数；recency 取归因条目中最新的 `createdAt`
- 系数见 `constants.ts` 的 `WEIGHT_FACTORS`

### 过滤与输出

- 至少出现 **1** 帖才保留（`MIN_TAG_POST_COUNT`）
- **过期淘汰**：仅出现 1 次且最后出现超过 **60** 天 → 丢弃
- 按 weight 降序，取 top **20** 推断标签
- 用户自定义标签不参与聚合，默认 weight 0.55，追加在推断标签之后

## 词云大小

推断标签的 `weight` 传入 `TagWordCloud` 后，在**当前 batch 内 min-max 归一化**，再映射球体直径（compact 模式约 38~102px）。因此球大小是**相对排名**，不是 weight 绝对值线性对应像素。

自定义标签由滑轨权重（0.15~1.0）绝对映射尺寸。

## CLI 评测

```bash
npm run bench:timeline                              # 跑 manifest 全部 case
npm run bench:timeline -- --case multi-theme-user   # 单个 case
npm run bench:timeline -- --verbose                 # 输出三阶段中间结果
```

用例目录：`scripts/fixtures/corpus-cases/`（`manifest.json` + `*.posts.txt`）

## 关键文件

| 文件 | 职责 |
|------|------|
| `server/timelineInference.ts` | 三阶段 LLM 编排 |
| `server/timelineFormat.ts` | 阶段 2/3 prompt 格式化 |
| `prompts.ts` | 三阶段 system prompt |
| `timelineUtils.ts` | 推断计划、结果应用、InterestTag 转换 |
| `tagUtils.ts` | `aggregateTagsFromTimeline`、`computeTagWeight` |
| `api/openrouter.ts` | `inferTagsFromTimeline`、`embedTags` |
| `constants.ts` | 并发、衰减 λ、权重系数、合并窗口等 |
| `InterestLab.tsx` | UI 编排、profile 持久化 |
| `scripts/benchmark-timeline-eval.ts` | CLI benchmark |

## 帖子 txt 格式（roadmate-posts/1）

便于切换测试数据集，导入/导出均为 UTF-8 纯文本：

```
# roadmate-posts/1
@0h
刚看完一部 sci-fi 纪录片

@3d
周末试了新的 pour-over 豆子

@2w
Started learning Rust for embedded
```

- 每帖首行 `@<数量><单位>`：`h`/`d`/`w`/`m` 或 `@3 days`、`@2 周` 等
- 随后为正文，可多行；下一条 `@` 开头为新帖
- `#` 开头为注释；空行忽略
- 导入会**清空并替换**当前列表，同时清除 profile 中的推断标签（自定义标签保留）；导出不含推断标签，仅文本 + 相对时间
- X 模式「拉取帖子」会**合并**到当前列表（同 tweet id 保留已有推断结果）；切换用户名后拉取会清空列表
- 单次 **1 次 API 请求**（`MAX_TWEET_PAGES = 1`），最多 **20 条**原创推文（API 每页上限；转推过滤后可能更少）；免费 Key 约 0.2 QPS，遇 429/503 自动退避重试
- 帖子列表**不写入 localStorage**，刷新后需重新拉取或导入


## 调参入口

所有 magic number 集中在 `constants.ts`：

- `WEIGHT_FACTORS` — 三维权重比例
- `RECENCY_DECAY_LAMBDA` — 时间衰减陡峭程度
- `TIMELINE_MERGE_WINDOW_DAYS` — 时间线合并窗口
- `MAX_INFERRED_TAGS` / `STALE_TAG_DAYS` / `LLM_CONCURRENCY` 等
