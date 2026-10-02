# 场景引擎 P1 + 旧片桥接 Implementation Plan

> **For agentic workers:** execute task-by-task. Steps use checkbox (`- [ ]`) syntax. This increment is executed inline (single session) with commits per task.

**Goal:** 加 board 桥接让旧 14 块画板走场景引擎，并做 P1 只读预览器。

**Architecture:** 场景格式加顶层 `boards` 数组；新 `src/scene/board-layer.js` 用引擎原生 `activeBoards` + `envelope` 画旧画板（一帧不改），声明式元素叠在其上。P1 是纯 node http 服务器 + 一个只读网页，服务端 `renderSceneFrame` 出帧。

**Tech Stack:** Node ≥ 20 ESM、`@napi-rs/canvas`、`node:http`、`node:test`；零新增依赖。

## Global Constraints

- 禁止在 `src/` 用 `Math.random/Date.now/performance.now/new Date/requestAnimationFrame`；`tools/*` 需要时进 ALLOW 表。
- 不改 `src/core/*`、不改任何 `src/boards/*` 画板。
- 时间只经 `src/core/timeline.js`。
- `npm run verify` 四关必须保持全绿；`npm test` 全绿。
- 不改 `src/scene/format.js` 的「块无关」约束（不得引用具体块/画板名）。

---

- [ ] **Task 1 — 格式：`boards` 字段**
  - 改 `src/scene/format.js`：接受顶层 `boards`（字符串数组，默认 `[]`）；放宽「`elements` 非空」为「`elements` 非空 **或** `boards` 非空」；返回对象含 `boards`。
  - 测试 `tests/scene/format.test.js`：boards-only 通过；boards 含非字符串报错；空 elements+空 boards 仍报错。
  - 提交。

- [ ] **Task 2 — 桥接：`src/scene/board-layer.js` + 求值器接入**
  - 新 `src/scene/board-layer.js`：`ensureBoardsLoaded()`（幂等单次）、`validateBoardIds(ids)`、`drawSceneBoards(ctx, s, ids, opt)`（用 `activeBoards` + 逐块 `envelope` + 逐块 `s` 增强，复刻 `core/render.js` 的 `local/localMs/remainMs/startMs/endMs/env/__boardFile`）。
  - 改 `src/scene/evaluate.js`：`evaluateScene` 先 `drawSceneBoards` 再画 `elements`。
  - 改 `tools/scene.js`：场景含 `boards` 时 `ensureBoardsLoaded()` + `validateBoardIds()`；`--selfcheck` 的 `declared` 纳入 `board:<id>`。
  - 测试 `tests/scene/board-layer.test.js`：加载画板后，`shot-01` 在 1s 有落墨、在 20s 无落墨；`used` 含 `board:shot-01`；未知 id 报错。
  - 提交。

- [ ] **Task 3 — P1 纯函数：`tools/lib/scene-view.js`**
  - `buildInfo(scene, {lyrics, sections})`、`renderPage(info)`。
  - 测试 `tests/scene-view.test.js`：buildInfo 形状 + markers；renderPage 含 durationMs/slider/`/frame`。
  - 提交。

- [ ] **Task 4 — P1 服务器 + 全片场景 + 脚本**
  - 新 `tools/scene-preview.js`（`/`、`/info`、`/frame?ms=`，`--file`/`--port`）。
  - `scenes/full-mv.json`（`boards` = 14 块）。
  - `package.json` 加 `"scene:preview"`。
  - 测试 `tests/scene-preview.test.js`：起临时端口，`/info` JSON、`/frame` PNG 魔数、同 ms 两次一致。
  - 提交。

- [ ] **Task 5 — 兼容性验收**
  - 抽 5 个时刻，场景引擎出图 vs `core/render.js` 出图逐字节比对（临时脚本，跑完即删或放 tests）。
  - `npm run verify` 四关；`npm test`。
  - `scenes/full-mv.json` 出静帧确认。
  - 记录结果；如需刷新基线则提交。

---

## 自检

- Spec 覆盖：格式扩展→T1；桥接渲染→T2；P1 模块→T3/T4；兼容验收→T5。
- 不改 core/boards；`verify` 全绿；零新依赖。
