# Roadmate 路友

> **Make Humans Talk Again** — 用 AI 读懂你的兴趣，用近场硬件帮你找到值得开口的人。

Roadmate 是一款面向**线下社交破冰**的 AI 硬件交互原型（Web 模拟）。用户佩戴低功耗圆形 NFC Tag，在聚会、展会、旅行等场景中，无需掏手机、无需扫码加好友，靠**环形灯带 + 圆形墨水屏**感知「谁值得靠近」，碰一碰完成配对后，再以轻量语音/表情延续联系。

**演示** [roadmate-sooty.vercel.app](https://roadmate-sooty.vercel.app/)

https://github.com/user-attachments/assets/6d8564bf-a930-4b53-9e84-3205e8c081e8

---

## 实现方式

**方式 A：软件模拟设备体验**

通过 Web 模拟 AI 硬件的核心输入/输出与状态机：圆形 Tag 外壳、环形 LED、墨水屏（方向箭头 / 匹配分 / 品牌字）、拖拽近场与叠放配对。配套 Next.js 前后端、OpenRouter 大模型推断、embedding 匹配分与本地 profile 存储。

未采用方式 B（ESP32 等开发板）；原型优先验证**产品场景与交互闭环**，硬件形态通过拟物 UI + 状态机对齐量产想象（NFC 靠近、环形 LED、e-ink 圆屏）。

---

## 目标用户、场景与核心价值

### 目标用户

- **愿意线下认识同好、但不想尬聊或强行加微信的人**  
  典型画像：独立开发者、创作者、展会/Meetup 参与者、独自旅行时想偶遇同频路人的年轻人。

### 使用场景

**高频情境**：线下活动、共享空间、旅途驿站——周围有很多陌生人，你不知道谁和你聊得来，也不想一直低头刷手机。

### 核心价值

| 痛点 | Roadmate 的做法 |
|------|----------------|
| 线上社交重、线下开口难 | 硬件先帮你筛「志趣相投」，见面只聊共同话题 |
| 加好友太重、后续维护压力大 | 配对后走「轻链接」：语音 + 表情，鼓励真人见面 |
| 手机社交分散注意力 | Tag 挂在包/链上，余光读灯、走近读屏，无需掏手机 |

**AI 为什么能让场景更好**：从用户近期发帖（或粘贴文本）推断**可破冰的具体兴趣标签**（非泛化「音乐/旅行」），再经 embedding 计算与他人匹配度；硬件侧用距离映射灯光与方向箭头，把抽象「相似度」变成可感知的近场信号。

---

## 核心功能与交互闭环

完整 Journey：**兴趣推断 → 近场寻缘 → 碰一碰配对 → 轻社交延续**

```
Interest Lab (/)  →  转场  →  Playground (/playground)  →  Roadmates (/roadmates)
     AI 读兴趣              拖 Tag 靠近匹配对象              路友列表 / 语音聊天原型
```

### 1. Interest Lab — AI 兴趣画像

- 输入：帖子列表（支持 `roadmate-posts/1` txt 导入）或 X 用户名拉取推文
- **三阶段 LLM 流水线**（方案 C）：预处理（判噪 + 摘要）→ 时间线合并（7 天语义去重）→ 破冰标签提取
- 代码侧聚合 frequency / sentiment / recency → weight → OpenRouter embedding
- 物理词云实时预览兴趣权重；结果存入 `localStorage` profile

### 2. Device Playground — 近场硬件模拟

- 画布上 10 台圆形 Tag，其中 3 台可匹配；**RM-01** 为主控（cyan 光环）
- 拖动主控靠近时：
  - **环形琥珀 LED** 随距离加速频闪（仅最近一对参与，减少噪声）
  - **Dock 放大** 目标设备
  - 双方圆屏显示**实时方向箭头**（解决「灯在闪但不知道往哪走」）
- 两机圆盘重叠 → **翠绿灯环充能 1s** → 配对成功（confetti、匹配分、共同话题）
- match 分由 Interest Lab 的 **embedding 余弦 + 标签重叠** 驱动（`matchScoring.ts`）

### 3. Roadmates — 配对后的轻社交原型

- 路友列表、仅语音+表情的对话、路友主页（共同标签、匹配上下文）
- 产品取向：**轻量无感、鼓励线下见真人**

更细的外形演进与交互状态机见 [`components/device-playground/DESIGN.md`](components/device-playground/DESIGN.md)。  
推断架构与权重公式见 [`components/interest-lab/INFERENCE.md`](components/interest-lab/INFERENCE.md)。

---

## 如何运行与演示

### 环境要求

- Node.js 18+
- [OpenRouter](https://openrouter.ai/) API Key（Interest Lab 推断与 embedding）

可选（X 拉帖模式）：

- [twitterapi.io](https://twitterapi.io/) API Key

### 本地启动

```bash
npm install
cp .env.example .env.local   # 可选：服务端默认模型等
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

### 推荐 Demo 路径（约 5–8 分钟）

1. **Interest Lab**（`/`）  
   - 在设置中填入 OpenRouter API Key（存浏览器 localStorage，不上传服务端）  
   - 粘贴 5–10 条带「距今」时间的帖子，或导入 `scripts/fixtures/corpus-cases/*.posts.txt`  
   - 点击「推断并保存」，观察三阶段进度与词云  
   - 点击「进入 Playground」触发 Journey 转场  

2. **Playground**（`/playground`）  
   - 拖动 **RM-01**（青色光环）靠近屏幕显示 `match XX%` 的设备  
   - 展示：灯环频闪加快、Dock 放大、双向箭头  
   - 将两台设备圆盘重叠，等待翠绿灯环充能完成  
   - 观看配对成功动画与共同话题  

3. **Roadmates**（`/roadmates`）  
   - 从配对成功可跳转，或直接访问  
   - 展示配对后的轻社交界面原型  

### 独立页面

| 路径 | 说明 |
|------|------|
| `/tag-cloud` | TagWordCloud 组件测试（无需 API） |

### 部署

可部署至 [Vercel](https://vercel.com) 等支持 Next.js 16 的平台。环境变量参考 `.env.example`（`OPENROUTER_API_KEY` 等）。  
用户侧 API Key 仍建议在 Demo 时由浏览器 localStorage 注入，与服务端配置二选一即可。

### CLI 评测（可选）

```bash
npm run bench:timeline              # 方案 C 推断 benchmark
npm run bench:timeline -- --verbose # 打印三阶段中间结果
```

---

## 技术实现

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器（Client）                                              │
│  Interest Lab UI · Device Playground · Roadmates              │
│  GSAP 动画 · Matter.js 物理 · localStorage profile/keys       │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch
┌──────────────────────────▼──────────────────────────────────┐
│  Next.js API Routes（Server）                                │
│  /api/interest-lab/openrouter/infer-timeline  （NDJSON 流）   │
│  /api/interest-lab/openrouter/embed                           │
│  /api/interest-lab/twitter/last-tweets      （CORS 代理）    │
└──────────────────────────┬──────────────────────────────────┘
                           │
              OpenRouter LLM + Embedding · twitterapi.io
```

### 前端 / 设备模拟界面

| 模块 | 技术 | 职责 |
|------|------|------|
| 框架 | Next.js 16 App Router + React 19 + TypeScript | Journey 路由、SSR 壳 |
| 样式 | Tailwind CSS v4 + `globals.css` 自定义拟物样式 | 圆形 Tag 金属壳、环形 LED、e-ink 绿调 |
| 动画 | GSAP + `@gsap/react` + Draggable | LED `timeScale` 频闪、Dock、配对转场、箭头旋转 |
| 物理 | Matter.js | 设备无重力叠放；词云轻重力碰撞 |
| Journey | `components/journey/` | Interest Lab → Playground 转场、iPhone 预览框 |

设备状态由 React state + refs 驱动，近场逻辑集中在 `useProximityEffects`、`useMatchPairing`、`matchScoring`。

### 后端 / API 层

- **推断**：`server/timelineInference.ts` 编排三阶段 LLM；`app/api/.../infer-timeline/route.ts` 以 NDJSON 流式返回进度
- **Embedding**：`/api/interest-lab/openrouter/embed`
- **Twitter**：服务端代理 twitterapi.io，Key 由客户端传入、不落盘
- API Key：优先用户 localStorage；`.env.local` 可配服务端默认 Key（开发/部署用）

### AI 能力

| 环节 | 模型（默认） | 说明 |
|------|-------------|------|
| 预处理 / 合并 / 提取 | `minimax/minimax-m3`（可 UI 覆盖） | 方案 C 三阶段；详见 INFERENCE.md |
| Embedding | `openai/text-embedding-3-small` | 标签向量 → 设备 match 分 |
| 匹配分 | 代码 `matchScoring.ts` | 0.58×embedding 余弦 + 0.42×标签重叠 |

### 数据与设备状态

| 数据 | 存储 | 说明 |
|------|------|------|
| API Keys、settings | `localStorage` | 不上传 git |
| Interest profile（tags + embeddings） | `localStorage` | 最多 20 条；**不含帖子原文** |
| 帖子列表 | 内存 | 刷新需重新导入/拉取 |
| 设备位置 / 配对态 | 运行时 state | Playground 会话级 |

---

## 主要挑战、关键取舍与 AI 工具作用

### 关键取舍

1. **设备外形：iPod 卡片 → 圆形 AirTag Tag**  
   单点 LED 在多人场景识别度不足；正圆 + 360° 环形灯带形成「信标」效果，任意角度一致。去掉无交互滚轮，配对改为重叠 + 灯环充能，对齐量产 NFC 想象。详见 [DESIGN.md](components/device-playground/DESIGN.md)。

2. **兴趣推断：方案 A/B → 方案 C 三阶段时间线**  
   逐帖并行难合并近义标签；滚动语料丢失帖级时间归因。方案 C 用预处理保吞吐、全局合并控重复、`sourcePostIds` 链保证 recency 可算。代价是多 2 次串行 LLM 调用。详见 [INFERENCE.md](components/interest-lab/INFERENCE.md)。

3. **配对确认：屏外按钮 → 灯环充能**  
   减少假按键，用户只需「持握靠近」，与硬件无实体键一致。

4. **范围控制**  
   优先保证 **Interest Lab + Playground 配对闭环** 可运行、可讲述；Roadmates 为配对后方向性 UI 原型；音效、真实 NFC、雷达扫描留作 Phase 2。

### 主要技术挑战

- **LED 频率随距离连续变化**：用持久 GSAP timeline + `timeScale`，避免每帧重建动画
- **多人近场视觉噪声**：仅「最近一对」参与琥珀频闪；有效距离收紧为 3× 设备直径
- **语义匹配与近场交互解耦**：Lab 负责「谁值得靠近」，Playground 负责「靠近时如何反馈」
- **LLM 推断可评测**：`bench:timeline` + fixture 断言（`anyOf` / `forbidden` / `minSignalPosts`）

### AI 工具在开发中的作用

- **Cursor + Agent**：快速迭代 UI 原型、Matter/GSAP 集成、API 路由脚手架；`AGENTS.md` / `DESIGN.md` / `INFERENCE.md` 沉淀约定，减少上下文漂移
- **大模型 API（OpenRouter）**：产品核心能力——从非结构化帖子提取可破冰标签，而非硬编码规则
- **开发过程记录**：作业要求使用 [interview.viberrate.com](https://interview.viberrate.com/) 记录思考与取舍（语音/文字 Update）

#### Cursor 用量（本项目开发期间）

本仓库保留了开发本项目期间的 Cursor Pro 用量快照，便于核对 AI 辅助开发的实际消耗：

| 文件 | 说明 |
|------|------|
| [`docs/cursor-usage/usage-events-2026-07-10.csv`](docs/cursor-usage/usage-events-2026-07-10.csv) | 完整 usage events 导出（按事件明细） |
| [`docs/cursor-usage/usage-dashboard-pro.jpg`](docs/cursor-usage/usage-dashboard-pro.jpg) | Pro 套餐用量仪表盘截图（Total / Auto+Composer / API） |

- **统计区间**：约 2026-07-04 → 2026-07-08（CSV 事件时间），共 **481** 条事件
- **合计 Total Tokens**：**161,603,624**（约 **1.62 亿**；Errored/No Charge 行为 0）
- **构成**：Cache Read ≈ 1.50 亿 · Input（无 Cache Write）≈ 952 万 · Output ≈ 163 万 · Input（Cache Write）≈ 76 万
- **模型占比**（按 Total Tokens）：

| 模型 | Tokens | 占比 | 事件数 |
|------|--------|------|--------|
| `auto` | 147,413,214 | 91.2% | 451（93.8%） |
| `claude-opus-4-8-thinking-high` | 9,916,979 | 6.1% | 14（2.9%） |
| `composer-2.5-fast` | 4,273,431 | 2.6% | 16（3.3%） |

---

## 项目结构（精简）

```
app/
  (journey)/page.tsx          # Interest Lab
  (journey)/playground/       # Device Playground
  roadmates/                  # 路友原型
  api/interest-lab/           # OpenRouter / Twitter 代理

components/
  device-playground/          # 硬件模拟 + DESIGN.md
  interest-lab/                 # AI 推断 + INFERENCE.md
  tag-word-cloud/             # 物理词云
  journey/                    # 转场编排
  roadmates/                  # 轻社交 UI 原型

scripts/
  benchmark-timeline-eval.ts  # 方案 C CLI 评测
  fixtures/corpus-cases/      # 推断测试语料

docs/
  cursor-usage/               # Cursor Pro 用量 CSV + 仪表盘截图
```

Agent 开发指南见 [`AGENTS.md`](AGENTS.md)。

---

## 后续方向（Phase 2+）

- Web Audio 近场 tick 音效
- 真实 NFC 靠近确认（替代 Web 重叠模拟）
- Matter 物理碰撞触发配对
- 雷达扫描动画、完整 6 步见面仪式
- 圆形 e-ink 刷新率与残影的硬件对齐

---

## License

Private — 面试作业项目。
