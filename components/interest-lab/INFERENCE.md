# Interest Lab — 推断与权重

## 流程概览

```
帖子输入 → 逐帖 LLM 提取 → 代码聚合 → Embedding → 词云展示
```

- **LLM 只做**：读懂单条帖子，输出标签名 + sentiment
- **代码做**：频次、新近度、最终 weight、淘汰、排序
- **Embedding**：仅对聚合后的标签名生成向量（新标签惰性 embed）

输入模式：

| 模式 | 帖子来源 |
|------|----------|
| 帖子列表 | 用户逐条添加，时间用「距今」（小时/天/周/月） |
| X 用户名 | twitterapi.io 拉帖，自带 `createdAt` |

## 逐帖提取

- 每条帖子单独调用 OpenRouter LLM（并发上限 6）
- 每帖最多 **3** 个标签，格式：`{ name, sentiment }`
- `sentiment` 0~1，由 LLM 判断情感强度；无明确兴趣点可返回空数组
- 结果写入 `PostRecord.extractedAt` + `PostRecord.tags`

## 增量更新

- 已有 `extractedAt` 的帖子跳过 LLM，除非用户修改帖子文本或时间（会清除推断状态）
- 同一 profile 下再次「推断并保存」时，合并帖子列表，只处理新帖/改过的帖
- 「清空标签」：清除聚合标签与各帖 LLM 结果，帖子文本和时间保留

## 聚合

同名标签按 `trim + lowercase` 合并，然后计算三维度：

| 维度 | 算法 |
|------|------|
| **frequency** | 每条出现按 `exp(-λ × 天数)` 衰减后求和，再除以总帖数 |
| **sentiment** | 各帖 sentiment 算术平均 |
| **recency** | 以**最后一次出现**为准：`exp(-λ × 距今天数)` |

时间衰减系数 **λ = 0.08**（约 30 天 → 0.09，90 天 → 0.001）。

### 最终 weight

```
weight = 0.40 × frequency + 0.20 × sentiment × recency + 0.40 × recency
```

- sentiment 乘以 recency：旧兴趣的情感贡献也随时间减弱
- 系数见 `constants.ts` 的 `WEIGHT_FACTORS`

### 过滤与输出

- 至少出现 **1** 帖才保留（`MIN_TAG_POST_COUNT`）
- **过期淘汰**：仅出现 1 次且最后出现超过 **60** 天 → 丢弃
- 按 weight 降序，取 top **20** 推断标签
- 用户自定义标签不参与聚合，默认 weight 0.55，追加在推断标签之后

## 词云大小

推断标签的 `weight` 传入 `TagWordCloud` 后，在**当前 batch 内 min-max 归一化**，再映射球体直径（compact 模式约 38~102px）。因此球大小是**相对排名**，不是 weight 绝对值线性对应像素。

自定义标签由滑轨权重（0.15~1.0）绝对映射尺寸。

## 关键文件

| 文件 | 职责 |
|------|------|
| `api/openrouter.ts` | `extractTagsFromPost`、`extractTagsFromPosts`、`embedTags` |
| `postUtils.ts` | 帖子 CRUD、合并、增量判断、相对时间换算 |
| `tagUtils.ts` | `aggregateTagsFromPosts`、`computeTagWeight` |
| `constants.ts` | 并发、衰减 λ、权重系数、上限等调参 |
| `InterestLab.tsx` | UI 编排、profile 持久化 |
| `PostListEditor.tsx` | 帖子列表与「距今」时间控件 |

## 调参入口

所有 magic number 集中在 `constants.ts`：

- `WEIGHT_FACTORS` — 三维权重比例
- `RECENCY_DECAY_LAMBDA` — 时间衰减陡峭程度
- `MAX_INFERRED_TAGS` / `STALE_TAG_DAYS` / `LLM_CONCURRENCY` 等
