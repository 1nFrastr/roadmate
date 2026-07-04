<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Roadmate — Agent 指南

## 项目是什么

**Roadmate** 是一个近场社交硬件交互 Demo（Web 原型）。模拟低功耗卡牌式 NFC 设备（参考 iPod nano 1st gen），在画布上展示多台拟物设备，用户拖动「我的设备」靠近志趣相投的设备，通过 **Dock 放大** 与 **距离映射 LED 闪烁** 反馈匹配强度。

当前为 **Phase 1（v1）**：拖拽、物理叠放、近场 LED、主控设备视觉区分。  
**未实现**：碰一碰匹配仪式、音效、匹配成功屏、雷达扫描等（Phase 2/3）。

## 技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 16 App Router + React 19 + TypeScript |
| 样式 | Tailwind CSS v4（`app/globals.css` 含拟物设备 CSS） |
| 动画 / 拖拽 | GSAP + `@gsap/react` + `Draggable` |
| 物理 | Matter.js（无重力、边界碰撞、叠放） |

**不要**用 Framer Motion 或纯 CSS `@keyframes` 替代 LED 频率映射——频率需 runtime 随距离连续变化。

## 目录结构

```
app/
  page.tsx              # 首页，渲染 DevicePlayground
  layout.tsx            # 根布局、metadata
  globals.css           # Tailwind + 拟物外壳 / LED / 主控设备样式

components/device-playground/
  DevicePlayground.tsx  # 主容器：初始化、Draggable、编排 hooks
  DeviceCard.tsx        # 单台拟物设备 UI（外壳、小屏、LED）
  useDevicePhysics.ts   # Matter 引擎、刚体、DOM 同步
  useProximityEffects.ts # Dock 放大 + LED timeScale 近场逻辑
  constants.ts          # 尺寸、阈值、匹配分档、distanceToLedTimeScale
  types.ts              # DeviceState 等类型
```

路径别名：`@/*` → 项目根目录。

## 核心交互约定

1. **主控设备**：`OWNER_DEVICE_INDEX = 0`（RM-01），`isOwner: true`，青色边框 + 「我的设备」文案。
2. **可匹配设备**：10 台中随机 3 台 `matchable: true`，屏幕显示 `match XX%`。
3. **LED 逻辑**：仅当拖动**主控设备**时，match 设备的 LED 随距离加速；用 **持久 GSAP timeline + `timeScale`** 调速，不要每帧 kill/recreate timeline。
4. **LED DOM**：`device-led-stack` > `device-led-glow` + `device-led-core`；GSAP 只动画内部节点，避免与 Tailwind `transform` 冲突。
5. **物理**：拖拽时刚体 `setStatic(true)`，松手后恢复；`afterUpdate` 将非拖拽设备 body 位置同步回 DOM。

## 改代码时注意

- 所有 canvas / GSAP / Matter 逻辑必须在 `'use client'` 组件内。
- 动画 setup 优先用 `useGSAP({ scope: ref })`，unmount 时自动 revert。
- 调参集中在 `constants.ts`（`DOCK_RADIUS`、`LED_PROXIMITY_RANGE`、`distanceToLedTimeScale` 等）。
- 保持 diff 小：不要引入通用拟物 UI 库（Tactile UI、skeu-ui 等），设备形态是自定义的。
- 尊重 `prefers-reduced-motion`（见 `useProximityEffects`）。

## 常用命令

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## Phase 2 方向（供后续 agent 参考）

- Matter 碰撞检测 → 两台 matchable 设备碰一碰触发匹配
- Web Audio tick 音效 + 匹配成功屏（分值、共同标签、话题）
- Phase 3：雷达扫描动画、完整 6 步见面仪式
