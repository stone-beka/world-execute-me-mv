---
name: mv-board-authoring
description: Use when adding or editing a board (src/boards/*.js) in the world.execute(me); code-driven MV — the meta/draw contract, the s state surface, fade envelopes, deterministic (seed, frame) drawing, and Canvas 2D recipes. Triggers - 画板, board, 加画面, 新场景, draw, 淡入淡出, 辉光, 卡拍, canvas, 逐帧.
---

# 画板开发（world.execute(me);）

本工程没有剪辑软件：**一块画板 = 一个时间段 + 一个纯绘制函数**（`src/boards/*.js`）。
核心承诺是「同 seed + 同帧号 = 同像素」。改任何画板前先读 `E:\ai-movie\AGENTS.md` 的铁律。

## 工作流（先看这条，AGENTS.md 里最重要的一条）

**策划由用户 100% 负责，Agent 不替用户定创作方向。**

- **一个关键画面 / 一个动作流程**为单位推进，严格串行，不许跳步。
- 读到策划里不懂的地方 → **停下来问**，不要脑补一个「合理的」版本往下做。
- 每一步都要**给用户看**，用 `node tools/preview.js --only <画板id>`，几秒出图；
  **严禁**为了看一块画板去渲全片。
- 用户没明确点头之前，不要把这块画板当成「已完成」往下叠（画面是叠加的，底子错了后面全歪）。
- 判断「是否该继续」的唯一依据是**用户的话**，不是 Agent 自己的满意度。

## 30 秒上手

复制 `src/boards/00-smoke.js` 当模板 → 改 `meta.id` / 时间 / 画法 → 先给用户看单画面：

```powershell
node tools/preview.js --only <画板id>     # ★ 几秒出联络表，串行过关用这个
npm run verify:gap                        # 结构层：有没有没人覆盖的帧
npm run verify                            # gap-check + determinism-check，两个都要绿
```

最小骨架：

```js
export const meta = {
  id: "unique-id",        // 必须全片唯一，否则 registry.js 直接抛错
  z: 100,                 // 越大越靠上；同 z 同区间重叠会被 gap-check 标黄
  startMs: 12_000,
  endMs: 18_000,          // 也允许写成函数 () => 别的画板的 endMs
  fade: { fadeInMs: 132, fadeOutMs: 200 },
};

export function draw(ctx, s) {
  ctx.save();
  ctx.globalAlpha = s.env;      // ★ 信封值，不乘它画面就会硬切
  // ... 画 ...
  ctx.restore();
}
```

## 硬性约定（review 按这几条卡）

| 约定 | 说明 |
|---|---|
| 必须导出 `meta` 和 `draw` | `registry.js` 检查 `meta.id` 唯一 + `draw` 是函数 |
| 文件名 `NN-name.js` | `NN` 只影响人类阅读顺序；层级由 `meta.z` / `startMs` 决定 |
| 禁用 `Math.random` / `Date.now` / `performance.now` / `new Date` / `requestAnimationFrame` | `verify/determinism-check.js` 静态扫描，命中即失败 |
| 禁止跨帧状态 | 渲染第 5000 帧时，不许依赖第 4999 帧留下的任何变量 |
| 必须有淡入淡出 | 用 `meta.fade`（引擎自动算 `s.env`）；有意硬切用 `fade.js` 的 `hardCut()` |
| 时间只从 `s` / `timeline.js` 取 | 画板里写 `60000 / 130` 这种字面量 = 打回重写 |
| 用 `ctx.save()/restore()` 包住绘制 | 别污染后面画板的全局状态 |
| 辉光用叠加圆，不用 `ctx.filter = 'blur()'` | 慢且跨平台不一致 |

## `draw(ctx, s)` 里能拿到什么

| 字段 | 含义 |
|---|---|
| `s.frame` / `s.ms` / `s.t` | 帧号 / 毫秒 / 秒 |
| `s.beat` / `s.bar` | 浮点拍号 / 小节号（beat 0 = `beatOffsetMs`） |
| `s.beatPhase` / `s.barPhase` | 当前拍 / 小节内进度 `[0,1)`，**卡拍全靠它** |
| `s.env` | 引擎算好的信封 0..1，直接当 `globalAlpha` 用 |
| `s.local` / `s.localMs` / `s.remainMs` | 画板内进度 / 已播时长 / 剩余时长 |
| `s.startMs` / `s.endMs` | 本画板区间（`endMs` 排他） |
| `s.rnd(k)` / `s.range(a,b,k)` / `s.int(a,b,k)` / `s.pick(arr,k)` | 确定性随机，已绑 seed + frame |
| `s.noise(x,ch)` / `s.fbm(x,oct,ch)` | 平滑噪声；坐标传帧号则时间上连续 |
| `s.W` / `s.H` / `s.colors` | 1920 / 1080 / 调色板 `{bg,fg,accent,warn,danger}` |
| `s.hash(...k)` | 原始 uint32 哈希 |

工具：`import { rgba, mixColor } from "../core/fade.js"`；
缓动：`import { easeOutCubic, easeOutBack, pulse, clamp01 } from "../core/kernel.js"`。

## 卡拍的标准写法

```js
const decay = Math.pow(1 - s.beatPhase, 3);   // 每拍从 1 衰减到 0
const r = base + 70 * decay;                  // 拍点瞬间放大再收回
if (s.beatPhase < 0.35) { /* 扩散环 */ }
```

「世界状态曲线」用 `s.fbm(s.frame * 0.006, 3, ch)`，**不要用累加器**，
也不要用 `Math.sin` 假装跨平台一致（浮点实现有差异）。

## 常见坑

- **忘了乘 `s.env`** → 画面硬切，片感立刻变 PPT；`gap-check` 会报「该可见却空」。
- **画板间共享模块级变量**（`let lastY = 0`）→ `determinism-check` 的乱序/交错渲染会抓到。
- **`ctx.filter` / `shadowBlur`**：跨机器像素不一致，辉光改成叠 3 层不同半径半透明圆。
- **用系统字体渲染文字** → 换机器字体不同；用 `monospace` 或后续引入的字体文件。
- **相邻画板首尾重叠 1 帧**：`endMs` 是排他的（`ms < endMs`），首尾相接别重叠。
- **`meta.id` 撞车**：`registry.js` 会抛 `画板 id 重复`。

更多绘制招式（扫描线、打字机、网格、波形、噪点、辉光）见 `references/board-recipes.md`。
