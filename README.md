# world.execute(me); — 代码驱动 MV

Mili《world.execute(me);》的 MV。画面是代码，不是剪辑软件里的时间线。

**核心承诺**：同一个 `seed` + 同一个帧号 = 同一份像素。
所以任何一帧都能单独重渲，任何一段出问题都能只重跑那几秒。

---

## 现在到哪一步了

**全片 14 块画板都实现了**（`src/boards/01-…14-…`，0:00 → 3:32 连续覆盖），
`npm run verify` 四关全绿（static / gap / ink / determinism）。视觉语言按导演指定的参考片做成了「桌面系统 UI」；
**缺的是导演逐块过审**——画面是叠加的，底子错了后面全歪。

```bash
npm install
npm run smoke        # 3 秒冒烟片（现在冒烟的是真片头）
npm run preview -- --only shot-04 --video            # 单块试片（默认混音轨）
npm run verify       # gap-check + determinism-check，两个都必须绿
npm run render -- --out out/full.mp4 --post bloom=0,halation=0,ca=1.0,grain=0.03,vignette=0.12 --jobs 4
```

> **后期**：参考片是**平的**，所以出片用上面那条 —— 关掉辉光/光晕，只留极轻的
> 色散与颗粒。第一版（终端语言）开了全档后期，那是另一套语言。
> 旧版完整 14 块保留在 `src/boards/_v1-*.js`（不加载），想对比就去掉前缀。

### 音频现状（已实测）

| 项目 | 值 |
|---|---|
| 文件 | `assets/audio/world.execute(me);.wav`（212.000s，44.1kHz 立体声） |
| 来源 | 桌面上的同人 PV mp4，已抽出并**裁掉 24.6 秒数字静音尾巴** |
| 原始素材 | `assets/audio/_raw-from-mp4.wav`（未裁剪，留底）、`_source-aac.m4a` |
| 有效区间 | 0:00.283 → 0:03:31.897 —— **和原版单曲的 3:31 对得上，确认是原曲** |
| BPM | 实测 **130.14**（自相关 + 先验 130 一致） |
| 拍相位 | ⚠️ **自动分析不可信**（锐度 1.30），必须人耳校准 → `npm run beat:check -- --sweep` |

**待你确认的一件事**：听 `out/beatchk/` 里那 5 个文件（每个相差 1/5 拍），
告诉我哪个咔哒最「粘」在鼓点上。定下来我才能写 `beatOffsetMs`。

---

## 缺什么（这是当前唯一的卡点）

| 需要 | 状态 | 放哪 |
|---|---|---|
| 歌曲音频 | ✅ 已就位 | `assets/audio/world.execute(me);.wav` |
| 拍相位（beatOffsetMs） | ⚠️ 待你听 5 个试听文件定夺 | `out/beatchk/*.m4a` |
| **你的策划** | ❌ **没有**（模板见 `docs/策划书-模板.md`，复制成 `docs/策划书.md` 再填） | 写给我就行，或放 `docs/` |
| MIDI 扒谱 | ➖ 不需要 | 走节拍网格路线 |
| 歌词 / LRC | ⚠️ 如果策划里要打字幕就需要 | `assets/lyrics.txt` |


---

## 事实核查（和参考材料的差异）

| 说法 | 核实结果 |
|---|---|
| `bilibili/carocut`，OpenCode AI SDK + Remotion，8 步工作流 | ✅ **真实存在**，描述准确 |
| Remotion 生态 + Agent Skills 做视频 | ✅ 真实，且很成熟 |
| 歌曲 130 BPM / 4-4 / D minor / 约 3:31 | ✅ 三处数据源一致（原版）。注意 `Key Ingredient ver.` 是 **134 BPM / Bb / 3:44**，是另一版 |
| 「运行 `/connect` 配 DeepSeek，选 V4-Flash」 | ⚠️ 本会话已经跑在 DeepSeek 上，**不用再配** |
| 「解析 `world.execute(me);.mid`」 | ⚠️ **本机没有任何 .mid 文件**（已全盘扫过），这一步现在跑不了 |
| `motion-video-skill`、`HyperFrames` | ⚠️ 没找到可靠出处，先不当依赖 |

---

## 为什么没用 Remotion

carocut / Remotion 那条路很好，但对这个片子的具体需求有个错配：

- Remotion 是 **React + 浏览器**渲染，适合「网页质感」的动态图形。
  装起来要拉一个 headless Chrome，重，且渲染时多一层浏览器变量。
- 《world.execute(me);》的画面语言是**终端 / 代码 / 几何 / 单色辉光**，
  Canvas 2D 就是干这个的。用 `@napi-rs/canvas` 直接画，没有任何浏览器，
  依赖只有 4 个 npm 包，确定性更容易守。
- 少了 React 那一层，**逐帧纯函数**这个承诺是能被机械验证的
  （见 `verify/determinism-check.js`），而不是「应该没问题」。

如果后面要做 WebGL 级别的 3D 段，再单独引 `headless-gl` 或换 Remotion 都来得及——
画板是插件制的，换渲染后端不用重写画面逻辑。

---

## 架构

```
            config/project.json  ← 唯一的真相源（BPM/fps/seed/配色）
                     │
              src/core/timeline.js      帧 ↔ 毫秒 ↔ 拍
                     │
    ┌────────────────┼────────────────┐
    │        src/core/kernel.js       │   确定性哈希 / 噪声 / 缓动
    │                │                │
    │        src/core/registry.js     │   画板注册表
    │                │                │
    │        src/core/render.js       │   逐帧渲染
    └────────────────┼────────────────┘
                     │
            src/boards/*.js  ← 画面全在这，一块画板一个文件
                     │
                  raw RGBA → ffmpeg → mp4
```

一块画板 = 一个时间段 + 一个纯绘制函数：

```js
export const meta = { id: "crt-boot", z: 10, startMs: 0, endMs: 8000 };
export function draw(ctx, s) {
  s.env        // 淡入淡出，0..1
  s.beat       // 拍号（可小数）
  s.beatPhase  // 本拍内进度，卡拍闪光用它
  s.fbm(...)   // 平滑噪声，「世界状态曲线」
  s.rnd(k)     // 确定性随机
}
```

---

## 命令

```bash
npm run smoke                    # 3 秒冒烟片
npm run parse:midi -- <file.mid> # MIDI → assets/onsets.js
npm run analyze:structure        # 音频 → 段落候选（人耳确认后改名）
npm run align:lyrics             # assets/lyrics.txt → 词级时间戳（候选人耳确认）
npm run make:treatment           # 生成 docs/策划书.md 骨架（已埋好时间/段落/歌词；拒绝覆盖已有）
npm run render -- --out out/full.mp4
npm run render -- --post         # 开后期质感（辉光/光晕/色散/颗粒/暗角）
npm run render -- --samples 8    # 开子帧运动模糊（很贵，只给标了的段开）
npm run verify                   # 全片体检，四关：static → gap → ink → determinism
npm run verify:static            # s.xxx() 拼错 / 画板与段落表错位（秒级）
npm run verify:gap               # 空洞 / 空帧 / 「画了但没动」的静止段
npm run verify:ink               # 每块画板真的落了墨 + save/restore 配对
npm run verify:determinism       # 同 seed+帧号=同像素 + 画面基线
```

### 看一块画板 / 看一个效果

```bash
node tools/preview.js --only fx-lab --count 30          # 联络表：一屏看完所有效果
node tools/preview.js --only fx-lab --video --post      # 12 秒试片，带后期
node tools/preview.js --only fx-lab --perf --samples 8  # 量渲染耗时
node tools/preview.js --only lyric-lab --video          # 歌词逐词同步试片（15–45s，含音轨）
node tools/preview.js --only shot-09 --video --no-floor # 常驻「地板」开/关对比（config.floor 默认开）
node tools/preview.js --cuts                            # 每个转场前后各抽 4 帧，查断裂
```

**常驻「地板」**（`config.floor`，实现见 `src/core/floor.js`）：叠在画板之上的一层
极轻、永不静止的底噪，保证全片没有观众能感觉到的静止段。`--floor` / `--no-floor`
可临时覆盖（`preview` / `render` / `verify:gap` 都支持）。

效果清单与「你这样说我就这么做」的口令见 [`docs/效果菜单.md`](docs/效果菜单.md)。
样板画板 `src/boards/99-fx-lab.js`（`tags:["debug"]`，3–15s）是纯样板，不是成片内容。

## 性能量级

1920×1080 @60fps、3:31 → 12,720 帧。
raw RGBA 管道直喂 ffmpeg，单线程大约…先看 `npm run smoke` 打印的实测帧率。
不够快就按帧区间切多进程——因为确定性，切片拼起来和单线程结果逐字节相同。
