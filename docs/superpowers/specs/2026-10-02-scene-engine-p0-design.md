# 场景引擎 P0 设计规格（声明式矢量动画地基）

- 日期：2026-10-02
- 状态：待导演评审
- 范围：**P0 —— 场景 JSON 格式 + 确定性求值器 + 最小块库 + CLI**（无界面）
- 北星：把这套做成"和 AI 创造性很合的矢量引擎"——画面 = 数据在时间轴上的求值结果，每一帧可推导、可复现；没有预设的效果由 AI 按需做成可复用块。

---

## 1. 背景与目标

现有工程是 14 块**手写画板**（`src/boards/*.js`），画面是 `(seed, frame)` 的纯函数。导演想要的是：**用数据描述一条时间轴上的动画**，由编辑器排布、由同一套引擎求值出帧。因为格式是声明式的，它天然可以直接驱动渲染。

P0 只回答一个问题：**"场景 JSON → 确定性画面"这条地基成不成立。**

### P0 目标（可验收）

1. 定义场景 JSON v0 格式（全局时间轴、元素、轨迹、特效、生命期、备注）。
2. 实现确定性求值器 `evaluateScene`：给定毫秒 → 正确绘制。
3. 建立**块库注册表**：元素块 + 行为块，可被 AI 按需扩展。
4. 提供 CLI：`scene → PNG / 联络表 / 视频（可选后期 + 音轨）`。
5. 复用现有资产：歌词 / 段落 / 拍网格 / 调色板 / 打包字体 / `motion.js` 原语 / `_ui.js` 装置。
6. 确定性自检：同一毫秒重渲逐字节一致。

### P0 非目标（明确不做）

- 编辑器、拖拽、属性面板、图层树 UI
- 嵌套组 / 伪 3D 的界面表达
- 自由绘制
- 组合块的可视化配置
- 浏览器端渲染
- 把 14 块旧画板迁移到场景格式

> 决策已确认：① P0 先纯代码（无界面），P1 紧接着做只读预览器；② 一个 scene = **整首歌的全局时间轴**，不是一句一个文件；③ 预览走**服务端渲染**（所见即成片）。

---

## 2. 核心决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 时间轴粒度 | 整首歌一个 scene | 元素跨句存续、可整体拖时间轴；歌词/拍当刻度读入，不入 JSON |
| 场景与歌词的关系 | 松耦合 | 场景只存元素与绝对毫秒；`assets/lyrics.json`、`sections.json` 只作为标记读取 |
| 求值模型 | 无状态纯函数 | 满足铁律 3（画板不许留状态）与铁律 1（无时间/外部随机） |
| 块库 | 数据 + 小函数，注册表驱动 | 编辑器菜单/属性面板将来由 `params` schema 自动生成；AI 加块即出现 |
| 与主渲染管线的关系 | 独立渲染入口，复用同一 `s` 状态与原语 | P0 不碰 14 块旧画板；后续阶段再决定是否并成一块"场景画板" |
| 预览像素来源 | 服务端 `@napi-rs/canvas` | 与最终成片同源，绝不会骗导演 |

---

## 3. 架构总览

```
             scenes/*.json  （导演/AI 写的声明式场景）
                    │
                    ▼
   src/scene/format.js      校验 + 默认值 + 未知块报错
                    │
                    ▼
   src/scene/evaluate.js    给定 ms → 解析每个元素的变换/特效/生命期 → 调块绘制
             │                        │
             │                        ▼
             │        src/scene/registry.js  块注册表（元素块 / 行为块）
             │                        │
             │                        ▼
             │        src/scene/blocks/*     element.* / move.* / scale.* / fx.*
             │                 （复用 _ui.js 装置 + motion.js 原语）
             ▼
   src/scene/render.js      清屏 + 求值 + 地板 + 子帧运动模糊（复用 render.js 的像素输出）
                    │
                    ▼
        tools/scene.js      CLI：PNG / 联络表 / 视频（ffmpeg + post + 音轨）
```

**关键点**：求值器、块库、渲染入口三者分离。块库是"可增长的"，求值器是"不变的"，渲染入口是"与现有管线的接缝"。

---

## 4. 场景格式 v0

一个 scene = 一整首歌（或一个片段）的全局时间轴。所有时间是**场景内绝对毫秒**。

```json
{
  "id": "p0-demo",
  "title": "P0 样张",
  "durationMs": 12000,
  "background": "#05070a",
  "elements": [
    {
      "id": "heart-1",
      "block": "wireHeart",
      "params": { "size": 160 },
      "at": { "x": 960, "y": 540, "scale": 1, "rot": 0, "alpha": 1 },
      "life": { "inMs": 0, "outMs": 3000, "fadeInMs": 200, "fadeOutMs": 200 },
      "tracks": [
        {
          "kind": "move",
          "path": "line",
          "from": { "x": 960, "y": 540 },
          "to": { "x": 1400, "y": 300 },
          "startMs": 500,
          "durMs": 800,
          "ease": "out"
        },
        {
          "kind": "fx",
          "block": "glow",
          "startMs": 500,
          "durMs": 800,
          "params": { "radius": 24 }
        }
      ],
      "notes": "爱心从内到外消融；参考导演发的那张图"
    }
  ]
}
```

### 字段说明

- **顶层**
  - `id`（必填，唯一）：场景标识。
  - `title`（可选）：给人看。
  - `durationMs`（必填）：场景总长。真实使用时 = `config` 的全片时长（212000）。
  - `background`（可选，默认 `config.colors.bg`）：底色。
  - `elements`（必填，数组）。
- **元素**
  - `id`（必填，场景内唯一）。
  - `block`（必填）：元素块名，必须在注册表里存在。
  - `params`（可选）：元素块参数。
  - `at`（必填）：初始变换 `{x, y, scale=1, rot=0, alpha=1}`；`x/y` 是画布坐标（左上原点）。
  - `life`（可选，默认全时段）：`{inMs=0, outMs=durationMs, fadeInMs=0, fadeOutMs=0}`。
  - `tracks`（可选，数组）：按 `startMs` 排序的行为段。
  - `notes`（可选）：导演对我的自然语言说明，原样保留、我不猜。
  - `z`（可选，默认 0）：同层排序，越大越靠上。
- **轨迹 / 行为段**（`tracks[]`）
  - 公共：`kind`（`move`/`scale`/`fx`）、`startMs`、`durMs`、`ease`（默认 `inout`）。
  - `move`：`path`（`line`/`orbit`/`curve`）+ `from{x,y}` + `to{x,y}`；`orbit` 额外可给 `center`，`curve` 额外可给 `via`（控制点）。
  - `scale`：`from`、`to`（数值）。
  - `fx`：`block`（特效块名）+ `params`。
  - **语义**：见 §6。

### 校验规则（`format.js`）

- 未知顶层字段 → 警告；未知元素块/特效块 → **报错**（并列出可用块）。
- `life.outMs <= life.inMs` → 报错。
- 轨迹 `startMs`/`durMs` 为负，或超出 `durationMs` → 警告。
- 同一元素的**同一变换通道**（x/y/scale/rot/alpha）时间窗重叠 → 报错（避免歧义；`fx` 不受此限）。
- `params` 里未知字段 → 警告。

---

## 5. 块库设计

两类块，统一在 `src/scene/registry.js` 注册。

### 5.1 元素块（`kind: "element"`）

```js
export default {
  name: "wireHeart",
  kind: "element",
  params: {
    size: { type: "number", default: 160, min: 8, max: 800 },
  },
  // 可选：给编辑器/命中测试用；P0 可省
  sizeOf(params) { return { w: params.size, h: params.size }; },
  // 在原点绘制；变换（平移/旋转/缩放/透明度）由求值器统一施加
  draw(ctx, s, params) {
    wireHeart(ctx, s, 0, 0, params.size);
  },
};
```

**约定**：元素块一律**在原点绘制**。求值器负责 `translate → rotate → scale → globalAlpha`。这样 `_ui.js` 里以 `(cx, cy)` 为参数的装置可以零成本复用（传 `0,0`）。

### 5.2 行为块（`kind: "track"`）

- **变换类**（`move` / `scale` …）：把 `state` 从段起点推进到段终点。
  ```js
  export default {
    name: "move",
    kind: "track",
    channels: ["x", "y"],
    params: { path: {...}, from: {...}, to: {...} },
    apply(state, e, seg) { /* 按插值进度 e 写入 state.x/state.y */ },
  };
  ```
- **特效类**（`kind: "fx"`）：不改变换，分两种：
  - `wrap`：包住元素绘制（如辉光 = 多层重绘）。
  - `channel`：往 `state` 上叠通道效果（如整体变色、脉冲缩放）。
  ```js
  export default {
    name: "glow",
    kind: "fx",
    mode: "wrap",              // "wrap" | "channel"
    params: { radius: { type: "number", default: 16 } },
    drawWrapped(ctx, s, inner, p, params) { /* p = 0..1 进度；多层重绘 inner */ },
  };
  ```

### 5.3 组合块

组合块 = 一个块内部引用两个子块（如"滤镜 + 粉碎"、"变色 + 缩小"）。**不需要新机制**——P0 不实现具体组合块，但接口（块是函数）已允许 P3 落地。

### 5.4 注册表

```js
// src/scene/registry.js
const MANIFEST = [
  "../scene/blocks/element.rect.js",
  "../scene/blocks/element.text.js",
  "../scene/blocks/element.wireHeart.js",
  "../scene/blocks/track.move.js",
  "../scene/blocks/track.scale.js",
  "../scene/blocks/fx.glow.js",
];
export async function loadBlocks() { /* 动态 import，按 name 建表，重名报错 */ }
export function getBlock(name) { /* 找不到 → 抛错并列出可用块 */ }
```

菜单/属性面板将来从 `name` + `params` schema 自动生成，所以 **AI 加一个块文件 + 一行 manifest，它就自己出现在编辑器里**。

---

## 6. 求值器语义（`evaluate.js`）

`evaluateScene(ctx, scene, s)`，其中 `s.ms` 是全片毫秒。

对每个元素：

1. **生命周期**：`ms < life.inMs` 或 `ms >= life.outMs` → 跳过。
2. **初始变换**：`state = { ...at }`。
3. **按序应用轨迹**（已按 `startMs` 排序）：
   ```
   for (const seg of tracks) {
     if (ms < seg.startMs) break;                 // 还没开始
     const p = seg.durMs <= 0 ? 1 : clamp01((ms - seg.startMs) / seg.durMs);
     const e = easeFn(seg.ease)(p);
     applySeg(state, e, seg);                      // 见下
   }
   ```
   - **保持**：段在 `p = 1` 后不再变化，元素停在终点——**"运动比到下一句短就停在那"天然成立**，无需特殊语法。
   - **衔接**：下一条 `move` 的 `from` 应等于上一条的 `to`（P2 编辑器自动接；P0 手写保证）。
4. **生命淡入淡出**：`alpha *= fadeIn/out 包络`（由 `life` 的毫秒算，`fadeMs=0` 即硬）。
5. **绘制**：
   ```
   ctx.save();
   ctx.translate(state.x, state.y);
   ctx.rotate(state.rot);
   ctx.scale(state.scale, state.scale);
   ctx.globalAlpha *= state.alpha;
   drawElementWithFx(ctx, s, element, activeFx(ms, element));
   ctx.restore();
   ```
   `activeFx` 返回当前窗口内的 `fx` 段及其进度 `p`；`wrap` 型按嵌套顺序包住元素绘制。

**确定性**：求值只依赖 `ms`（经 `s`）+ 场景数据 + `seed` 派生。原语用 `s.rnd/s.noise/s.keys/...`（都已绑 seed）。**无累加器**。

---

## 7. 渲染入口（`src/scene/render.js`）

`renderSceneFrame(ctx, scene, frame, opt)`，镜像 `src/core/render.js` 的结构但只画场景：

1. 清屏铺底色（`scene.background`）。
2. `evaluateScene(ctx, scene, { ...makeState(frame, ...), ms: frameToMs(frame) })`。
3. 可选地板（沿用 `config.floor` / `--floor` / `--no-floor`）。
4. 支持 `samples` 子帧运动模糊（与 `renderFrame` 同语义：只挪 ms，不挪 frame）。

复用 `render.js` 的 `createSurface` / `surfaceToPNG` / `surfaceToRGBA` / `rawVideoArgs` 和 `post.js` / `fonts.js` / `floor.js`。

> 说明：P0 不走全局 `registry.boards`，以免与 14 块旧画板互相干扰。后续阶段可选择把场景做成一块"全片画板"，从而并入 `preview/render/verify` 主链路。

---

## 8. CLI（`tools/scene.js`）

```bash
npm run scene -- --file scenes/p0-demo.json --png 1.5        # 出 t=1.5s 静帧
npm run scene -- --file scenes/p0-demo.json --contact        # 联络表（默认 30 格）
npm run scene -- --file scenes/p0-demo.json --video --post   # 出视频（默认混音轨）
npm run scene -- --file scenes/p0-demo.json --video --no-audio --from 0 --to 3
npm run scene -- --file scenes/p0-demo.json --selfcheck      # 确定性自检
```

参数尽量与 `tools/preview.js` 对齐（`--from/--to/--count/--cols/--tile/--samples/--post/--no-audio/--floor/--name`）。

- 产出目录：`out/scene/<name>.png|.mp4`。
- `--png <t>`：指定秒，渲一帧（走 `renderSceneFrame`）。
- `--selfcheck`：同一帧连渲两次并逐字节比较；再断言 demo 里每个元素块/特效块都被调用过；退出码非 0 = 失败。

---

## 9. 目录结构

```
src/scene/
  format.js            schema 校验 + 默认值（未知块报错）
  evaluate.js          scene + ms → 绘制（确定性）
  render.js            scene 帧渲染（清屏/地板/子帧）
  registry.js          块注册表（读 manifest）
  blocks/
    element.rect.js
    element.text.js
    element.wireHeart.js     （复用 _ui.js）
    track.move.js            （line / orbit / curve）
    track.scale.js
    fx.glow.js               （wrap 型，多层重绘）
scenes/
  p0-demo.json         手写样张
tools/
  scene.js             CLI
out/scene/             产出（不进 git）
```

`package.json` 新增：`"scene": "node tools/scene.js"`。

---

## 10. 错误处理

- **未知块**：`未知元素块 "xyz"（元素 "heart-1"）。可用：rect, text, wireHeart`。
- **未知参数**：警告并继续（列出合法参数）。
- **时间越界 / 通道重叠**：见 §4 校验规则。
- **求值期异常**：包一层，报出"元素 id + 时刻"，方便定位（对齐 `render.js` 的画板报错风格）。
- **字体**：沿用 `fonts.js` 的 `registerProjectFonts()`，在任何绘制前调用。

---

## 11. 测试与验收

| 项 | 方法 | 通过标准 |
|---|---|---|
| 格式 | `format.js` 单测（node:test） | 合法通过；未知块/坏时间报错 |
| 确定性 | `--selfcheck` + 手动重跑 | 同帧两次逐字节一致 |
| 落墨 | `--selfcheck` 里断言块被调用 | 每个声明的块至少被调用一次 |
| 肉眼 | `--contact` / `--video` | 轨迹 + 特效肉眼正确，无空洞 |
| 兼容 | `npm run verify` | 四关仍全绿（P0 不改旧画板） |

> `verify/determinism-check.js` 的静态扫描会检查禁用 API；新增 `src/scene/*` 与 `tools/scene.js` 必须不引入 `Date.now()/Math.random()/performance.now()`（进度估算类若需要，按先例进 ALLOW 表并注明"不进画面"）。

---

## 12. 后续阶段（北星，P0 不实现）

- **P1 只读预览器**：本地网页，拖时间轴看场景（服务端渲染）。
- **P2 编辑器 v1**：侧边栏拖模板 → 设初始变换/轨迹/特效/生命期 → 备注 → 图层树/嵌套 → 存 JSON。
- **P3 块库扩展**：AI 按导演描述把"无预设"效果做成可复用块/组合块；菜单自动出现。
- **P4 出片**：场景并入主渲染管线（或转为一块场景画板），走 `verify`。
- **P5 自由层 / 伪 3D**：手绘 + 组变换。

---

## 13. 风险与开放问题

1. **`_ui.js` 装置的原点假设**：部分装置可能假设绝对坐标或 `SAFE` 夹紧。P0 只选可干净包裹的（`wireHeart` 已验证以 `cx,cy` 为参），其余在 P3 逐步适配。
2. **`fx` 的 wrap/channel 二分** 可能随块库增长需要细分；P0 保持最小，遇到再说。
3. **子帧运动模糊下的确定性**：求值器对同一 `ms` 必须完全确定（当前设计满足）；`samples` 只改变采样时刻集合。
4. **无 git 仓库**：本规格写盘但未提交。是否 `git init` 由导演决定。
5. **全局时间轴的编辑体验**：P2 的编辑器需要"只显示当前片段"的视图；这是 P2 的设计课题，P0 不受影响。

---

*本规格由 brainstorming 流程产出；经导演评审通过后，转 `writing-plans` 生成实施计划。*
