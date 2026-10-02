---
name: mv-beat-sync
description: Use when working with time, BPM, beats, onsets, or lyric timing in the world.execute(me); MV — config/project.json as the only time source, timeline.js conversions, beat/beatPhase, beat-grid vs MIDI material routes, and beatOffset calibration. Triggers - 卡点, 拍, BPM, 时间轴, beat, 对齐, 歌词, lyrics, onset, 节拍, 摇摆.
---

# 卡点与时间轴（world.execute(me);）

**全片只有一个时间真相源：`config/project.json`。**
画板里禁止出现 `60000 / 130` 之类的字面量；一律走 `src/core/timeline.js`。

## 真相源字段（`config/project.json`）

| 字段 | 现值 | 说明 |
|---|---|---|
| `fps` | 60 | 帧率 |
| `width` / `height` | 1920 / 1080 | 画布 |
| `bpm` | 130 | 4-4 拍；原版 D minor，约 3:31 |
| `beatsPerBar` | 4 | 每小节拍数 |
| `beatOffsetMs` | 0 | 第 1 拍在音频里的毫秒偏移，**用工具拟合，不要手填** |
| `durationMs` | null | 实测音频时长；null 时回退 `assets/onsets.json` 或 212000 |
| `seed` | 20161012 | 改 seed = 换平行宇宙 |

注意：`Key Ingredient ver.` 是 **134 BPM / Bb / 3:44**，是另一个版本，别混用。

## `timeline.js` 换算表

| 函数 | 作用 |
|---|---|
| `frameToMs(f)` / `msToFrame(ms)` | 帧 ↔ 毫秒 |
| `msToBeat(ms)` / `beatToMs(b)` | 毫秒 ↔ 浮点拍 |
| `frameToBeat(f)` / `beatToFrame(b)` | 帧 ↔ 拍 |
| `msToBar(ms)` | 毫秒 → 小节 |
| `beatPhase(ms)` / `barPhase(ms)` | 拍内 / 小节内进度 `[0,1)` |
| `snapToGrid(ms, div)` | 吸附到 1/div 拍网格（`div=4` 十六分音符） |
| `crossedGrid(msA, msB, div)` | 两帧间是否跨过网格点，做「边沿触发」 |
| `frameState(frame)` | 渲染循环用的每帧状态包 |
| `totalFrames` / `durationMs` / `MS_PER_BEAT` | 派生常量 |

画板里通常不用显式调用——`draw(ctx, s)` 的 `s.beat` / `s.beatPhase` / `s.bar` 已由引擎算好。

## 卡点三招

1. **拍内衰减**（闪光、缩放）：
   `const decay = Math.pow(1 - s.beatPhase, 3);`
2. **网格吸附**（元素落在十六分音符上）：
   `const at = snapToGrid(s.ms, 4);`
3. **边沿触发**（只在跨过整拍那一刻做一件事，不做累加）：
   `if (crossedGrid(prevMs, s.ms, 1)) { ... }` —— 但注意画板**不许存上一帧**，
   所以要么用闭式判断（`s.beatPhase < 半帧对应值`），要么用 `snapToGrid` 比对当前帧。

> 摇摆处理：用**网格**排画面，不要用「第 N 个 onset」。真实录音有微小摇摆，网格更鲁棒。

## 素材路线（重要：这首歌大概率没有官方 MIDI）

- **A 有 MIDI** → `npm run parse:midi -- "assets/xxx.mid"` → 产出 `assets/onsets.js` + `assets/onsets.json`。
  - 数据格式：`[[ms, pitch, velocity], ...]`，`velocity` 归一化到 `[0,1]`，按 ms 升序。
  - `--quantize 4` 会额外输出对齐网格；`--min-velocity` 过滤弱音。
  - 脚本会把 MIDI 的 BPM 和 `config` 的 `bpm` 做比对，差 >0.5 会警告。
- **B 没 MIDI**（实际走的就是这条）→ 音频量测，按顺序跑：
  1. `npm run probe:audio` — 读 WAV，能量包络 → onset 自相关求拍周期（130 先验消八度歧义）→
     相位直方图定首拍偏移。产出 `assets/audio-probe.json`，**不自动改 config**。
  2. `npm run beat:check -- --sweep`（或 `--bars` / `--teach`）— 机器分不出正拍/反拍，
     把咔哒网格叠到原曲生成 m4a，**人耳拍板** offset（以及 4 拍里哪拍是「1」）。
  3. `npm run detect:onsets` — 提取音频 onset（带强度），写 `assets/onsets.js/json`（B 路线的卡点来源）。
  4. `npm run align:beat` — 用 onset 复核全曲网格、测分段漂移，写 `assets/beat-grid.json`；
     `--apply` 才把推荐 bpm/beatOffsetMs 写回 config。
  - 已确认：**130 BPM / 4-4 / D minor / 212000ms / `beatOffsetMs` 459.7**（首尾漂移 −0.9ms）。
- **不要**为了走 A 路线去网上随便抓一个可能错拍的 MIDI。

## 对齐工作流（音源到位后）

1. 把合法音源放到 `assets/audio/`，文件名与 `config.audio` 一致。
2. 量出真实时长写回 `config.durationMs`，并拟合 `beatOffsetMs`。
3. 重跑 `npm run verify:gap`（没音源时可先用合成节拍 130 BPM 的 click 轨）。
4. 换音源只需改 `beatOffsetMs` + 音频文件，**画面代码一行不用改**——这是本架构的主要好处。

## 歌词

歌词放 `assets/lyrics.txt` 或 `assets/lyrics.lrc`（**尚未加入，且 `assets/` 不进 git**）。
LRC 的时间戳是绝对毫秒，直接和 `s.ms` 比即可；排版用 monospace，遵循 `mv-board-authoring`。
