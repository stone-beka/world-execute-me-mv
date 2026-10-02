/**
 * tools/preview.js — 快速预览（省试错成本）
 *
 * 别为了看 3 秒效果去渲 12720 帧。
 * 这个工具按时间区间均匀抽 N 帧，拼成一张联络表 PNG，
 * 一屏就能看完整段弧线：进场、动作、退场对不对，节奏对不对。
 *
 * 用法：
 *   node tools/preview.js                                  # 0..3s 抽 30 帧
 *   node tools/preview.js --from 12000 --to 20000 --count 24
 *   node tools/preview.js --count 36 --cols 6 --tile 640
 *
 * 产出：
 *   out/preview/<名字>.png   联络表
 *   out/preview/<名字>.mp4   （加 --video 才生成，整段逐帧，用于看动效）
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createCanvas } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";

import { ROOT, config } from "../src/core/timeline.js";
import {
  ts,
  initEngine,
  createSurface,
  renderFrame,
  surfaceToRGBA,
  rawVideoArgs,
} from "../src/core/render.js";
import { boards, resolveRange } from "../src/core/registry.js";
import { rgba } from "../src/core/fade.js";
import { parsePost, buildPostFilter, hasPost } from "../src/core/post.js";

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(`--${n}`);

const ONLY = getStr("only", null);
let FROM = getArg("from", 0);
let TO = getArg("to", 180);
const COUNT = getArg("count", 30);
const COLS = getArg("cols", 5);
const TILE = getArg("tile", 480);
const LABEL = getArg("label", 30);
const WANT_VIDEO = has("video");
const SAMPLES = Math.max(1, Math.floor(getArg("samples", 1)));
const SHUTTER = getArg("shutter", 0.5);
// 常驻「地板」：--floor 强制开，--no-floor 强制关，都不给就用 config.floor
const FLOOR = has("floor") ? true : has("no-floor") ? false : undefined;
const CUTS = has("cuts");
const PERF = has("perf");
const NO_AUDIO = has("no-audio");
// --post 只作用于 --video（联络表 PNG 不走 ffmpeg）
const POST_ARG = has("post") ? getStr("post", "") : null;
const POST = POST_ARG === null ? null : parsePost(POST_ARG);
const POST_ON = POST !== null && hasPost(POST);

const OUT_DIR = resolve(ROOT, "out", "preview");
mkdirSync(OUT_DIR, { recursive: true });

await initEngine();

// --only：只留指定的画板（逗号分隔可多选），把别的从注册表里摘掉。
// 「一个关键画面过一关」的工作流靠它——看单画面时不该被别的画板干扰。
if (ONLY) {
  const want = new Set(ONLY.split(",").map((s) => s.trim()));
  for (let i = boards.length - 1; i >= 0; i--) {
    if (!want.has(boards[i].meta.id)) boards.splice(i, 1);
  }
  if (boards.length === 0) {
    console.error(`❌ --only ${ONLY} 没匹配到任何画板`);
    process.exit(1);
  }
  console.log(`▶ 单独预览：${boards.map((b) => b.meta.id).join(", ")}`);

  // 没显式给区间就用这块画板自己的时间范围
  if (!argv.includes("--from") && !argv.includes("--to") && boards.length === 1) {
    const r = resolveRange(boards[0].meta);
    FROM = Math.round((r.startMs / 1000) * ts.fps);
    TO = Math.round((r.endMs / 1000) * ts.fps) - 1;
  }
}

const NAME = getStr("name", CUTS ? "cuts" : ONLY ? ONLY.replace(/[^\w-]/g, "_") : `p${FROM}-${TO}`);

// ---- 抽哪些帧 ----
let FRAMES;
if (CUTS) {
  // 每个画板的进场/退场前后各 4 帧：一眼查「转场有没有裂」
  const marks = new Set();
  for (const b of boards) {
    const r = resolveRange(b.meta);
    marks.add(r.startMs);
    marks.add(r.endMs);
  }
  const offs = [-100, -1000 / 60, 1000 / 60, 100];
  FRAMES = [...marks]
    .sort((a, b) => a - b)
    .flatMap((ms) => offs.map((o) => Math.round(((ms + o) / 1000) * ts.fps)))
    .filter((f) => f >= 0 && f < ts.totalFrames);
} else {
  FRAMES = [];
  for (let i = 0; i < COUNT; i++) {
    FRAMES.push(COUNT === 1 ? FROM : Math.round(FROM + ((TO - FROM) * i) / (COUNT - 1)));
  }
}

const tileW = TILE;
const tileH = Math.round((TILE * ts.height) / ts.width);
const rows = Math.ceil(FRAMES.length / COLS);
const pad = 8;
const sheetW = COLS * tileW + (COLS + 1) * pad;
const sheetH = rows * (tileH + LABEL) + (rows + 1) * pad;

const sheet = createCanvas(sheetW, sheetH);
const sctx = sheet.getContext("2d");
sctx.fillStyle = "#101010";
sctx.fillRect(0, 0, sheetW, sheetH);

const surface = createSurface();

// ---- perf：只量渲染耗时，不出图 ----
if (PERF) {
  const N = Math.max(2, Math.min(600, getArg("frames", TO - FROM + 1)));
  const list = [];
  for (let i = 0; i < N; i++) list.push(FROM + Math.round(((TO - FROM) * i) / (N - 1)));
  renderFrame(surface.ctx, list[0], { samples: SAMPLES, shutter: SHUTTER, floor: FLOOR }); // 预热
  const cost = [];
  for (const f of list) {
    const a = Date.now();
    renderFrame(surface.ctx, f, { samples: SAMPLES, shutter: SHUTTER, floor: FLOOR });
    cost.push(Date.now() - a);
  }
  cost.sort((a, b) => a - b);
  const avg = cost.reduce((a, b) => a + b, 0) / cost.length;
  console.log(`▶ perf  ${list.length} 帧  samples=${SAMPLES} shutter=${SHUTTER}  区间 ${FROM}..${TO}`);
  console.log(
    `   avg ${avg.toFixed(1)}ms  p50 ${cost[cost.length >> 1]}ms  p95 ${cost[Math.floor(cost.length * 0.95)]}ms  ` +
      `max ${cost[cost.length - 1]}ms  → ${(1000 / avg).toFixed(1)} 帧/秒`,
  );
  console.log(`   全片 ${ts.totalFrames} 帧 单线程预估 ${((avg * ts.totalFrames) / 1000 / 60).toFixed(1)} 分钟`);
  process.exit(0);
}

console.log(`▶ 抽 ${FRAMES.length} 帧   frame ${FROM}..${TO}   约 ${((TO - FROM) / ts.fps).toFixed(2)}s`);
console.log(`▶ 联络表 ${COLS}×${rows}  每格 ${tileW}×${tileH}  samples=${SAMPLES}`);

const t0 = Date.now();
for (let i = 0; i < FRAMES.length; i++) {
  const f = FRAMES[i];
  renderFrame(surface.ctx, f, { samples: SAMPLES, shutter: SHUTTER, floor: FLOOR });

  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = pad + col * (tileW + pad);
  const y = pad + row * (tileH + LABEL + pad);

  sctx.drawImage(surface.canvas, x, y, tileW, tileH);

  const ms = (f * 1000) / ts.fps;
  const beat = ms / (60000 / config.bpm);
  sctx.fillStyle = "#000";
  sctx.fillRect(x, y + tileH, tileW, LABEL);
  sctx.fillStyle = "#8fe8c8";
  sctx.font = "13px Consolas, monospace";
  sctx.fillText(
    `f${String(f).padStart(5)}  ${(ms / 1000).toFixed(2)}s  ♩${beat.toFixed(2)}`,
    x + 6,
    y + tileH + 20,
  );
}

const sheetPath = resolve(OUT_DIR, `${NAME}.png`);
writeFileSync(sheetPath, sheet.toBuffer("image/png"));
console.log(`✅ ${sheetPath}`);
console.log(`   ${(Date.now() - t0) / 1000}s`);

if (WANT_VIDEO) {
  const mp4 = resolve(OUT_DIR, `${NAME}.mp4`);
  const vf = POST_ON ? buildPostFilter(POST) : null;

  // ffmpeg 的参数顺序很挑：**先把所有输入排完，再排输出选项**。
  // 之前把 -map/-filter_complex 放在第二个 -i 前面，只要同时有"后期+音轨"就会 EPIPE。
  const vargs = ["-y", "-hide_banner", "-loglevel", "error", ...rawVideoArgs()]; // 输入 0：rawvideo
  const audio = NO_AUDIO ? null : findAudio();
  if (audio) {
    const fromS = FROM / ts.fps;
    const durS = (TO - FROM + 1) / ts.fps;
    vargs.push("-ss", fromS.toFixed(3), "-t", durS.toFixed(3), "-i", audio); // 输入 1：音轨
  }

  if (vf) vargs.push("-filter_complex", vf.graph, "-map", `[${vf.out}]`);
  if (audio) {
    if (!vf) vargs.push("-map", "0:v:0");
    vargs.push("-map", "1:a:0");
  }

  vargs.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p");
  if (audio) vargs.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  vargs.push("-movflags", "+faststart", mp4);

  console.log(
    `▶ 视频 samples=${SAMPLES} shutter=${SHUTTER}${vf ? " + post" : ""}` +
      `${audio ? ` + 音轨(${FROM / ts.fps}s 起)` : NO_AUDIO ? "（--no-audio）" : "（没找到音轨）"}`,
  );
  const ff = spawn(ffmpegPath, vargs);
  for (let f = FROM; f <= TO; f++) {
    renderFrame(surface.ctx, f, { samples: SAMPLES, shutter: SHUTTER, floor: FLOOR });
    if (!ff.stdin.write(surfaceToRGBA(surface))) {
      await new Promise((r) => ff.stdin.once("drain", r));
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`✅ ${mp4}`);
}

/** 让后续脚本可以直接 require 到联络表路径 */
console.log(`SHEET=${sheetPath}`);

/** 找音轨：config.audio 优先，退回 assets/audio 里第一个非下划线开头的音频 */
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
