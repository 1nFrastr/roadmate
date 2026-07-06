<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Roadmate — Agent 指南

## 项目是什么

**Roadmate** 是一个近场社交硬件交互 Demo（Web 原型）。模拟低功耗圆形 NFC Tag 设备（AirTag 灵感金属圆盘 + 圆形墨水屏），在画布上展示多台拟物设备，用户拖动「我的设备」（RM-01）靠近志趣相投的设备，通过 **Dock 放大**、**环形灯带频闪** 与 **圆屏方向箭头** 感知匹配强度，重叠后可完成碰一碰配对仪式。

**Journey 路径**：`/` Interest Lab 推断兴趣 → 转场 → `/playground` 近场交互 → `/roadmates` 社交原型。

**已实现**：拖拽与 Matter 叠放、近场环形 LED（距离映射频率/强度）、Dock 放大、双向方向箭头、重叠灯环充能配对、匹配成功转场、Interest Lab 三阶段时间线推断 + embedding、设备 match 分（embedding 余弦 + 标签重叠）、TagWordCloud 物理词云。  
**未实现 / Phase 2+**：Web Audio 音效、真实 NFC 确认、雷达扫描动画、完整 6 步见面仪式等。

外形与交互演进详见 [`components/device-playground/DESIGN.md`](components/device-playground/DESIGN.md)。

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 16 App Router + React 19 + TypeScript |
| 样式 | Tailwind CSS v4（`app/globals.css` 含拟物 Tag / 词云样式） |
| 动画 / 拖拽 | GSAP + `@gsap/react` + `Draggable` |
| 物理 | Matter.js（设备：无重力叠放；词云：轻重力 + 边界碰撞） |
| LLM / Embedding | OpenRouter（经 Next.js API 路由；Key 存 localStorage，客户端传入、不落盘） |
| Twitter 数据源 | twitterapi.io（Interest Lab X 模式，经服务端代理） |

**不要**用 Framer Motion 或纯 CSS `@keyframes` 替代 LED 频率映射——频率需 runtime 随距离连续变化。

## 目录结构

```
app/
  (journey)/
    page.tsx              # Journey 首页 → Interest Lab
    playground/page.tsx   # Device Playground
    layout.tsx            # JourneyShell + 转场 Provider
  interests/page.tsx      # 重定向到 /
  roadmates/page.tsx      # Roadmates 社交原型
  tag-cloud/page.tsx      # TagWordCloud 独立测试页
  api/interest-lab/       # openrouter infer-timeline / embed 等；twitter 代理
  layout.tsx, globals.css

components/device-playground/
  DESIGN.md               # 外形演进、交互状态机、方案取舍（改设备 UI 前先读）
  DevicePlayground.tsx    # 主容器：Draggable、hooks 编排
  DeviceCard.tsx          # 单台圆形 Tag UI（金属壳、圆屏、环形 LED）
  MatchPointerArrow.tsx   # 近场双向方位箭头
  MatchScoreCounter.tsx   # 配对成功屏分数/话题
  matchScoring.ts         # embedding 余弦 + 标签重叠 → match %
  useDevicePhysics.ts     # Matter 引擎、刚体、DOM 同步
  useProximityEffects.ts  # Dock 放大 + 环形 LED timeScale / intensity
  match-pairing/          # useMatchPairing、充能进度、成功转场
  constants.ts, types.ts, layoutInitialDevices.ts

components/journey/       # Journey 转场、iPhone 预览框、localStorage 状态

components/tag-word-cloud/
  TagWordCloud.tsx, utils.ts, constants.ts, types.ts, placeholderTags.ts

components/interest-lab/
  INFERENCE.md            # 方案 C 三阶段流水线、权重公式、CLI benchmark
  InterestLab.tsx         # Web UI 编排、profile 持久化
  PostListEditor.tsx, postImportExport.ts, postUtils.ts
  tagUtils.ts             # aggregateTagsFromTimeline、computeTagWeight
  timelineUtils.ts        # 推断结果应用、timelineResultToInterestTags
  prompts.ts              # 三阶段 system prompt
  server/                 # timelineInference.ts、timelineFormat.ts 等（方案 C）
  api/openrouter.ts       # inferTagsFromTimeline（NDJSON 流）、embedTags
  api/twitter.ts, storage.ts, constants.ts, types.ts
```

路径别名：`@/*` → 项目根目录。

## 路由

| 路径 | 说明 |
|------|------|
| `/` | Journey 首页 — Interest Lab 兴趣推断 |
| `/playground` | Device Playground 近场交互 |
| `/roadmates` | Roadmates 社交原型 |
| `/interests` | 重定向到 `/` |
| `/tag-cloud` | TagWordCloud 组件 playground（无需 API） |

## 核心交互约定（设备 Demo）

> 外形演进、状态机、常量含义详见 [`components/device-playground/DESIGN.md`](components/device-playground/DESIGN.md)。

1. **外形（v3）**：120 px 正圆金属 Tag 壳 + 85 px 圆形墨水屏；屏外环形 LED（`device-tag-led-ring`），无物理按键。主控 RM-01 外圈 cyan halo（`device-tag-owner-halo`）。
2. **主控设备**：`OWNER_DEVICE_INDEX = 0`，`isOwner: true`。
3. **可匹配设备**：10 台中 3 台 `matchable: true`；match 分由 Interest Lab embedding（`matchScoring.ts`）驱动，屏显 `match XX%`。
4. **近场灯光**（`useProximityEffects`）：仅拖动**主控**时，**最近一对** matchable 设备参与琥珀色（`#ffb020`）环形频闪；有效距离 `LED_MATCH_RANGE = DEVICE_D × 3`；`distanceToLedTimeScale` / `distanceToLedIntensity` 映射频率与光晕强度。持久 GSAP timeline + `timeScale` 调速，禁止每帧 kill/recreate。
5. **方向箭头**（`MatchPointerArrow`）：有效距离内双方圆屏显示实时旋转箭头（`bearingBetweenCenters`）；待机显示 ROADMATE 品牌字，箭头激活时让位。
6. **碰一碰配对**（`useMatchPairing`）：重叠 → 翠绿灯环（`#34d399`）充能 1s（`MATCH_CONFIRM_HOLD_MS`）→ 成功转场（confetti、分数、共同话题）。曾用屏外确认按钮，已改为灯环进度，对齐「无实体键、NFC 靠近」方向。
7. **Dock 放大**：主控进入 `DOCK_RADIUS`（225 px）内时，目标设备 scale 至 `DOCK_MAX_SCALE`（1.35）。
8. **物理**：拖拽时刚体 `setStatic(true)`，松手后恢复；`afterUpdate` 将非拖拽设备 body 位置同步回 DOM。

## Interest Lab 约定

> 三方案演进、阶段细节、权重公式、CLI 评测详见 [`components/interest-lab/INFERENCE.md`](components/interest-lab/INFERENCE.md)。

1. **当前架构（方案 C）**：预处理（并行判噪 + 摘要）→ 时间线合并（7 天窗口语义去重）→ 标签提取 → 代码 `aggregateTagsFromTimeline` → embedding。主路径为 `inferTagsFromTimeline`；方案 A/B 代码保留对照，勿走主路径。
2. **输入模式**：帖子列表（paste，支持 `roadmate-posts/1` txt 导入导出）或 X 用户名（twitterapi.io 拉帖 → 相同 `PostRecord` schema）。
3. **推断触发**：每次「推断并保存」**全量重跑**三阶段（不做增量跳过）；帖子列表**不写入** localStorage。
4. **权重公式**：`weight = 0.40×frequency + 0.20×sentiment×recency + 0.40×recency`；`frequency` / `recency` 由代码按 `sourcePostIds` → `createdAt` 归因链计算，非 LLM 输出。系数见 `constants.ts` 的 `WEIGHT_FACTORS`、`RECENCY_DECAY_LAMBDA`。
5. **默认模型**（`constants.ts`）：LLM `minimax/minimax-m3`，Embedding `openai/text-embedding-3-small`；可在 UI 覆盖。
6. **本地存储**：API Key、settings、profile（标签 + embedding，**不含帖子**）在 `localStorage`；**不要**把 Key 提交到 git 或服务端持久化。
7. **输出**：JSON 预览含 tags + embeddings；下方 `TagWordCloud` 实时展示（推断标签 weight 在 batch 内 min-max 归一化后映射尺寸）。

## TagWordCloud 约定

1. **Props**：`tags: { name, weight }[]`；推断标签的 `weight` 在**当前 batch 内 min-max 归一化**后映射球体直径（相对排名，非绝对线性）；自定义标签由滑轨权重绝对映射。
2. **物理**：轻重力下落、底/侧墙碰撞；初始布局用 `createTagLayouts`，必要时 `separateOverlappingBodies` 防重叠。
3. **拖拽**：GSAP `Draggable`，拖拽时 body `setStatic(true)`，`afterUpdate` 同步非拖拽标签位置。
4. **样式**：`.tag-word-cloud` / `.tag-word-cloud-shape-circle` 等在 `globals.css`；色相按 `visualWeight` 分配。
5. **复用**：Interest Lab 直接 import `TagWordCloud`；独立测试走 `/tag-cloud`。

## 改代码时注意

- 所有 canvas / GSAP / Matter 逻辑必须在 `'use client'` 组件内。
- 动画 setup 优先用 `useGSAP({ scope: ref })`，unmount 时自动 revert。
- 调参集中在各模块 `constants.ts`（设备：`DOCK_RADIUS`、`LED_MATCH_RANGE` 等；词云：`PHYSICS`、`TAG_SIZE`；Lab：`WEIGHT_FACTORS`、`TIMELINE_MERGE_WINDOW_DAYS`）。
- 保持 diff 小：不要引入通用拟物 UI 库；设备形态是自定义圆形 Tag。
- 尊重 `prefers-reduced-motion`（见 `useProximityEffects`、`MatchPointerArrow`）。
- OpenRouter / twitterapi.io 经 **Next.js API 路由**代理（无 CORS）；API Key 由客户端从 localStorage 传入请求，服务端不落盘。
- 改设备外形或交互前先读 `DESIGN.md`；改推断流水线前先读 `INFERENCE.md`。

## 常用命令

```bash
npm run dev              # http://localhost:3000
npm run build
npm run lint
npm run bench:timeline   # 方案 C 推断 CLI benchmark（见 INFERENCE.md）
npm run bench:corpus     # 方案 B 历史对照（非主路径）
```
