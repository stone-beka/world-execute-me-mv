# 场景引擎 P1 + 旧片桥接 设计规格

- 日期：2026-10-02
- 状态：待导演评审 → 已获口头确认（桥接方案 A）
- 范围：**P1 只读预览器** + **board 桥接**（让现有 14 块画板走场景引擎）
- 前置：P0 已合入 `master`（`src/scene/`、`tools/scene.js`、`scenes/p0-demo.json`）

---

## 1. 目标

1. **P1 预览器**：本地网页，拖时间轴即可看一个场景播放（服务端出帧，所见即成片）；只读，不能编辑。
2. **旧片桥接**：让现有 14 块手写画板（`shot-01`…`shot-14`）能被场景引擎播放和出片——**旧画面一帧不改**，一条 `scenes/full-mv.json` 还原整支 MV，之后可逐块替换成声明式元素。

## 2. 非目标

- 编辑器 / 拖拽 / 属性面板 / 图层树 UI（P2）
- 把 14 块画板重写成 scene JSON 元素（方案 B，已否决：工作量大、程序化画面表达不了会丢细节）
- 组合块、自由层、伪 3D（P3/P5）

---

## 3. 桥接设计（方案 A）

### 3.1 格式扩展

场景顶层新增可选字段：

```json
{
  "id": "full-mv",
  "title": "world.execute(me); — 全片（旧画板桥接）",
  "durationMs": 212000,
  "boards": ["shot-01", "shot-02", "…", "shot-14"],
  "elements": []
}
```

- `boards`：要纳入的画板 id 数组（默认 `[]`）。画板的区间 / z 序 / 淡入淡出**全部由画板自己的 `meta` 决定**，场景不重复声明。
- `elements`：声明式元素，**叠在画板之上**绘制。
- 校验放宽：`elements` 可为空，**当且仅当** `boards` 非空（至少要有东西可画）。

### 3.2 渲染

- 新增 `src/scene/board-layer.js`：
  - `ensureBoardsLoaded()` —— 幂等调用 `core/registry.loadBoards()`（该函数不幂等，必须只调一次）。
  - `validateBoardIds(ids)` —— 逐个核对 id 存在，缺失时报错并列出可用 id。
  - `drawSceneBoards(ctx, s, ids, opt)` —— 用引擎原生 `activeBoards(s.ms)` 取当前活跃画板，按 id 过滤，逐块用 `envelope(ms, b.startMs, b.endMs, b.meta.fade)` 施加淡入淡出后 `b.draw(ctx, s)`；记录 `used.add("board:<id>")`。
- `src/scene/evaluate.js` 的 `evaluateScene`：先 `drawSceneBoards`，再按 z 画 `elements`。**画板在下、元素在上**（便于增量替换/增强）。
- 不改 `src/core/*`。不改任何一块画板。

### 3.3 顺序与保真

- 画板之间的 z 序由 `activeBoards` 返回顺序（= `core/registry` 的 z→start 排序）保证，与 `core/render.js` 完全一致。
- 地板（`config.floor`）仍由 `renderSceneFrame` 在**所有图层之后**施加，与旧引擎一致。
- 因此 `boards` 含全部 14 块、`elements: []` 时，场景渲染结果应与 `core/render.js` 的全片逐字节等价（可作为兼容性验收）。

---

## 4. P1 预览器设计

### 4.1 模块

- `tools/lib/scene-view.js`（纯函数，可测）：
  - `buildInfo(scene, { lyrics, sections })` → `{ id, title, durationMs, fps, width, height, boards:[...], elements:[{id,block,notes,z}], markers:{lyrics:[{ms,text}], sections:[{startMs,endMs,name}]} }`
  - `renderPage(info)` → 完整 HTML 字符串（内联 CSS/JS，无外部依赖）
- `tools/scene-preview.js`（服务器，纯 node http，仿 `tools/inspect.js`）：
  - `GET /` → 页面
  - `GET /info` → `buildInfo` 的 JSON
  - `GET /frame?ms=<ms>` → 该毫秒的 PNG（`renderSceneFrame`）
  - `--file <scene>`（默认 `scenes/p0-demo.json`）、`--port <n>`（默认 7712）
  - 加载流程：`registerProjectFonts()` → `loadBlocks()` → `normalizeScene` → `assertSceneBlocks` → 若 `boards` 非空则 `ensureBoardsLoaded()` + `validateBoardIds`
- `package.json`：`"scene:preview": "node tools/scene-preview.js"`

### 4.2 页面能力（只读）

- 时间滑块（0..durationMs，step 1ms）+ `←`/`→`（Shift = 10ms 微调）选时间。
- 主画面：`<img>` 指向 `/frame?ms=`（服务端渲染）。
- 顶部：当前时间 / 节拍 / 段落名 / 当前歌词句。
- 时间轴下方：歌词行 + 段落边界的刻度标记（可点跳转）。
- 侧栏：画板清单 + 声明式元素清单（含 `notes`），当前时刻活跃的项高亮。
- **无任何编辑能力**。

### 4.3 性能

- 服务端出帧单帧约十几到几十 ms；滑块 `input` 事件做去抖（~30ms），并对相邻帧做预取（可选，P1 先不做也行）。

---

## 5. 兼容性验收

- `scenes/full-mv.json`：`boards` = 全部 14 块，`elements: []`。
- 抽若干时刻（如 1s / 15s / 45s / 100s / 200s）用场景引擎出图，与 `core/render.js` 出图**逐字节比对**，必须一致。
- `npm run scene -- --file scenes/full-mv.json --video --post` 出全片。
- 预览器能打开 `full-mv.json` 并拖动时间轴。

---

## 6. 风险

- `loadBoards()` 非幂等 → 用 `ensureBoardsLoaded()` 单次守卫。
- 画板 z 序：混合场景里元素恒在画板之上；若将来需要元素垫在画板下，再引入全局 z（P2 再说）。
- 全片出片耗时长（212s，带后期 ≈ 38fps → 约 1.5–2 分钟），验收时抽帧为主。

---
