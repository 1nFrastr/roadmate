<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Roadmate — Agent 指南

## 项目是什么

**Roadmate** 是一个近场社交硬件交互 Demo（Web 原型）。模拟低功耗卡牌式 NFC 设备（参考 iPod nano 1st gen），在画布上展示多台拟物设备，用户拖动「我的设备」靠近志趣相投的设备，通过 **Dock 放大** 与 **距离映射 LED 闪烁** 反馈匹配强度。

当前为 **Phase 1（v1）**：拖拽、物理叠放、近场 LED、主控设备视觉区分。  
**已实现（兴趣侧原型）**：TagWordCloud 物理词云、Interest Lab（OpenRouter LLM 标签推断 + embedding）。  
**未实现**：碰一碰匹配仪式、音效、匹配成功屏、雷达扫描、兴趣向量与设备匹配联动等（Phase 2/3）。

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 16 App Router + React 19 + TypeScript |
| 样式 | Tailwind CSS v4（`app/globals.css` 含拟物设备 / 词云样式） |
| 动画 / 拖拽 | GSAP + `@gsap/react` + `Draggable` |
| 物理 | Matter.js（设备：无重力叠放；词云：轻重力 + 边界碰撞） |
| LLM / Embedding | OpenRouter API（客户端直连，Key 存 localStorage） |
| Twitter 数据源 | twitterapi.io（可选，Interest Lab Twitter 模式） |

**不要**用 Framer Motion 或纯 CSS `@keyframes` 替代 LED 频率映射——频率需 runtime 随距离连续变化。

## 目录结构

```
app/
  page.tsx              # 首页，渲染 DevicePlayground
  interests/page.tsx    # Interest Lab — LLM 兴趣标签推断
  tag-cloud/page.tsx    # TagWordCloud 独立测试页（placeholder 数据）
  layout.tsx            # 根布局、metadata
  globals.css           # Tailwind + 拟物外壳 / LED / 词云样式

components/device-playground/
  DevicePlayground.tsx  # 主容器：初始化、Draggable、编排 hooks
  DeviceCard.tsx        # 单台拟物设备 UI（外壳、小屏、LED）
  useDevicePhysics.ts   # Matter 引擎、刚体、DOM 同步
  useProximityEffects.ts # Dock 放大 + LED timeScale 近场逻辑
  constants.ts          # 尺寸、阈值、匹配分档、distanceToLedTimeScale
  types.ts              # DeviceState 等类型

components/tag-word-cloud/
  TagWordCloud.tsx      # 可复用词云：Matter 物理 + GSAP Draggable
  TagWordCloudDemo.tsx  # 测试页容器（随机 placeholder 标签）
  utils.ts              # 布局计算、刚体创建、重叠分离
  constants.ts          # 标签尺寸、重力、画布高度
  types.ts              # WordCloudTag、TagLayout 等
  placeholderTags.ts    # Demo 用随机标签生成

components/interest-lab/
  InterestLab.tsx       # 主 UI：输入、推断流程、词云预览、JSON 输出
  api/openrouter.ts     # extractTagsWithLlm、embedTags
  api/twitter.ts        # fetchUserTweets、tweetsToCorpus
  tagUtils.ts           # draftsToTags、computeTagWeight
  storage.ts            # localStorage：API Keys、profiles、settings
  constants.ts          # 默认模型、权重系数、API base URL
  types.ts              # InterestTag、StoredInterestProfile 等
```

路径别名：`@/*` → 项目根目录。

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 设备近场交互 Demo |
| `/interests` | Interest Lab — 从 X 帖子或粘贴文本推断兴趣标签 |
| `/tag-cloud` | TagWordCloud 组件 playground（无需 API） |

## 核心交互约定（设备 Demo）

1. **主控设备**：`OWNER_DEVICE_INDEX = 0`（RM-01），`isOwner: true`，青色边框 + 「我的设备」文案。
2. **可匹配设备**：10 台中随机 3 台 `matchable: true`，屏幕显示 `match XX%`。
3. **LED 逻辑**：仅当拖动**主控设备**时，match 设备的 LED 随距离加速；用 **持久 GSAP timeline + `timeScale`** 调速，不要每帧 kill/recreate timeline。
4. **LED DOM**：`device-led-stack` > `device-led-glow` + `device-led-core`；GSAP 只动画内部节点，避免与 Tailwind `transform` 冲突。
5. **物理**：拖拽时刚体 `setStatic(true)`，松手后恢复；`afterUpdate` 将非拖拽设备 body 位置同步回 DOM。

## Interest Lab 约定

1. **输入模式**：`twitter`（twitterapi.io 拉帖）或 `paste`（粘贴文本）；Twitter 模式需两个 Key。
2. **推断流程**：拉取/读取语料 → OpenRouter LLM 提取 8~20 标签（`frequency` / `sentiment` / `recency` 各 0~1）→ 加权合成 `weight` → OpenRouter embedding → 存 `StoredInterestProfile`。
3. **权重公式**（`tagUtils.ts`）：`weight = 0.45×frequency + 0.25×sentiment + 0.30×recency`。
4. **默认模型**（`constants.ts`）：LLM `minimax/minimax-m3`，Embedding `openai/text-embedding-3-small`；可在 UI 覆盖。
5. **本地存储**：API Key、settings、最多 20 条 profile 均在浏览器 `localStorage`；**不要**把 Key 提交到 git 或服务端。
6. **输出**：右侧 JSON 预览含 tags + embeddings；下方 `TagWordCloud` 实时展示推断结果。

## TagWordCloud 约定

1. **Props**：`tags: { name, weight }[]`；`weight` 映射字体大小与圆形直径。
2. **物理**：轻重力下落、底/侧墙碰撞；初始布局用 `createTagLayouts`，必要时 `separateOverlappingBodies` 防重叠。
3. **拖拽**：GSAP `Draggable`，拖拽时 body `setStatic(true)`，`afterUpdate` 同步非拖拽标签位置。
4. **样式**：`.tag-word-cloud` / `.tag-word-cloud-shape-circle` 等在 `globals.css`；色相按 `visualWeight` 分配。
5. **复用**：Interest Lab 直接 import `TagWordCloud`；独立测试走 `/tag-cloud`。

## 改代码时注意

- 所有 canvas / GSAP / Matter 逻辑必须在 `'use client'` 组件内。
- 动画 setup 优先用 `useGSAP({ scope: ref })`，unmount 时自动 revert。
- 调参集中在各模块 `constants.ts`（设备：`DOCK_RADIUS` 等；词云：`PHYSICS`、`TAG_SIZE`；Lab：`WEIGHT_FACTORS`）。
- 保持 diff 小：不要引入通用拟物 UI 库（Tactile UI、skeu-ui 等），设备形态是自定义的。
- 尊重 `prefers-reduced-motion`（见 `useProximityEffects`）。
- OpenRouter / twitterapi.io 均为**浏览器端 fetch**；新增外部 API 调用时保持 Key 仅 localStorage，勿写 server env 除非明确迁移。

## 常用命令

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## Phase 2 方向（供后续 agent 参考）

- Matter 碰撞检测 → 两台 matchable 设备碰一碰触发匹配
- Web Audio tick 音效 + 匹配成功屏（分值、共同标签、话题）
- 将 Interest Lab 的 `embeddings` 接入设备匹配分（替换当前随机 `match XX%`）
- Phase 3：雷达扫描动画、完整 6 步见面仪式
