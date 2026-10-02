# AGENTS.md — world.execute(me); MV 工程约定

> 这份文件是给 AI Agent（以及三个月后的你自己）看的。
> 改动这个工程之前先读它。和它冲突的「聪明做法」一律不要。

## 这是什么

一个**代码驱动的音乐 MV**：Mili《world.execute(me);》全片。
没有剪辑软件，没有时间线拖拽。画面是 `(seed, frame)` 的纯函数，
渲染出来是一帧帧像素，最后交给 ffmpeg 编码。

## 工作流（最重要的一条）

**策划的方向由用户拍板；但 Agent 应当主动给方向，不是只问不答。**

- 用户可以只给一句意图，Agent 负责把它翻译成画面方案，并**给出选项 + 推荐**。
- 遇到不懂的地方**先给出自己的理解与建议再问**，不要空问，也不要脑补后闷头做完。
- 以**一个关键画面 / 一个动作流程**为单位推进，严格串行：

  ```
  生成 → 给用户看 → 讨论 → 改 → 给用户看 → …… → 用户明确点头
                                                    ↓
                                        才允许开始下一个画面
  ```

- 「给用户看」用 `node tools/preview.js --only <画板id>`，**几秒出图**。
  严禁为了看一块画板去渲全片——那是拿几十分钟换一个「大概是这样」。
- 用户没点头之前，不要把这块画板当成「已完成」往下叠。画面是叠加的，
  底子错了后面全歪。

判断「是否该继续」的唯一依据是**用户的话**，不是 Agent 自己的满意度。

### 怎么「看」画面：先查数据，再考虑识图

用眼睛读渲染图是**最后手段** —— 慢，而且容易看错（这轮就吃过：把时间读错、把弹窗位置判错）。
画面上每个元素在被画的时候都会**运行时登记**（`_ui.js` 的 `reg()`），
所以「某一刻有什么、在哪、往哪动」都是**可查询的数据**，不用出图：

```bash
npm run query -- at 14.5 --moving                  # 元素 + 速度(px/s) + 方向(八向)
npm run query -- at 14.5 --near 865,528 --r 500    # 只看某点附近
npm run query -- track chessPiece --from 12.6 --to 14.4 --step 300   # 轨迹/矢量变化
npm run query -- hit 865 300 --t 14.5              # 这个像素上是谁
npm run query -- board 14.5                        # 这一帧的画板 + env + 段落
npm run query -- frame 14.5 --boxes                # 少数必须看图时：出图（带 ID 框）
```

网页检查器（`npm run inspect`）和它是**同一份探针**（`tools/lib/probe.js`），
点右侧列表高亮 / 右键复制，两边不会给出不同答案。

**注意**：裸 `ctx.fillText` / `ctx.strokeRect` 画的**没有登记**，探针查不到
（例如 02-title 的大标题本身）。这类才需要看图 —— 但先用 `query` 把所有能查的排除掉。

## 铁律

1. **禁止非确定性来源。**
   `Math.random()` / `Date.now()` / `performance.now()` / `new Date()` /
   `requestAnimationFrame` 全部禁用。
   随机一律来自 `src/core/kernel.js`，并把 `seed` 和 `frame` 混进去。
   `npm run verify:determinism` 会静态扫描 + 运行期比对来强制这一点。

2. **时间只认 `config/project.json`。**
   BPM、fps、时长、beatOffset 都写在那里。
   画板里写 `60000 / 130` 这种字面量 = 打回重写。用 `src/core/timeline.js`。

3. **画板不许留状态。**
   渲染第 5000 帧时，`src/boards/*.js` 里不允许有任何变量是从第 4999 帧带过来的。
   要「随时间累积」的效果，用 `s.fbm()` 或对 `s.frame` 做闭式函数，不要用累加器。

4. **每块画板必须有淡入淡出。**
   `meta.fade` 里配 —— **引擎会按它统一施加**（`render.js` 里 `ctx.globalAlpha = env`，
   2026-09-29 起）。画板**不要**再自己乘/写一遍 `s.env`。
   硬切要配 `fade: {}` 并且用 `hardCut()` 显式声明——让人能看出「这里是有意的」。

5. **产物可复现。**
   生成的 `assets/onsets.js` 不准写时间戳/机器名。
   `npm run verify`（四关：static / gap / ink / determinism）必须是绿的才准提交。

## 目录

```
config/project.json      全片唯一真相源（尺寸/帧率/BPM/seed/配色）
assets/                  源素材（音频/MIDI 不进 git；fonts/ 与 sections.json 进 git）
src/core/
  kernel.js              确定性哈希 / 随机 / 缓动 / 数学
  timeline.js            帧 ↔ 毫秒 ↔ 拍 的换算（含 assets/onsets.json 只读表）
  fade.js                淡入淡出协议 / 配色工具
  fonts.js               ★ 打包字体（IBM Plex Mono，assets/fonts/ 进 git）
  lyrics.js              ★ 歌词（词级时间戳）查询 API
  motion.js              ★ 动效原语：缓动/关键帧、错峰、拖尾回声、路径、渐变、擦除、onset 脉冲
  post.js                ★ 后期质感：辉光/光晕/色散/颗粒/暗角（拼 ffmpeg 滤镜链，不是 JS 逐像素）
  registry.js            画板注册表
  floor.js               ★ 常驻「地板」：叠在画板之上的极轻、永不静止的底噪（config.floor）
  render.js              逐帧渲染入口（含子帧运动模糊）
src/boards/              ★ 画面都在这里，一块画板一个文件（14 块 = SHOT-01..14）
  _ui.js                 ★ 复刻版共享母题：面板/对话框/下拉框/开关/复选框/日志控制台/glitch 墙/线框爱心/电源按钮
  _motifs.js             v1（终端语言）的母题，只被 `_v1-*` 用
  _v1-*.js               旧版完整 14 块（终端/磷光绿/心跳曲线），**不参与加载**，留作 A/B 对比
  _*.js                  `_` 开头 = **不被加载**（模板、试片、旧版本）
tools/                   解析素材 / 渲染 / 编码
verify/                  验收四关（见「验收」一节）
  static-check.js        ① 静态：s.xxx() 名字真实存在 + 画板↔段落表对齐
  gap-check.js           ② 全片：无空洞 / 无空帧 / 无静止段
  ink-check.js           ③ 每块画板真的落墨了吗（不是「注册了」）
  determinism-check.js   ④ 同 seed+帧号=同像素 + 画面基线
  lib/record-ctx.js      ★ 录制式画布（包住真 ctx，数图元 / 查 save·restore）
  picture-baseline.json  画面指纹基线（自动生成；有意改动后重跑即更新）
out/                     产出（不进 git）
```

## 设计系统（写画板前必读）

全片 14 块画板看起来要像**一部片子**，靠的不是各画各的，是这几套刻度。
**不许写裸数字** —— 字号从 `TYPE` 取，明度从 `INK` 取。

```js
import { TYPE, INK, SAFE, ELEV, shadow, fog, parallax } from "./_ui.js";

TYPE.DISPLAY 96   // 巨型裁切字 / 标题句（一块画板最多 1 处）
TYPE.TITLE   56   // 主标题 / 焦点词
TYPE.HEAD    36   // 大写读数 / 强调
TYPE.BODY    22   // 正文 / 歌词 / 列表   ← 全片主力
TYPE.SUB     18   // 次级读数 / 面板标题
TYPE.CAPTION 14   // 注释 / 单位 / pun

INK.PRIMARY 1.00  // 主角：主读数、正在唱的词
INK.BODY    0.80  // 正文
INK.SUB     0.55  // 次级读数 / 说明
INK.GHOST   0.30  // 背景纹理 / 抬头水印
```

- `label(ctx, s, x, y, text, hex, TYPE.HEAD, INK.PRIMARY)` —— 字号/明度都从刻度取。
  要「再淡一点」用 `INK.of("SUB", 0.6)`，**不要自己造新的绝对值**。
- 历史遗留的裸数字会被 `snapType()` / `snapInk()` **自动收进最近档**，但新代码别依赖它。
- `SAFE = { left:80, right:1840, top:72, bottom:1008 }` —— `panel()` / `dialog()`
  **内部已按它夹紧**，不会再画出屏幕。`dialog()` 的 y 是**中心**，不是顶边。

### 三条硬规矩（都是踩过坑换来的）

1. **每一句画面必须有退出条件。**
   `if (ms >= tX)` 这种没有上界的写法，会让上一句的图形一直画到本段结束，
   和下一句叠在一起（观众看到「一个圆套着个方块，像是忘了擦掉」）。
   写成 `if (ms >= tX && ms < tNext)`，退场用**缩小淡出**而不是硬消失。

2. **大块不透明的面必须自己会动。**
   面板、全屏色块（`redAlarm` / `blueScreen`）是画面里面积最大的静止源。
   `panel()` 已内建逐帧颗粒材质；**新写全屏色块时**要自己叠一层随拍变化的纹理，
   否则整帧 70~90% 的像素是死的，平均帧间差异被稀释到看不出来。

3. **「够亮」不等于「够动」。**
   全片不允许有观众能感觉到的静止段。判断依据是 **`verify:gap` 的运动层**
   （相邻采样帧平均像素变化 ≥ 0.6/255），不是「加了动效」。
   注意：地板（`config.floor`）只贡献约 0.1，**它过不了、也不该用来过**判据。

## 画板怎么写

复制 `src/boards/_00-smoke.js` 当模板（`_` 开头的文件**不会被加载**，
所以它只当模板、不进片子）；复刻版的共享装置（面板 / 对话框 / 下拉框 / 开关 /
复选框 / 日志控制台 / glitch 墙 / 线框爱心 / 电源按钮 / 双关注释）在
`src/boards/_ui.js`，直接 import 用：

```js
export const meta = {
  id: "unique-id",          // 必须唯一
  z: 100,                   // 越大越靠上
  startMs: 12_000,          // 允许写成函数 () => 别的画板的 endMs
  endMs: 18_000,
  fade: { fadeInMs: 132, fadeOutMs: 200 },
};

export function draw(ctx, s) {
  // s.frame s.ms s.t s.beat s.bar s.beatPhase s.env s.W s.H s.colors
  // s.rnd(k) s.range(a,b,k) s.int(a,b,k) s.pick(arr,k) s.noise(x,ch) s.fbm(x,oct,ch)
  // 动效：s.keys(ms,[[ms,v,ease]…]) s.echo({count,…}) s.shift(dtMs)
  //       s.staggerEase(elapsed,i,stepMs,durMs,ease) s.snap(ms,div) s.crossed(a,b,div)
  // 音频：s.onsets s.hit(halfLifeMs,lookbackMs) s.onsetsIn(msA,msB)
  // 段落：s.section（当前段，含 name/startBar）s.sections（全部）
  // 歌词：s.lyrics.get("…") s.line s.word s.lyrics.wordProgress(word, ms)
  // 字号/明度：来自 TYPE / INK（见上一节），别写裸数字
  // 字体：ctx.font = s.mono(TYPE.BODY) / s.mono(TYPE.TITLE, 700)
  // 路径/渐变/擦除要 import：makePath pointAtLength strokePath clipWipe linearGradient
  // 深度：shadow()（投影）fog()（空气透视）parallax()（视差）
  // 母题/装置：import { desk, panel, dialog, select, toggle, logConsole, wireHeart, pun } from "./_ui.js"
}
```

**文字用打包字体：`ctx.font = s.mono(16)` / `s.mono(34, 700)`（IBM Plex Mono）。**
系统 `monospace` / `Consolas` 换台机器就换一副字，像素承诺当场作废。
中文更要小心：打包的这套没有 CJK 字形，中文会渲染成 ▯▯▯（且豆腐块因机器而异）；
真要在画面里写中文，得先像 IBM Plex Mono 那样打包一套中文字体（很大，要单独决定）。

- **模型**是 HTML Canvas 2D（`@napi-rs/canvas`），不是 DOM，不是 CSS，也不是 React。
  想影响 DOM 的写法（`document`、`window`、`requestAnimationFrame`）在这里都不存在。
- 辉光不要用 `ctx.filter = 'blur()'`（慢且跨平台不一致），画几层不同半径的半透明圆叠加。
- 文字用 `monospace` / 自己以后加的字体文件，别指望系统字体跨机器一致。

## 动效库候选（2026-09-29 留，未实现）

> 这一节是给**未来**的画板作者（包括三个月后的你自己和下一个 Agent）准备的：
> 我们看完 pdoom-video 的源码，知道有哪些视觉语法**对得上「代码 MV」的工程形态**，
> 但**当前没做**。每条都写了适用场景和实现成本——动手前先读这一节，
> 看是不是真的要实现它，还是只是「想做」。

### 全局视觉母题（影响整画面）

| 母题 | 描述 | 何时该用 | 我们的实现成本 |
|---|---|---|---|
| **`cameraShake`** | 撞击瞬间整屏抖动 5-25px，pulse 函数驱动衰减（halfLife 60ms） | hook slam、爆炸、整段撞点 | 中（10 行；要算 `s.hit()` × `s.noise()` 双向；接在 `draw` 最外层 save/translate） |
| **`cameraZoom`** | 撞击瞬间整屏缩放 0.96-1.04 | hook slam、节拍撞击 | 低（5 行；`ctx.translate + scale`；SAFE 区留 12% 边距，够吃 4% 缩放） |
| **撞击三件套** | `cameraShake + cameraZoom + flashWhite` 同步触发 | 任何「敲一下」的瞬间 | 中（要做调度：所有 hook 用同一个 pulse 锚点） |
| **整屏色相翻转** | `invert = 1` 持续 N 帧（白底反成黑底） | 段头 / 段尾的「世界换相」 | 低（5 行；`ctx.globalCompositeOperation = 'difference'` + 背景层） |

### 跨画板可复用的视觉元素

| 元素 | 描述 | 何时该用 | 实现成本 |
|---|---|---|---|
| **spark 母题** | 一颗橙色点 + 拖尾 + 偶尔溅火花，跨画板复用（pdoom 的核心母题） | 需要「一个持续运动的东西贯穿全片」 | 中（20-30 行；点 + 拖尾 + 火花三件套；需要拖尾 buffer） |
| **单笔画雕刻字体** | `hersheytext` 包，OFL/公有领域，spark 真能「写字」 | 「手写歌词」「笔迹签名」「引导路径文字」 | 中（引入包 + 解析到 Path2D；中文会变豆腐块） |
| **glitch 切片动画** | 当前 `_ui.js` 的 `glitchSlice` 已有，但只跟着某事件，不随机 | 需要「画面出错」的视觉张力 | 低（已存在；接到 `s.hit()`） |
| **odometer 数字轮** | 0..9 滚筒，每个数字独立上下滚 | 计数器 / 读数 / 计时器 | 中（30 行；按数字位置画滚筒轨道，current/previous 帧间插值） |
| **banknote guilloché** | 钞票那种极细同心曲线花纹 | 「质感」「机构感」「权威感」 | 高（需要自己写算法；或预生成 PNG 当纹理） |

### 已有但还能加强

| 现状 | 怎么变 |
| | |
| `s.hit()` 已经在用 | **不够**——目前 flash/glitch 只跟某固定事件，**没全片统一接到 `s.hit()` 上**。每块画板的「撞击」应该统一调用 `cameraShake + cameraZoom + flashWhite`，**同一个 pulse 函数、同一个 amp**——这样全片撞击有节奏感，不会「这块抖那块不抖」 |
| `s.echo` 拖尾已存在 | 拖尾只在画板**自己画的东西**上作用——**没法给 floor / grain 加拖尾**（它们在画板之上另画）。需要时把 floor 接进画板内（破坏确定性就完蛋），或者接受「拖尾不到地板」 |
| `--samples N` 运动模糊 | 固定 N 是浪费。**`--samples auto`** 自适应（按帧间差异停采样）能省 50%+ 渲染时间。当前 AGENTS.md 提到这是「未来」——现在可以做 |
| `--post` 已存在 | 只在某些画板开。**重看一遍每块画板 post 开的必要性**，可能 03-geometry / 09-erase 不开 post 看起来「平」，开了立刻有质感 |

### 关于「为什么这些没做」

逐项解释一下为什么不默认就做：
- **cameraShake / cameraZoom**：pdoom 的 hook 用了 4 次 slam（重复撞击结构），**我们的 14 块画板里没有这种重复撞击**——大部分是 UI/对话框，**单次撞击本来就够**。**真要做的话**先看哪块画板「撞击感弱」再动手，**不要全局上**
- **spark 母题**：pdoom 的 spark 是「贯穿全片的单一运动元素」。我们 v2 复刻版的视觉语言是「终端/对话框」——**没有「贯穿元素」的位置感**。**真要做 spark 必须重新设计视觉**，不能硬塞
- **单笔画字体**：包能装。**中文会豆腐块**，而我们有英文歌词为主——**只有做中英字幕版才有用**
- **自适应采样**：纯收益无成本，**下一轮顺手做**

### 决策原则

加新动效**之前问三件事**：
1. **有没有「一个关键画面」**需要这个母题？——没有就不做
2. **会影响 floor / grain / HUD 吗**？——会影响就要全局方案，只影响画板层就用母题
3. **会不会破坏确定性**？——会破坏就不做（如 `performance.now()` 驱动的随机）

每条候选**触发实现**的唯一标准是：**有具体的画板或段落需要它**——不是为了「以后可能有用」而做。

## 常用命令

```bash
npm run smoke                 # 3 秒冒烟片，验证管线通不通
npm run preview -- --only <画板id> --count 30   # 联络表，几秒出图
npm run preview -- --only <画板id> --video --post   # 试片视频 + 后期质感（默认混音轨，--no-audio 关掉）
npm run preview -- --only <画板id> --perf --samples 8   # 量渲染耗时
npm run overview              # ★ 逐段总览页 out/overview.png（14 段一屏，过审「说第几段」用）
npm run query -- at 14.5 --moving   # ★ 查某一刻的元素 + 运动矢量（**不用出图**）
npm run query -- hit 865 300 --t 14.5   # 这个像素上是谁
npm run query -- board 14.5         # 这一帧的画板 + 淡入淡出值 env
npm run query -- board              # 全片画板区间 + fade 一览
npm run query -- track chessPiece --from 12.6 --to 14.4 --step 300
npm run query -- frame 14.5 --boxes # 少数必须看图的时候才出图（带 ID 框）
npm run parse:midi            # MIDI → assets/onsets.js
npm run analyze:structure     # 音频 → assets/sections.json（段落候选，人耳确认）
npm run align:lyrics          # assets/lyrics.txt → 词级时间戳（候选，人耳确认）
npm run make:treatment        # 生成 docs/策划书.md 骨架（拒绝覆盖已有；--force 才覆盖）
npm run render -- --out out/full.mp4 --post --samples 4   # --post 开质感，--samples 开运动模糊（贵）
npm run watch:render          # ★ 另开一个终端看渲染进度（渲染是谁启动的都行，只读进度文件）
npm run verify                # 四关全跑：static → gap → ink → determinism，都必须绿
npm run verify:static         # ① 秒级：s.xxx() 拼错 / 画板与段落表错位
npm run verify:gap            # ② 全片：空洞 / 空帧 / 「画了但没动」的静止段
npm run verify:gap -- --strict-motion   # 静止段也当失败（默认只 warn）
npm run verify:ink            # ③ 每块画板真的落了墨 + save/restore 配对
npm run verify:determinism    # ④ 同 seed+帧号=同像素；并 diff 画面基线
```

## 验收（四关）

`npm run verify` 依次跑四关，**任何一关红灯都算没做完**：

| 关 | 文件 | 管什么 |
|---|---|---|
| ① static | `verify/static-check.js` | 画板里每个 `s.xxx()` 都要真实存在（字符串键拼错了要等渲到那帧才炸）；画板毫秒区间和 `assets/sections.json` 对得上（时间基准一挪就会错位） |
| ② gap | `verify/gap-check.js` | 全片无空洞；抽样帧不空；**没有「画了但没动」的静止段**（≥0.6s 默认只 warn，`--strict-motion` 才失败）。开着 `config.floor` 时全片应为 0 静止段 |
| ③ ink | `verify/ink-check.js` | 每块画板**真的往画布上落了图元**，且 `save/restore` 配对 |
| ④ determinism | `verify/determinism-check.js` | 禁用 API 静态扫描；同帧重渲逐字节一致；乱序/交错不串味；和 `verify/picture-baseline.json` 比画面指纹 |

- `ink-check` 用 `verify/lib/record-ctx.js`：**把真 ctx 包一层**记录调用流、数图元、查 `save/restore`。
  要验证「真的画出来了」，只能看它落了多少图元——只验证「画板注册了」的覆盖率是假的
  （曾经有一个版本每块画板都在抛异常什么都没画，覆盖率照样报 100%）。
- **画面基线只 warn、不 fail，而且变了会自动更新。** 它用来告诉你「画面被无意识地改了没有」，
  不是用来冻结画面。有意的改动跑一次就重设基线，把新的 `picture-baseline.json` 一起提交。

## 工具链的坑

**用工具去判断作品对不对之前，先确认工具是对的。** 踩过的坑几乎都长一个样：
症状看起来像画面坏了，其实是工具坏了。

- **Windows PowerShell 批量替换会改编码。**
  `(Get-Content f -Raw) -replace 'A','B' | Set-Content f`
  在 PowerShell 5.1 里不是「文本替换」，是**重新编码**：UTF-8 被按 ANSI 读进来、再按同样方式写出去，
  于是每个非 ASCII 字符被双重编码（破折号会变成 `U+9225 U+003F`）。
  **批量改文本一律用 Edit / Write 工具，别用 PowerShell 管道**；真要写修复脚本，
  规矩是「**先替换 → 再解析 → 解析通过才写入**」。
- `@napi-rs/canvas` 的 `shadowBlur` 会把描边阴影画成填充盘 → 辉光一律「叠几层」。
- 改完画板立刻 `node tools/preview.js --only <那块>` 试一下：一块语法错会让**所有**画板都加载失败。
- 更多（`Path2D`、中文豆腐块、弧长、`-map` 参数顺序…）见 `docs/交接.md` 的「踩过的坑」。

## 性能现实

1920×1080 @60fps，时长 3:32 → **12720 帧**。
走 raw RGBA 管道直喂 ffmpeg 是最快的路子（PNG 落盘会慢一个数量级）。
真渲染时按帧区间切片、多进程并行；因为确定性，**切片渲染的像素**和
单线程逐帧渲染逐字节相同（编码成 mp4 后不保证——H.264 有损，
且各片 GOP/码率独立，颗粒序列也各从头数）。

两条已知的额外开销，都要显式开：

| 开关 | 实测（简单画板，12s / 719 帧） | 说明 |
|---|---|---|
| 无 | 110.9 帧/秒 | 只有画板 + 编码 |
| `--post` | 38.6 帧/秒 | 辉光/光晕/色散/颗粒/暗角，ffmpeg 侧 ≈23ms/帧 |
| `--samples 8` | 17.7 帧/秒 | 子帧运动模糊，≈56ms/帧，且**基本与画板复杂度无关**（开销全在全画布合成） |

所以：**运动模糊只给标了的段开**，普通拖尾优先用 `s.echo` / `s.shift`（重画过去，几乎免费）。

## 素材路线（重要）

这首歌**大概率没有可用的官方 MIDI**。所以卡点有两条路：

- **A 有 MIDI** → `tools/parse-midi.js` → `assets/onsets.js`，音高/力度都拿得到。
- **B 没 MIDI**（更可能）→ `tools/probe-audio.js` 量出真实时长与首拍偏移，
  `tools/align-beat.js` 拟出 beat 网格，再用 `tools/onset-detect.js` 的
  音频 onset 去校验网格。已知 **130 BPM / 4-4 / D minor / 约 3:31**。

B 路线不依赖任何第三方扒谱，而且对「真实录音的微小摇摆」更鲁棒。
**不要为了走 A 路线去网上随便抓一个可能错拍的 MIDI。**

段落（主歌/副歌/桥段）也是 B 路线的产物：`tools/analyze-structure.js`
按拍统计响度/低频占比/击打密度，找换段点并把相似的段聚成组 ——
**只给候选，`name` 必须人耳确认后再改**（机器分不出「主歌」和「副歌」）。
歌词时间戳：`tools/align-lyrics.js` 已经就位（输入 `assets/lyrics.txt`，
有 LRC 时间戳就准，只有纯文本就是「人声段 + 字数分配」的候选，必须人耳复核）。
**缺的只有歌词文本本身** —— 不凭记忆编歌词，也不凭记忆编时间。
判断同步准不准不要靠猜：`node tools/preview.js --only lyric-lab --video`
会渲一段带逐词擦除的试片，肉眼一看就知道哪句抢拍哪句拖拍。
