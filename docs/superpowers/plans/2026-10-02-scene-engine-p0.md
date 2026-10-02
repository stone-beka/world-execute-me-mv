# 场景引擎 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"场景 JSON → 确定性画面"这条地基跑通：定义格式、块库、求值器，并提供 `scene → PNG/联络表/视频` 的 CLI。

**Architecture:** 新增一层 `src/scene/`，与现有 14 块手写画板互不干扰。`format.js` 校验并补默认值；`registry.js` 按 manifest 动态加载"元素块 / 轨迹块 / 特效块"；`evaluate.js` 把"元素 + 毫秒"解析成变换与激活特效后交给块绘制；`render.js` 镜像 `src/core/render.js` 的结构（清屏 / 求值 / 地板 / 子帧），复用其像素输出与 `motion.js` / `_ui.js` / `post.js` 能力。CLI `tools/scene.js` 负责出图/出片。

**Tech Stack:** Node ≥ 20（ESM）、`@napi-rs/canvas`、`ffmpeg-static`、`node:test`（内置测试运行器）；不新增任何依赖。

## Global Constraints

- Node ≥ 20；全部 ESM（`package.json` 已是 `"type": "module"`）。
- **禁止**在 `src/` 出现 `Math.random(`、`Date.now(`、`performance.now(`、`new Date(`、`requestAnimationFrame`。`tools/scene.js` 若用 `Date.now()` 只可用于打印耗时，且必须进 `verify/determinism-check.js` 的 ALLOW 表（Task 8）。
- **时间只从 `config/project.json` 经 `src/core/timeline.js` 读取**。禁止写 `60000 / 130` 这类字面量。
- 画面是 `(seed, frame)` 的纯函数；块与求值器**不许留任何跨帧状态**（无累加器）。
- 字体一律 `s.mono(px, weight)`（`src/core/fonts.js`），禁止裸 `monospace`。
- **不新增 npm 依赖**；只用 `@napi-rs/canvas`、`ffmpeg-static` 与 Node 内置模块。
- 已知块名（P0 固定集合）：元素 `rect` / `text` / `wireHeart`；轨迹 `move` / `scale`；特效 `glow`。
- 场景内所有时间是**场景内绝对毫秒**（`0 ≤ ms < durationMs`）。
- `npm run verify` 四关必须保持全绿；本次改动不得让 `src/scene/*` 或 `tools/scene.js` 命中禁用 API。
- 每个 Task 结束都要 commit（Conventional Commits）。

---

## 文件结构

```
src/scene/
  format.js            场景校验 + 默认值（纯结构，不碰注册表）
  registry.js          块注册表：loadBlocks / getElementBlock / getTrackBlock / getFxBlock / names / assertSceneBlocks
  evaluate.js          resolveElement(element, ms) + evaluateScene(ctx, scene, s, opt)
  render.js            renderSceneFrame(ctx, scene, frame, opt)
  blocks/
    element.rect.js        name="rect"       kind="element"
    element.text.js        name="text"       kind="element"
    element.wireHeart.js   name="wireHeart"  kind="element"
    track.move.js          name="move"       kind="track"
    track.scale.js         name="scale"      kind="track"
    fx.glow.js             name="glow"       kind="fx", mode="wrap"
scenes/
  p0-demo.json         手写样张（3 个元素用满 P0 块集）
tools/
  scene.js             CLI
tests/scene/
  format.test.js
  registry.test.js
  blocks.test.js
  evaluate.test.js
  render.test.js
```

职责边界：`format.js` 只管结构；`registry.js` 只管"块从哪来、叫什么"；`evaluate.js` 只管"某毫秒这颗元素长什么样"；`render.js` 只管"一帧像素"；`tools/scene.js` 只管 I/O 与 ffmpeg。

---

## Task 1: 测试脚手架 + 场景格式校验

**Files:**
- Create: `src/scene/format.js`
- Create: `tests/scene/format.test.js`
- Modify: `package.json`（scripts 增加 `"test"`）

**Interfaces:**
- Consumes: 无（只依赖 `node:assert`，不依赖其余场景模块）。
- Produces:
  - `class SceneFormatError extends Error`
  - `normalizeScene(raw) -> scene`，其中 `scene = { id, title, durationMs, background, elements }`，每个 `element = { id, block, params, at:{x,y,scale,rot,alpha}, life:{inMs,outMs,fadeInMs,fadeOutMs}, tracks:[...], z, notes }`；`tracks` 按 `startMs` 升序。

- [ ] **Step 1: 在 `package.json` 的 `scripts` 里加（放在 `"smoke"` 之后）**

```json
    "test": "node --test",
```

> Node ≥20 兼容。`node --test tests/` 在 Node 24 上会把 `tests/` 当模块解析而报错，所以用无参形式，让 Node 自行发现 `tests/**/*.test.js`。

- [ ] **Step 2: 写失败测试 `tests/scene/format.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScene, SceneFormatError } from "../../src/scene/format.js";

test("normalizeScene 填默认值", () => {
  const s = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 10, y: 20 } }],
  });
  assert.equal(s.elements[0].at.scale, 1);
  assert.equal(s.elements[0].at.rot, 0);
  assert.equal(s.elements[0].at.alpha, 1);
  assert.equal(s.elements[0].life.inMs, 0);
  assert.equal(s.elements[0].life.outMs, 1000);
  assert.equal(s.elements[0].life.fadeInMs, 0);
  assert.deepEqual(s.elements[0].tracks, []);
  assert.equal(s.elements[0].z, 0);
  assert.equal(s.elements[0].notes, "");
});

test("tracks 按 startMs 升序稳定排序", () => {
  const s = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [
      {
        id: "a",
        block: "rect",
        at: { x: 0, y: 0 },
        tracks: [
          { kind: "move", startMs: 500, durMs: 100 },
          { kind: "scale", startMs: 100, durMs: 100 },
        ],
      },
    ],
  });
  assert.deepEqual(
    s.elements[0].tracks.map((t) => t.kind),
    ["scale", "move"],
  );
});

test("缺 durationMs 报错", () => {
  assert.throws(() => normalizeScene({ id: "t", elements: [] }), SceneFormatError);
});

test("elements 为空报错", () => {
  assert.throws(() => normalizeScene({ id: "t", durationMs: 100, elements: [] }), SceneFormatError);
});

test("元素 id 重复报错", () => {
  assert.throws(
    () =>
      normalizeScene({
        id: "t",
        durationMs: 100,
        elements: [
          { id: "a", block: "rect", at: { x: 0, y: 0 } },
          { id: "a", block: "rect", at: { x: 1, y: 1 } },
        ],
      }),
    /id 重复/,
  );
});

test("life.outMs <= inMs 报错", () => {
  assert.throws(
    () =>
      normalizeScene({
        id: "t",
        durationMs: 100,
        elements: [
          { id: "a", block: "rect", at: { x: 0, y: 0 }, life: { inMs: 50, outMs: 50 } },
        ],
      }),
    /outMs/,
  );
});

test("at.x/at.y 非数字报错", () => {
  assert.throws(
    () =>
      normalizeScene({
        id: "t",
        durationMs: 100,
        elements: [{ id: "a", block: "rect", at: { x: "0", y: 0 } }],
      }),
    /at\.x/,
  );
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '.../src/scene/format.js'`

- [ ] **Step 4: 实现 `src/scene/format.js`**

```js
/**
 * format.js — 场景格式校验 + 默认值
 *
 * 只管结构，不认识任何块（块名合法性由 registry.assertSceneBlocks 负责）。
 * 纯函数：normalizeScene(raw) 不修改入参，返回规整后的新对象。
 */

export class SceneFormatError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "SceneFormatError";
  }
}

const num = (v, d) => (Number.isFinite(v) ? v : d);

export function normalizeScene(raw) {
  if (!raw || typeof raw !== "object") throw new SceneFormatError("场景必须是一个对象");
  if (typeof raw.id !== "string" || !raw.id) throw new SceneFormatError("场景缺少字符串 id");
  if (!Number.isFinite(raw.durationMs) || raw.durationMs <= 0) {
    throw new SceneFormatError(`场景 "${raw.id}" 的 durationMs 必须是正数`);
  }
  if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
    throw new SceneFormatError(`场景 "${raw.id}" 的 elements 必须是非空数组`);
  }

  const seen = new Set();
  const elements = raw.elements.map((el, i) => normalizeElement(el, i, raw.durationMs, seen));
  elements.sort((a, b) => a.z - b.z);
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    durationMs: raw.durationMs,
    background: typeof raw.background === "string" ? raw.background : null,
    elements,
  };
}

function normalizeElement(el, i, durationMs, seen) {
  const where = `elements[${i}]`;
  if (!el || typeof el !== "object") throw new SceneFormatError(`${where} 必须是对象`);
  if (typeof el.id !== "string" || !el.id) throw new SceneFormatError(`${where} 缺少字符串 id`);
  if (seen.has(el.id)) throw new SceneFormatError(`元素 id 重复：${el.id}`);
  seen.add(el.id);
  if (typeof el.block !== "string" || !el.block) {
    throw new SceneFormatError(`元素 "${el.id}" 缺少字符串 block`);
  }
  if (!el.at || !Number.isFinite(el.at?.x) || !Number.isFinite(el.at?.y)) {
    throw new SceneFormatError(`元素 "${el.id}" 的 at.x/at.y 必须是数字`);
  }

  const inMs = num(el.life?.inMs, 0);
  const outMs = num(el.life?.outMs, durationMs);
  if (outMs <= inMs) {
    throw new SceneFormatError(`元素 "${el.id}" 的 life.outMs (${outMs}) 必须大于 inMs (${inMs})`);
  }

  const tracks = (Array.isArray(el.tracks) ? el.tracks : [])
    .map((seg, j) => normalizeTrack(seg, el.id, j))
    .sort((a, b) => a.startMs - b.startMs);

  return {
    id: el.id,
    block: el.block,
    params: el.params && typeof el.params === "object" ? el.params : {},
    at: {
      x: el.at.x,
      y: el.at.y,
      scale: num(el.at.scale, 1),
      rot: num(el.at.rot, 0),
      alpha: num(el.at.alpha, 1),
    },
    life: { inMs, outMs, fadeInMs: num(el.life?.fadeInMs, 0), fadeOutMs: num(el.life?.fadeOutMs, 0) },
    tracks,
    z: num(el.z, 0),
    notes: typeof el.notes === "string" ? el.notes : "",
  };
}

function normalizeTrack(seg, elId, j) {
  const where = `元素 "${elId}" 的 tracks[${j}]`;
  if (!seg || typeof seg !== "object") throw new SceneFormatError(`${where} 必须是对象`);
  if (typeof seg.kind !== "string" || !seg.kind) throw new SceneFormatError(`${where} 缺少字符串 kind`);
  const startMs = num(seg.startMs, 0);
  const durMs = num(seg.durMs, 0);
  if (startMs < 0) throw new SceneFormatError(`${where} 的 startMs 不能为负`);
  if (durMs < 0) throw new SceneFormatError(`${where} 的 durMs 不能为负`);
  return { ...seg, kind: seg.kind, startMs, durMs, ease: seg.ease ?? "inout" };
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npm test`
Expected: PASS（`src/scene/format.js` 的 7 个断言全过）

- [ ] **Step 6: Commit**

```bash
git add package.json src/scene/format.js tests/scene/format.test.js
git commit -m "feat(scene): 场景格式校验与默认值"
```

---

## Task 2: 块注册表

**Files:**
- Create: `src/scene/registry.js`
- Create: `tests/scene/registry.test.js`

**Interfaces:**
- Consumes: 无（动态 import manifest，块文件在 Task 3–4 才存在；本任务的测试先只验证"未知块报错"和"manifest 文件缺失时的报错信息"）。
- Produces:
  - `async loadBlocks()` —— 幂等；按 manifest 动态 import，建 `elements` / `tracks` / `fx` 三张表，重名报错。
  - `getElementBlock(name) / getTrackBlock(name) / getFxBlock(name)` —— 找不到时抛错并列出可用块。
  - `names() -> { elements:[], tracks:[], fx:[] }`
  - `assertSceneBlocks(scene)` —— 遍历 scene，逐个校验块存在。
  - `resetBlocks()` —— 仅供测试。

- [ ] **Step 1: 写失败测试 `tests/scene/registry.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resetBlocks, getElementBlock } from "../../src/scene/registry.js";

test("未加载时查询未知元素块会报错", () => {
  resetBlocks();
  assert.throws(() => getElementBlock("nope"), /未知元素块 "nope"/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '.../src/scene/registry.js'`

- [ ] **Step 3: 实现 `src/scene/registry.js`**

```js
/**
 * registry.js — 块注册表
 *
 * 块分三类：element（画什么）、track（怎么动/缩放）、fx（加什么）。
 * AI 新增一个块 = 新增一个文件 + 在 MANIFEST 里加一行；编辑器的菜单将来从这里生成。
 */

const MANIFEST = [
  "./blocks/element.rect.js",
  "./blocks/element.text.js",
  "./blocks/element.wireHeart.js",
  "./blocks/track.move.js",
  "./blocks/track.scale.js",
  "./blocks/fx.glow.js",
];

const elements = new Map();
const tracks = new Map();
const fx = new Map();
let loaded = false;

export async function loadBlocks() {
  if (loaded) return;
  for (const rel of MANIFEST) {
    const mod = await import(new URL(rel, import.meta.url).href);
    const b = mod.default;
    if (!b || typeof b.name !== "string" || typeof b.kind !== "string") {
      throw new Error(`块文件 ${rel} 必须默认导出 { name, kind, ... }`);
    }
    const table = b.kind === "element" ? elements : b.kind === "track" ? tracks : b.kind === "fx" ? fx : null;
    if (!table) throw new Error(`块 ${b.name}（${rel}）的 kind 非法："${b.kind}"（只允许 element/track/fx）`);
    if (table.has(b.name)) throw new Error(`块名重复："${b.name}"`);
    table.set(b.name, b);
  }
  loaded = true;
}

export function getElementBlock(name) {
  const b = elements.get(name);
  if (!b) throw new Error(`未知元素块 "${name}"。可用：${[...elements.keys()].join(", ")}`);
  return b;
}

export function getTrackBlock(name) {
  const b = tracks.get(name);
  if (!b) throw new Error(`未知轨迹块 "${name}"。可用：${[...tracks.keys()].join(", ")}`);
  return b;
}

export function getFxBlock(name) {
  const b = fx.get(name);
  if (!b) throw new Error(`未知特效块 "${name}"。可用：${[...fx.keys()].join(", ")}`);
  return b;
}

export function names() {
  return { elements: [...elements.keys()], tracks: [...tracks.keys()], fx: [...fx.keys()] };
}

/** 遍历场景，逐个校验块存在（找不到会抛错并列出可用块） */
export function assertSceneBlocks(scene) {
  for (const el of scene.elements) {
    getElementBlock(el.block);
    for (const seg of el.tracks) {
      if (seg.kind === "fx") getFxBlock(seg.block);
      else getTrackBlock(seg.kind);
    }
  }
}

/** 仅供测试：清空注册表 */
export function resetBlocks() {
  elements.clear();
  tracks.clear();
  fx.clear();
  loaded = false;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS —— 本 Task 只走"未知块报错"这条**不依赖块文件**的路径（`loadBlocks` 不做动态 import 以外的事，块文件尚未存在也没关系）。六个块的完整加载断言放在 Task 4 回归。

- [ ] **Step 5: Commit**

```bash
git add src/scene/registry.js tests/scene/registry.test.js
git commit -m "feat(scene): 块注册表与 manifest 加载"
```

---

## Task 3: 元素块（rect / text / wireHeart）

**Files:**
- Create: `src/scene/blocks/element.rect.js`
- Create: `src/scene/blocks/element.text.js`
- Create: `src/scene/blocks/element.wireHeart.js`
- Create: `tests/scene/blocks.test.js`

**Interfaces:**
- Consumes: `src/boards/_ui.js` 的 `wireHeart(ctx, s, cx, cy, size, opt)`；`src/core/fonts.js` 的 `mono`。
- Produces: 三个 `kind:"element"` 块，各自 `draw(ctx, s, params)` **在原点绘制**（变换由求值器施加）。

- [ ] **Step 1: 写失败测试 `tests/scene/blocks.test.js`**

```js
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createSurface, ts } from "../../src/core/render.js";
import { makeState } from "../../src/core/registry.js";
import { frameState } from "../../src/core/timeline.js";
import { registerProjectFonts } from "../../src/core/fonts.js";

import rect from "../../src/scene/blocks/element.rect.js";
import text from "../../src/scene/blocks/element.text.js";
import wireHeart from "../../src/scene/blocks/element.wireHeart.js";

before(() => registerProjectFonts());

/** 在原点画一块，统计非底色像素 */
function inkCount(block, params, s) {
  const surface = createSurface();
  const { ctx } = surface;
  ctx.save();
  ctx.translate(400, 300);
  block.draw(ctx, s, params);
  ctx.restore();
  const d = ctx.getImageData(0, 0, ts.width, ts.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] !== 5 || d[i + 1] !== 7 || d[i + 2] !== 10) n++;
  }
  return n;
}

const S = () => makeState(0, { ...ts, ...frameState(0) });

test("rect 落在原点附近", () => {
  assert.ok(inkCount(rect, { w: 120, h: 80 }, S()) > 1000);
});

test("text 落墨", () => {
  assert.ok(inkCount(text, { text: "world.execute(me);", size: 40 }, S()) > 200);
});

test("wireHeart 落墨", () => {
  assert.ok(inkCount(wireHeart, { size: 200 }, S()) > 300);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— 三个块文件找不到

- [ ] **Step 3: 实现 `src/scene/blocks/element.rect.js`**

```js
/** element.rect.js — 圆角矩形元素块（在原点绘制） */

export default {
  name: "rect",
  kind: "element",
  params: {
    w: { type: "number", default: 200 },
    h: { type: "number", default: 120 },
    radius: { type: "number", default: 0 },
    fill: { type: "color", default: "#39ff88" },
    stroke: { type: "color", default: null },
    lineWidth: { type: "number", default: 2 },
  },
  sizeOf(p) {
    return { w: p.w ?? 200, h: p.h ?? 120 };
  },
  draw(ctx, s, p) {
    const w = p.w ?? 200;
    const h = p.h ?? 120;
    const r = Math.max(0, Math.min(p.radius ?? 0, Math.min(w, h) / 2));
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    if (p.fill !== null) {
      ctx.fillStyle = p.fill ?? s.colors.accent;
      ctx.fill();
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.lineWidth ?? 2;
      ctx.stroke();
    }
  },
};

function roundRect(ctx, x, y, w, h, r) {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
```

- [ ] **Step 4: 实现 `src/scene/blocks/element.text.js`**

```js
/** element.text.js — 文本元素块（在原点绘制，居中基线） */

export default {
  name: "text",
  kind: "element",
  params: {
    text: { type: "string", default: "world.execute(me);" },
    size: { type: "number", default: 22 },
    color: { type: "color", default: "#c8f0e8" },
    weight: { type: "number", default: 400 },
  },
  sizeOf(p) {
    return { w: (p.text ?? "").length * (p.size ?? 22) * 0.6, h: (p.size ?? 22) * 1.3 };
  },
  draw(ctx, s, p) {
    ctx.font = s.mono(p.size ?? 22, p.weight ?? 400);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.color ?? s.colors.fg;
    ctx.fillText(p.text ?? "", 0, 0);
  },
};
```

- [ ] **Step 5: 实现 `src/scene/blocks/element.wireHeart.js`**

```js
/** element.wireHeart.js — 复用 _ui.js 的线框爱心（在原点绘制） */
import { wireHeart } from "../../boards/_ui.js";

export default {
  name: "wireHeart",
  kind: "element",
  params: {
    size: { type: "number", default: 160 },
  },
  sizeOf(p) {
    return { w: p.size ?? 160, h: p.size ?? 160 };
  },
  draw(ctx, s, p) {
    wireHeart(ctx, s, 0, 0, p.size ?? 160);
  },
};
```

- [ ] **Step 6: 运行测试（Task 2 + Task 3 一起回归）**

Run: `npm test`
Expected: PASS —— `tests/scene/blocks.test.js` 3 项 + `tests/scene/registry.test.js` 2 项全过

- [ ] **Step 7: Commit**

```bash
git add src/scene/blocks/element.rect.js src/scene/blocks/element.text.js src/scene/blocks/element.wireHeart.js tests/scene/blocks.test.js
git commit -m "feat(scene): rect/text/wireHeart 元素块"
```

---

## Task 4: 轨迹块（move / scale）与特效块（glow）

**Files:**
- Create: `src/scene/blocks/track.move.js`
- Create: `src/scene/blocks/track.scale.js`
- Create: `src/scene/blocks/fx.glow.js`
- Create: `tests/scene/blocks.test.js`（追加测试）

**Interfaces:**
- Consumes: `src/core/kernel.js` 的 `lerp`、`clamp01`。
- Produces:
  - `move`：`apply(state, e, seg)`，`state = {x,y,scale,rot,alpha}`。`seg.path` 支持 `"line"`（需 `from`/`to`）、`"orbit"`（需 `center`/`from`，可选 `sweep`(度)/`clockwise`）、`"curve"`（需 `from`/`to`/`via`）。缺字段抛错。
  - `scale`：`apply(state, e, seg)`，`state.scale = lerp(seg.from, seg.to, e)`。
  - `glow`：`kind:"fx"`、`mode:"wrap"`、`drawWrapped(ctx, s, inner, p, params)`。

- [ ] **Step 1: 追加失败测试到 `tests/scene/blocks.test.js` 末尾**

```js
import move from "../../src/scene/blocks/track.move.js";
import scale from "../../src/scene/blocks/track.scale.js";
import glow from "../../src/scene/blocks/fx.glow.js";
import { createSurface as surface } from "../../src/core/render.js";
import { resetBlocks, loadBlocks, names } from "../../src/scene/registry.js";

test("六个块全部载入（Task 2 的完整回归）", async () => {
  resetBlocks();
  await loadBlocks();
  const n = names();
  assert.deepEqual(n.elements.slice().sort(), ["rect", "text", "wireHeart"]);
  assert.deepEqual(n.tracks.slice().sort(), ["move", "scale"]);
  assert.deepEqual(n.fx, ["glow"]);
});

test("move.line 起点/终点/保持", () => {
  const seg = { path: "line", from: { x: 10, y: 20 }, to: { x: 110, y: 20 } };
  const st = { x: 0, y: 0 };
  move.apply(st, 0, seg);
  assert.equal(st.x, 10);
  move.apply(st, 1, seg);
  assert.equal(st.x, 110);
  move.apply(st, 0.5, seg);
  assert.equal(st.x, 60);
});

test("move.orbit 半圈到对侧", () => {
  const seg = { path: "orbit", center: { x: 0, y: 0 }, from: { x: 200, y: 0 }, sweep: 360 };
  const st = { x: 0, y: 0 };
  move.apply(st, 0.5, seg);
  assert.ok(Math.abs(st.x - -200) < 1e-6, `x=${st.x}`);
  assert.ok(Math.abs(st.y) < 1e-6, `y=${st.y}`);
});

test("move.curve 中点等于贝塞尔", () => {
  const seg = { path: "curve", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, via: { x: 50, y: 100 } };
  const st = { x: 0, y: 0 };
  move.apply(st, 0.5, seg);
  assert.equal(st.x, 50);
  assert.equal(st.y, 50);
});

test("move 缺字段抛错", () => {
  assert.throws(() => move.apply({}, 0.5, { path: "line", from: { x: 0, y: 0 } }), /move/);
});

test("scale 线性", () => {
  const st = { scale: 1 };
  scale.apply(st, 0.5, { from: 1, to: 3 });
  assert.equal(st.scale, 2);
});

test("glow 包裹器会多次调用 inner(s = 0 时至少画一次)", () => {
  const sv = surface();
  let calls = 0;
  glow.drawWrapped(sv.ctx, S(), () => { calls++; }, 1, { radius: 10 });
  assert.ok(calls >= 2, `calls=${calls}`);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '.../track.move.js'`

- [ ] **Step 3: 实现 `src/scene/blocks/track.move.js`**

```js
/** track.move.js — 轨迹预设：line / orbit / curve */
import { lerp } from "../../core/kernel.js";

export default {
  name: "move",
  kind: "track",
  channels: ["x", "y"],
  apply(state, e, seg) {
    const path = seg.path ?? "line";
    const a = seg.from;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) {
      throw new Error('move 需要 from{x,y}');
    }

    if (path === "orbit") {
      const c = seg.center;
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) throw new Error("move.orbit 需要 center{x,y}");
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const a0 = Math.atan2(a.y - c.y, a.x - c.x);
      const dir = seg.clockwise === false ? -1 : 1;
      const ang = a0 + dir * ((seg.sweep ?? 360) * Math.PI / 180) * e;
      state.x = c.x + Math.cos(ang) * r;
      state.y = c.y + Math.sin(ang) * r;
      return;
    }

    const b = seg.to;
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new Error('move 需要 to{x,y}');

    if (path === "curve") {
      const v = seg.via;
      if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new Error("move.curve 需要 via{x,y}");
      const u = 1 - e;
      state.x = u * u * a.x + 2 * u * e * v.x + e * e * b.x;
      state.y = u * u * a.y + 2 * u * e * v.y + e * e * b.y;
      return;
    }

    if (path !== "line") throw new Error(`move 不认识的 path："${path}"（line/orbit/curve）`);
    state.x = lerp(a.x, b.x, e);
    state.y = lerp(a.y, b.y, e);
  },
};
```

- [ ] **Step 4: 实现 `src/scene/blocks/track.scale.js`**

```js
/** track.scale.js — 缩放轨迹 */
import { lerp } from "../../core/kernel.js";

export default {
  name: "scale",
  kind: "track",
  channels: ["scale"],
  apply(state, e, seg) {
    state.scale = lerp(seg.from ?? 1, seg.to ?? 1, e);
  },
};
```

- [ ] **Step 5: 实现 `src/scene/blocks/fx.glow.js`**

```js
/**
 * fx.glow.js — 辉光（wrap 型）
 *
 * 不用 ctx.filter（慢且跨平台不一致）：把元素按更大比例重画两层半透明。
 * 元素在原点绘制，所以对 ctx 做 scale 就等于把它放大。
 */

export default {
  name: "glow",
  kind: "fx",
  mode: "wrap",
  params: {
    radius: { type: "number", default: 12 },
    intensity: { type: "number", default: 0.5 },
  },
  drawWrapped(ctx, s, inner, p, params) {
    const amt = p <= 0 ? 0 : p >= 1 ? 1 : p;
    if (amt <= 0) {
      inner();
      return;
    }
    const scaleUp = (params.radius ?? 12) / 100; // 12 → 0.12
    const base = (params.intensity ?? 0.5) * amt;
    for (const [m, a] of [
      [1 + scaleUp * 2.0, 0.35],
      [1 + scaleUp, 0.6],
    ]) {
      ctx.save();
      ctx.scale(m, m);
      ctx.globalAlpha *= a * base;
      inner();
      ctx.restore();
    }
    inner();
  },
};
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `npm test`
Expected: PASS —— `blocks.test.js` 全部通过

- [ ] **Step 7: Commit**

```bash
git add src/scene/blocks/track.move.js src/scene/blocks/track.scale.js src/scene/blocks/fx.glow.js tests/scene/blocks.test.js
git commit -m "feat(scene): move/scale 轨迹块与 glow 特效块"
```

---

## Task 5: 求值器（resolveElement / evaluateScene）

**Files:**
- Create: `src/scene/evaluate.js`
- Create: `tests/scene/evaluate.test.js`

**Interfaces:**
- Consumes: `src/scene/registry.js` 的 `getElementBlock/getTrackBlock/getFxBlock`；`src/core/fade.js` 的 `envelope`；`src/core/motion.js` 的 `easeFn`；`src/core/kernel.js` 的 `clamp01`；`src/scene/format.js` 的 `normalizeScene`（测试用）。
- Produces:
  - `resolveElement(element, ms) -> { visible, x, y, scale, rot, alpha, fx:[{block,p,params}] }`
  - `evaluateScene(ctx, scene, s, opt?) -> drawn:number`，`opt.used` 是可选 `Set`，会记录 `"element:<name>"` 与 `"fx:<name>"`。

- [ ] **Step 1: 写失败测试 `tests/scene/evaluate.test.js`**

```js
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { normalizeScene } from "../../src/scene/format.js";
import { loadBlocks } from "../../src/scene/registry.js";
import { resolveElement } from "../../src/scene/evaluate.js";

before(async () => { await loadBlocks(); });

function el(over) {
  return normalizeScene({
    id: "s",
    durationMs: 10000,
    elements: [{ id: "a", block: "rect", at: { x: 0, y: 0 }, ...over }],
  }).elements[0];
}

test("生命周期外不可见，内可见", () => {
  const e = el({ life: { inMs: 1000, outMs: 2000 } });
  assert.equal(resolveElement(e, 500).visible, false);
  assert.equal(resolveElement(e, 2500).visible, false);
  assert.equal(resolveElement(e, 1500).visible, true);
});

test("move 到点后保持", () => {
  const e = el({
    tracks: [{ kind: "move", path: "line", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, startMs: 0, durMs: 1000, ease: "linear" }],
  });
  assert.equal(resolveElement(e, 500).x, 50);
  assert.equal(resolveElement(e, 5000).x, 100);
});

test("fx 只在窗口内激活", () => {
  const e = el({ tracks: [{ kind: "fx", block: "glow", startMs: 1000, durMs: 500 }] });
  assert.equal(resolveElement(e, 500).fx.length, 0);
  assert.equal(resolveElement(e, 1250).fx.length, 1);
  assert.equal(resolveElement(e, 2000).fx.length, 0);
});

test("生命淡入让 alpha 在半个淡入时长处约 0.5", () => {
  const e = el({ life: { inMs: 0, outMs: 1000, fadeInMs: 100 } });
  const a = resolveElement(e, 50).alpha;
  assert.ok(a > 0.4 && a < 0.6, `alpha=${a}`);
});

test("生命淡出的起点 alpha=1，终点前趋近 0", () => {
  const e = el({ life: { inMs: 0, outMs: 1000, fadeOutMs: 200 } });
  assert.ok(resolveElement(e, 700).alpha > 0.99);
  assert.ok(resolveElement(e, 950).alpha > 0 && resolveElement(e, 950).alpha < 0.5);
});

test("scale 轨迹改变 scale", () => {
  const e = el({ tracks: [{ kind: "scale", from: 1, to: 4, startMs: 0, durMs: 1000, ease: "linear" }] });
  assert.equal(resolveElement(e, 500).scale, 2.5);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '.../src/scene/evaluate.js'`

- [ ] **Step 3: 实现 `src/scene/evaluate.js`**

```js
/**
 * evaluate.js — 场景求值器
 *
 * resolveElement：纯函数，把 (元素, 毫秒) 解析成 { visible, x, y, scale, rot, alpha, fx }。
 * evaluateScene：按 z 排序逐元素绘制；元素块在原点画，变换在这里统一施加。
 */
import { envelope } from "../core/fade.js";
import { easeFn } from "../core/motion.js";
import { clamp01 } from "../core/kernel.js";
import { getElementBlock, getTrackBlock, getFxBlock } from "./registry.js";

export function resolveElement(el, ms) {
  const life = el.life;
  if (ms < life.inMs || ms >= life.outMs) {
    return { visible: false, x: el.at.x, y: el.at.y, scale: el.at.scale, rot: el.at.rot, alpha: 0, fx: [] };
  }

  const state = { x: el.at.x, y: el.at.y, scale: el.at.scale, rot: el.at.rot, alpha: el.at.alpha };
  const fx = [];

  for (const seg of el.tracks) {
    if (ms < seg.startMs) break; // tracks 已按 startMs 升序
    const p = seg.durMs <= 0 ? 1 : clamp01((ms - seg.startMs) / seg.durMs);
    const e = easeFn(seg.ease)(p);
    if (seg.kind === "fx") {
      fx.push({ block: seg.block, p, params: seg.params ?? {} });
    } else {
      getTrackBlock(seg.kind).apply(state, e, seg);
    }
  }

  const env = envelope(ms, life.inMs, life.outMs, {
    fadeInMs: life.fadeInMs,
    fadeOutMs: life.fadeOutMs,
  });
  state.alpha *= env;
  return { visible: env > 0 && state.alpha > 0, ...state, fx };
}

export function evaluateScene(ctx, scene, s, opt = {}) {
  const used = opt.used ?? null;
  let drawn = 0;
  for (const el of scene.elements) {
    const r = resolveElement(el, s.ms);
    if (!r.visible) continue;
    drawResolved(ctx, s, el, r, used);
    drawn++;
  }
  return drawn;
}

function drawResolved(ctx, s, el, r, used) {
  const block = getElementBlock(el.block);
  if (used) used.add(`element:${el.block}`);

  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.rot);
  ctx.scale(r.scale, r.scale);
  ctx.globalAlpha *= r.alpha;

  let inner = () => block.draw(ctx, s, el.params ?? {});
  for (const f of r.fx) {
    const fxBlock = getFxBlock(f.block);
    if (used) used.add(`fx:${f.block}`);
    const base = inner;
    if (fxBlock.mode === "wrap") {
      inner = () => fxBlock.drawWrapped(ctx, s, base, f.p, f.params);
    } else {
      inner = () => {
        fxBlock.apply(s, f.p, f.params);
        base();
      };
    }
  }
  inner();
  ctx.restore();
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS —— `evaluate.test.js` 6 项全过

- [ ] **Step 5: Commit**

```bash
git add src/scene/evaluate.js tests/scene/evaluate.test.js
git commit -m "feat(scene): 确定性求值器 resolveElement/evaluateScene"
```

---

## Task 6: 场景帧渲染入口（含子帧运动模糊）

**Files:**
- Create: `src/scene/render.js`
- Create: `tests/scene/render.test.js`

**Interfaces:**
- Consumes: `src/core/render.js` 的 `ts/createSurface/surfaceToPNG/surfaceToRGBA/rawVideoArgs`；`src/core/registry.js` 的 `makeState`；`src/core/timeline.js` 的 `frameState/frameToMs/MS_PER_FRAME`；`src/core/floor.js` 的 `drawFloor`；`src/scene/evaluate.js` 的 `evaluateScene`。
- Produces: `renderSceneFrame(ctx, scene, frame, opt?) -> { drawn, samples }`，`opt` 支持 `{ samples, shutter, floor, used }`。

- [ ] **Step 1: 写失败测试 `tests/scene/render.test.js`**

```js
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createSurface, ts } from "../../src/core/render.js";
import { registerProjectFonts } from "../../src/core/fonts.js";
import { loadBlocks } from "../../src/scene/registry.js";
import { normalizeScene } from "../../src/scene/format.js";
import { renderSceneFrame } from "../../src/scene/render.js";

before(async () => { registerProjectFonts(); await loadBlocks(); });

const scene = normalizeScene({
  id: "t",
  durationMs: 1000,
  elements: [{ id: "a", block: "rect", at: { x: 900, y: 500 }, params: { w: 200, h: 120 } }],
});

const hash = (surface) => createHash("sha1").update(surface.ctx.getImageData(0, 0, ts.width, ts.height).data).digest("hex");

test("渲染出非底色像素（关地板）", () => {
  const s = createSurface();
  renderSceneFrame(s.ctx, scene, 0, { floor: false });
  const d = s.ctx.getImageData(0, 0, ts.width, ts.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] !== 5 || d[i + 1] !== 7 || d[i + 2] !== 10) n++;
  assert.ok(n > 1000, `非底色像素 ${n}`);
});

test("同帧两次逐字节一致", () => {
  const a = createSurface();
  const b = createSurface();
  renderSceneFrame(a.ctx, scene, 12, { floor: false, samples: 4 });
  renderSceneFrame(b.ctx, scene, 12, { floor: false, samples: 4 });
  assert.equal(hash(a), hash(b));
});

test("evaluateScene 记录用到的块", () => {
  const s = createSurface();
  const used = new Set();
  renderSceneFrame(s.ctx, scene, 0, { floor: false, used });
  assert.ok(used.has("element:rect"));
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '.../src/scene/render.js'`

- [ ] **Step 3: 实现 `src/scene/render.js`**

```js
/**
 * render.js — 场景帧渲染入口
 *
 * 镜像 src/core/render.js 的结构（清屏 / 求值 / 地板 / 子帧运动模糊），
 * 但只画场景，不经过全局画板注册表。
 */
import * as tl from "../core/timeline.js";
import { ts, createSurface } from "../core/render.js";
import { makeState } from "../core/registry.js";
import { drawFloor } from "../core/floor.js";
import { evaluateScene } from "./evaluate.js";

let scratch = null;
function getScratch() {
  if (!scratch) scratch = createSurface();
  return scratch;
}

export function renderSceneFrame(ctx, scene, frame, opt = {}) {
  const samples = Math.max(1, Math.floor(opt.samples ?? 1));
  if (samples === 1) return drawSceneFrame(ctx, scene, frame, opt);

  const shutter = opt.shutter ?? 0.5;
  const span = shutter * tl.MS_PER_FRAME;
  const s0 = getScratch();
  const info = { drawn: 0, samples };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  for (let k = 0; k < samples; k++) {
    const u = (k + 0.5) / samples - 0.5;
    const r = drawSceneFrame(s0.ctx, scene, frame, opt, tl.frameToMs(frame) + u * span);
    info.drawn = r.drawn;
    ctx.globalAlpha = 1 / (k + 1);
    ctx.drawImage(s0.canvas, 0, 0);
  }
  ctx.restore();
  return info;
}

function drawSceneFrame(ctx, scene, frame, opt = {}, msOverride) {
  const time = tl.frameState(frame, msOverride);
  const base = makeState(frame, { ...ts, ...time });

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = scene.background ?? ts.colors.bg;
  ctx.fillRect(0, 0, ts.width, ts.height);
  ctx.restore();

  const drawn = evaluateScene(ctx, scene, base, opt);

  if (opt.floor ?? ts.floor) drawFloor(ctx, base);
  return { drawn, samples: 1 };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS —— `render.test.js` 3 项全过

- [ ] **Step 5: Commit**

```bash
git add src/scene/render.js tests/scene/render.test.js
git commit -m "feat(scene): 场景帧渲染入口与子帧运动模糊"
```

---

## Task 7: 样张 + CLI（PNG / 联络表 / 视频 / 自检）+ 确定性豁免

**Files:**
- Create: `scenes/p0-demo.json`
- Create: `tools/scene.js`
- Modify: `package.json`（scripts 增加 `"scene"`）
- Modify: `verify/determinism-check.js`（ALLOW 表加 `tools/scene.js`，使本次提交起 verify 保持全绿）

**Interfaces:**
- Consumes: `src/scene/format.js`、`src/scene/registry.js`、`src/scene/render.js`、`src/core/render.js`、`src/core/post.js`、`src/core/fonts.js`、`src/core/timeline.js`、`ffmpeg-static`、`@napi-rs/canvas`。
- Produces: `npm run scene -- --file <path> --png <sec> | --contact | --video | --selfcheck`；产物在 `out/scene/`。

- [ ] **Step 1: 创建样张 `scenes/p0-demo.json`**

```json
{
  "id": "p0-demo",
  "title": "P0 样张：JSON → 画面",
  "durationMs": 8000,
  "background": "#05070a",
  "elements": [
    {
      "id": "box",
      "block": "rect",
      "params": { "w": 180, "h": 110, "radius": 14, "fill": "#39ff88" },
      "at": { "x": 200, "y": 300, "alpha": 0.9 },
      "life": { "inMs": 0, "outMs": 8000, "fadeInMs": 200, "fadeOutMs": 300 },
      "tracks": [
        { "kind": "move", "path": "line", "from": { "x": 200, "y": 300 }, "to": { "x": 1600, "y": 300 }, "startMs": 500, "durMs": 2000, "ease": "inout" },
        { "kind": "scale", "from": 1, "to": 0.5, "startMs": 3000, "durMs": 1200, "ease": "out" }
      ],
      "notes": "方块从左滑到右然后缩小；证明轨迹+缩放"
    },
    {
      "id": "label",
      "block": "text",
      "params": { "text": "world.execute(me);", "size": 56, "color": "#c8f0e8", "weight": 600 },
      "at": { "x": 960, "y": 640 },
      "life": { "inMs": 1500, "outMs": 6000, "fadeInMs": 400, "fadeOutMs": 400 },
      "notes": "标题句，淡入淡出"
    },
    {
      "id": "heart",
      "block": "wireHeart",
      "params": { "size": 200 },
      "at": { "x": 1160, "y": 300 },
      "life": { "inMs": 1000, "outMs": 7000, "fadeInMs": 300, "fadeOutMs": 300 },
      "tracks": [
        { "kind": "move", "path": "orbit", "from": { "x": 1160, "y": 300 }, "center": { "x": 960, "y": 300 }, "sweep": 360, "startMs": 1000, "durMs": 5000, "ease": "linear" },
        { "kind": "fx", "block": "glow", "startMs": 1000, "durMs": 5000, "params": { "radius": 10 } }
      ],
      "notes": "爱心绕标题转圈，全程带辉光；证明环绕轨迹+特效包裹"
    }
  ]
}
```

- [ ] **Step 2: 在 `package.json` 的 `scripts` 里加（放在 `"preview"` 之后）**

```json
    "scene": "node tools/scene.js",
```

- [ ] **Step 3: 实现 `tools/scene.js`**

```js
/**
 * tools/scene.js — 场景渲染 CLI
 *
 * 用法：
 *   node tools/scene.js --file scenes/p0-demo.json --png 1.5      # t=1.5s 静帧
 *   node tools/scene.js --file scenes/p0-demo.json --contact      # 联络表（默认 30 格）
 *   node tools/scene.js --file scenes/p0-demo.json --video --post
 *   node tools/scene.js --file scenes/p0-demo.json --selfcheck
 *
 * 时间参数（--png/--from/--to）单位是**秒**；-from/-to 默认覆盖整段场景。
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";

import { ROOT, config, fps } from "../src/core/timeline.js";
import { ts, createSurface, surfaceToRGBA, rawVideoArgs } from "../src/core/render.js";
import { registerProjectFonts } from "../src/core/fonts.js";
import { parsePost, buildPostFilter, hasPost } from "../src/core/post.js";
import { normalizeScene, SceneFormatError } from "../src/scene/format.js";
import { loadBlocks, assertSceneBlocks } from "../src/scene/registry.js";
import { renderSceneFrame } from "../src/scene/render.js";

const argv = process.argv.slice(2);
const getNum = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? Number(argv[i + 1]) : d; };
const getStr = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

const FILE = getStr("file", null);
if (!FILE) {
  console.error("用法：node tools/scene.js --file scenes/p0-demo.json [--png 1.5 | --contact | --video | --selfcheck]");
  process.exit(1);
}

registerProjectFonts();
await loadBlocks();

let scene;
try {
  const raw = JSON.parse(readFileSync(resolve(ROOT, FILE), "utf8"));
  scene = normalizeScene(raw);
  assertSceneBlocks(scene);
} catch (err) {
  if (err instanceof SceneFormatError) console.error(`❌ 场景格式错误：${err.message}`);
  else console.error(`❌ 加载场景失败：${err.message}`);
  process.exit(1);
}

const OUT_DIR = resolve(ROOT, "out", "scene");
mkdirSync(OUT_DIR, { recursive: true });
const NAME = getStr("name", scene.id).replace(/[^\w.-]/g, "_");
const FROM_S = getNum("from", 0);
const TO_S = getNum("to", scene.durationMs / 1000);
const SAMPLES = Math.max(1, Math.floor(getNum("samples", 1)));
const FLOOR = has("floor") ? true : has("no-floor") ? false : undefined;
const POST = has("post") ? parsePost(getStr("post", "")) : null;
const POST_ON = POST !== null && hasPost(POST);
const NO_AUDIO = has("no-audio");

const t0 = Date.now();

if (has("selfcheck")) {
  runSelfcheck();
} else if (argv.includes("--png")) {
  const sec = getNum("png", 0);
  const frame = Math.round(sec * fps);
  const surface = createSurface();
  renderSceneFrame(surface.ctx, scene, frame, { samples: SAMPLES, floor: FLOOR });
  const out = resolve(OUT_DIR, `${NAME}-${sec.toFixed(2)}s.png`);
  writeFileSync(out, surface.canvas.toBuffer("image/png"));
  console.log(`✅ ${out}`);
} else if (has("video")) {
  await renderVideo();
} else {
  renderContact();
}

console.log(`   用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

function framesOf(fromS, toS, count) {
  const from = Math.max(0, Math.round(fromS * fps));
  const to = Math.min(Math.round(toS * fps), Math.round(scene.durationMs / 1000 * fps));
  const out = [];
  for (let i = 0; i < count; i++) out.push(count === 1 ? from : Math.round(from + ((to - from) * i) / (count - 1)));
  return out;
}

function renderContact() {
  const count = Math.max(1, Math.floor(getNum("count", 30)));
  const cols = Math.max(1, Math.floor(getNum("cols", 5)));
  const tile = Math.max(80, Math.floor(getNum("tile", 480)));
  const frames = framesOf(FROM_S, TO_S, count);
  const tileH = Math.round((tile * ts.height) / ts.width);
  const rows = Math.ceil(frames.length / cols);
  const pad = 8;
  const label = 30;
  const sheet = createCanvas(cols * tile + (cols + 1) * pad, rows * (tileH + label) + (rows + 1) * pad);
  const sctx = sheet.getContext("2d");
  sctx.fillStyle = "#101010";
  sctx.fillRect(0, 0, sheet.width, sheet.height);

  const surface = createSurface();
  frames.forEach((f, i) => {
    renderSceneFrame(surface.ctx, scene, f, { samples: SAMPLES, floor: FLOOR });
    const x = pad + (i % cols) * (tile + pad);
    const y = pad + Math.floor(i / cols) * (tileH + label + pad);
    sctx.drawImage(surface.canvas, x, y, tile, tileH);
    sctx.fillStyle = "#000";
    sctx.fillRect(x, y + tileH, tile, label);
    sctx.fillStyle = "#8fe8c8";
    sctx.font = "13px Consolas, monospace";
    sctx.fillText(`f${String(f).padStart(5)}  ${(f / fps).toFixed(2)}s`, x + 6, y + tileH + 20);
  });

  const out = resolve(OUT_DIR, `${NAME}-contact.png`);
  writeFileSync(out, sheet.toBuffer("image/png"));
  console.log(`✅ ${out}`);
}

async function renderVideo() {
  const from = Math.max(0, Math.round(FROM_S * fps));
  const to = Math.min(Math.round(TO_S * fps), Math.round(scene.durationMs / 1000 * fps));
  const mp4 = resolve(OUT_DIR, `${NAME}.mp4`);
  const vf = POST_ON ? buildPostFilter(POST) : null;
  const audio = NO_AUDIO ? null : findAudio();

  const vargs = ["-y", "-hide_banner", "-loglevel", "error", ...rawVideoArgs()];
  if (audio) {
    vargs.push("-ss", (from / fps).toFixed(3), "-t", ((to - from + 1) / fps).toFixed(3), "-i", audio);
  }
  if (vf) vargs.push("-filter_complex", vf.graph, "-map", `[${vf.out}]`);
  if (audio) {
    if (!vf) vargs.push("-map", "0:v:0");
    vargs.push("-map", "1:a:0");
  }
  vargs.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p");
  if (audio) vargs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  vargs.push("-movflags", "+faststart", mp4);

  console.log(`▶ 视频 ${from}..${to} 帧 samples=${SAMPLES}${vf ? " + post" : ""}${audio ? " + 音轨" : ""}`);
  const ff = spawn(ffmpegPath, vargs);
  const surface = createSurface();
  for (let f = from; f <= to; f++) {
    renderSceneFrame(surface.ctx, scene, f, { samples: SAMPLES, floor: FLOOR });
    if (!ff.stdin.write(surfaceToRGBA(surface))) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`✅ ${mp4}`);
}

function runSelfcheck() {
  const used = new Set();
  const frames = framesOf(FROM_S, TO_S, 12);
  let ok = true;

  const a = createSurface();
  const b = createSurface();
  for (const f of frames) {
    renderSceneFrame(a.ctx, scene, f, { floor: FLOOR, used });
  }
  const probe = frames[Math.floor(frames.length / 2)];
  renderSceneFrame(a.ctx, scene, probe, { floor: FLOOR });
  renderSceneFrame(b.ctx, scene, probe, { floor: FLOOR });
  const ha = createHash("sha1").update(surfaceToRGBA(a)).digest("hex");
  const hb = createHash("sha1").update(surfaceToRGBA(b)).digest("hex");
  if (ha !== hb) { ok = false; console.log(`❌ 确定性失败：frame ${probe} ${ha.slice(0, 12)} ≠ ${hb.slice(0, 12)}`); }
  else console.log(`✅ 确定性：frame ${probe} 两次一致 ${ha.slice(0, 12)}`);

  const declared = new Set();
  for (const el of scene.elements) {
    declared.add(`element:${el.block}`);
    for (const seg of el.tracks) if (seg.kind === "fx") declared.add(`fx:${seg.block}`);
  }
  const missing = [...declared].filter((n) => !used.has(n));
  if (missing.length) { ok = false; console.log(`❌ 有块从未被求值：${missing.join(", ")}`); }
  else console.log(`✅ 全部块都被求值过：${[...declared].sort().join(", ")}`);

  process.exit(ok ? 0 : 1);
}

function findAudio() {
  if (config.audio) {
    const p = resolve(ROOT, config.audio);
    if (existsSync(p)) return p;
  }
  const dir = resolve(ROOT, "assets", "audio");
  if (existsSync(dir)) {
    const hit = readdirSync(dir).find((f) => /\.(wav|mp3|m4a)$/i.test(f) && !f.startsWith("_"));
    if (hit) return resolve(dir, hit);
  }
  return null;
}
```

- [ ] **Step 4: 运行自检（端到端，验证确定性 + 块覆盖）**

Run: `npm run scene -- --file scenes/p0-demo.json --selfcheck`
Expected: 打印两行 `✅`，退出码 0

- [ ] **Step 5: 出一张静帧与一张联络表，肉眼确认**

Run:
```
npm run scene -- --file scenes/p0-demo.json --png 3.2
npm run scene -- --file scenes/p0-demo.json --contact --count 20
```
Expected: `out/scene/p0-demo-3.20s.png`（方块在中间、爱心在标题附近、标题可见）与 `out/scene/p0-demo-contact.png`（20 格能看到方块从左到右、爱心绕圈）

- [ ] **Step 6: 在 `verify/determinism-check.js` 的 `ALLOW` 数组里、`tools/watch-render.js` 那条之后追加，并跑确定性关**

```js
  {
    file: "tools/scene.js",
    api: /Date\.now\s*\(/,
    reason: "只用于打印场景渲染耗时，不进画面",
  },
```

Run: `npm run verify:determinism`
Expected: 静态扫描显示 `src/ 零违规`；重复渲染/乱序/并发三项全绿（`tools/scene.js` 的 `Date.now()` 已被显式豁免）。

- [ ] **Step 7: Commit**

```bash
git add scenes/p0-demo.json tools/scene.js package.json verify/determinism-check.js
git commit -m "feat(scene): 场景 CLI（png/contact/video/selfcheck）、P0 样张与确定性豁免"
```

---

## Task 8: 全量验收 + 出片

**Files:**
- Modify: `verify/picture-baseline.json`（仅当运行后自动更新时才提交；P0 不改 14 块画板，预期无变化）

**Interfaces:**
- Consumes: Task 7 的 CLI 与已装好的确定性豁免。
- Produces: P0 成片 `out/scene/p0-demo.mp4` 与验收证据；无新代码导出。

- [ ] **Step 1: 跑全部单元测试**

Run: `npm test`
Expected: 全 PASS（format / registry / blocks / evaluate / render）

- [ ] **Step 2: 跑确定性关**

Run: `npm run verify:determinism`
Expected: `✅ ... src/ 零违规`；重复渲染/乱序/并发三项全绿；画面基线显示"与基线一致"（本次未改画板）

- [ ] **Step 3: 跑全量四关**

Run: `npm run verify`
Expected: static / gap / ink / determinism 四关全绿

- [ ] **Step 4: 出 P0 成片短片（带后期），肉眼验收**

Run: `npm run scene -- --file scenes/p0-demo.json --video --post`
Expected: `out/scene/p0-demo.mp4`，8 秒；方块滑行并缩小、标题淡入淡出、爱心绕标题转圈带辉光；无空洞、无黑帧

- [ ] **Step 5: 若基线发生变化则提交**

Run: `git status --short verify/picture-baseline.json`
Expected: 无输出（未变）。若基线确被更新：

```bash
git add verify/picture-baseline.json
git commit -m "chore(scene): 刷新画面基线"
```

---

## 自检（写完计划后核对）

**1. Spec 覆盖**

| 规格条目 | 对应 Task |
|---|---|
| §4 场景格式 + 校验规则 | Task 1 |
| §5.1 元素块 / §5.4 注册表 / §5.3 组合块接口 | Task 2、3 |
| §5.2 行为块（轨迹 + 特效 wrap/channel） | Task 4 |
| §6 求值器语义（生命周期 / 保持 / 串接 / 淡入淡出） | Task 5 |
| §7 渲染入口（清屏 / 地板 / 子帧） | Task 6 |
| §8 CLI（png/contact/video/selfcheck） | Task 7 |
| §9 目录结构 + package.json | Task 1、7 |
| §10 错误处理（未知块、坏时间、求值报错） | Task 1、2、7 |
| §11 测试与验收（格式/确定性/落墨/肉眼/兼容） | 各 Task 测试 + Task 8 |
| §4 `scenes/p0-demo.json` 样张 | Task 7 |

**2. 占位符扫描**：无 `TBD` / `TODO` / "稍后实现"；每个代码步骤都给了完整代码。

**3. 类型/签名一致性核对**：
- `normalizeScene` 的 `element` 形状在 Task 1 定义，Task 5 的 `resolveElement` 读取 `el.life/el.at/el.tracks/el.params/el.block` —— 一致。
- 注册表键：`move` / `scale` / `glow` / `rect` / `text` / `wireHeart` —— Task 2 测试、Task 3–4 实现、Task 7 样张、Task 7 `assertSceneBlocks` 全部一致。
- `renderSceneFrame(ctx, scene, frame, opt)` 在 Task 6 定义，Task 7 CLI 全程按此调用 —— 一致。
- `evaluateScene(ctx, scene, s, opt)` 的 `opt.used` 在 Task 5 定义，Task 7 `runSelfcheck` 使用 —— 一致。

**任务排序说明**：注册表（Task 2）的实现不依赖块文件；六个块的"完整加载"断言被安排在 Task 4（`move`/`scale`/`glow` 就位后）回归，以免任何一个 Task 以失败测试收尾。依赖顺序：format → registry → 元素块 → 轨迹/特效块 → evaluate → render → CLI → 验收。
