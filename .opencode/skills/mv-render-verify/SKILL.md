---
name: mv-render-verify
description: Use when rendering, encoding, or verifying the world.execute(me); MV — the end-to-end smoke test, raw RGBA to ffmpeg pipeline, sliced parallel rendering, and the gap-check / determinism-check quality gates. Triggers - 渲染, 出片, 编码, ffmpeg, verify, 体检, mp4, 并行渲染, 切片, 跑一下.
---

# 渲染与体检（world.execute(me);）

渲染不是「打开剪辑软件导出」：画面是 `(seed, frame)` 的纯函数，
引擎逐帧把 raw RGBA 喂给 ffmpeg，所以**任何一段都能单独重渲**。

## 命令

```powershell
npm install
npm run smoke                       # 3 秒冒烟片 → out/smoke.mp4（约 180 帧）
npm run preview -- --only <画板id>  # ★ 单画面联络表，串行过关时给用户看
npm run probe:audio                 # 音频探针 → assets/audio-probe.json
npm run beat:check -- --sweep       # 人耳校准拍相位 → out/beatchk/*.m4a
npm run detect:onsets               # 音频 onset → assets/onsets.js/json（B 路线）
npm run align:beat                  # 复核/拟合全曲网格 → assets/beat-grid.json
npm run parse:midi -- "assets/xxx.mid"   # A 路线（有 MIDI 时）
npm run render -- --out out/full.mp4     # 全片出片（默认单进程）
npm run render -- --jobs 4               # 切片并行加速（见下：非逐字节相同）
npm run verify                      # gap-check + determinism-check，必须绿
```

单项：

```powershell
node tools/smoke.js --frames 600 --fps 30
node tools/preview.js --from 12000 --to 20000 --count 24 --cols 6   # 联络表
node tools/preview.js --from 0 --to 180 --video                     # 整段 mp4 看动效
node tools/render-frames.js --start 3600 --end 5400 --out out/act.mp4   # 只渲某几秒
node tools/onset-detect.js --no-write          # 只看 onset 统计不落盘
node tools/align-beat.js --windows 6 --apply   # 复核后写回 config
node verify/gap-check.js --every 5                 # 每 5 帧抽 1
node verify/gap-check.js --every 1 --start 3600 --end 5400
node verify/determinism-check.js --samples 40
```

> 现状：工具链已就位 —— `smoke.js`、`preview.js`、`probe-audio.js`、`beat-check.js`、
> `onset-detect.js`、`align-beat.js`、`render-frames.js`，加上 `lib/wav.js`、`lib/onsets.js`、`lib/grid.js`。
> 音频在 `assets/audio/world.execute(me);.wav`（212000ms / 130 BPM / `beatOffsetMs` 459.7 已人耳确认）。

## 快速预览（改画板的主力）

别为了看 3 秒效果去渲 12720 帧。**串行工作流里每一步都用 `--only`**：

```powershell
node tools/preview.js --only crt-boot                       # ★ 只留这一块画板，区间自动取它自己的
node tools/preview.js --only crt-boot,title-card            # 逗号分隔可多选（看叠加关系）
npm run preview -- --from 12000 --to 20000 --count 24 --cols 6 --tile 480 --name act2
```

`tools/preview.js` 在时间区间里均匀抽 N 帧，拼成一张联络表 PNG（`out/preview/<name>.png`），
每格标注 `f帧号 / 秒 / 拍号`；加 `--video` 会把整段逐帧渲成 mp4 用来看动效。

- `--only <id>`：把别的画板从注册表摘掉，**看单画面时不被干扰**；只给一块时区间自动取它的 `startMs..endMs`。
- 脚本最后打印 `SHEET=<路径>`，方便后续脚本/agent 直接读取。
- 它是**只写 `out/` 的只读工具**，不影响确定性（`Date.now()` 只用于打印耗时，已按 `smoke.js` 的模式豁免）。

## 引擎一帧做什么（`src/core/render.js`）

1. `frameState(frame)` 生成时间状态
2. 用 `config.colors.bg` 清屏铺底
3. `activeBoards(ms)` 取覆盖当前时刻的画板，按 `z` 从底到顶
4. 每块画板乘自己的 `envelope()` 后 `draw(ctx, s)`
5. 交出像素：`surfaceToPNG`（慢，肉眼调试用）或 `surfaceToRGBA`（喂 ffmpeg，快一个数量级）

画板抛错会被包装成 `画板 "id" 在第 N 帧 (X ms) 崩溃：...`，据此二分定位。

## raw RGBA → ffmpeg（顺序敏感）

`src/core/render.js` 的 `rawVideoArgs()` 已给出输入参数：

```js
["-f", "rawvideo", "-pix_fmt", "rgba",
 "-s", `${width}x${height}`, "-r", String(fps), "-i", "pipe:0"]
```

`tools/smoke.js` 的完整编码参数（可复用）：

```js
["-y", "-hide_banner", "-loglevel", "error",
 ...rawVideoArgs(FPS),
 "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
 "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT]
```

背压：`if (!ff.stdin.write(buf)) await once(ff.stdin, "drain")` —— 别把所有帧堆内存里。

## 切片并行（`--jobs`，提速主力）

1920×1080 @60fps × 3:31 ≈ **12,720 帧**。因为逐帧是纯函数，可按帧区间切片、
多进程并行（`tools/render-frames.js --jobs N`）：

- 每个 worker 负责一段 `[startFrame, endFrame)`，各自跑 ffmpeg 到独立分片。
- 分片用 `ffmpeg -f concat -safe 0 -i list.txt -c copy` 拼接。
- 断点续渲：只重跑出问题的那几秒（`--start/--end`）。

**关键（别搞错）**：切片保证的是**喂给编码器的像素**和单进程逐字节相同；
但 H.264 有损，各片独立 GOP / 码率控制，**最终 mp4 不逐字节相同**（视觉一致）。
要逐字节可复现的成品 → `--jobs 1`（默认）。
项目文档若说「切片拼接逐字节相同」，指的是帧内容，不是 mp4 文件。

## 体检两道关（提交前必须绿）

### `verify/gap-check.js`
- **结构层**：每帧是否至少 1 块画板覆盖；已实现区段内部有空洞 → ❌；片头片尾未做 → ⚠️ 不算错。
- 同 `z` 同区间重叠 → ⚠️（确认是有意的叠加）。
- **渲染层**：抽样真渲染，抓抛错帧和「该可见却全空」帧（`env>0.5` 却整屏底色）。

### `verify/determinism-check.js`
- ① 静态扫描：`Math.random` / `Date.now` / `performance.now` / `new Date` / `requestAnimationFrame` 命中即 ❌。
  豁免要写进 `ALLOW` 表并注明理由（现有豁免：`tools/smoke.js` 的耗时打印）。
- ② 同帧渲两次逐字节比。
- ③ 倒序重渲一致（抓「依赖上一帧状态」）。
- ④ 交错渲染无污染（抓画板间串味）。

## 产物与 git

- `out/`、`assets/` **不进 git**（见 `.gitignore`）。
- 生成的 `assets/onsets.js` 禁止写时间戳/机器名（`parse-midi.js` 里 `generatedAt: "STATIC"`），
  否则每次 diff 都脏。
- `npm run verify` 绿了才准提交。
