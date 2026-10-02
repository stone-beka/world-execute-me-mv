/**
 * tools/render-frames.js — 全片渲染 + 编码（出片入口）
 *
 * 把 [start, end) 的帧逐帧画出来，raw RGBA 直喂 ffmpeg，再按需混入音轨。
 * 因为画面是 (seed, frame) 的纯函数，可以按帧区间切成多片并行渲染（--jobs）。
 *
 * ⚠️ 关于「切片是否逐字节相同」：
 *   喂给编码器的**像素**和单线程逐帧完全一致（帧级确定性，verify:determinism 保证）。
 *   但 H.264 是有损的，各片独立输入 ffmpeg = 独立 GOP / 码率控制，
 *   所以最终 mp4 **不会**和单进程逐字节相同（视觉上一致）。
 *   需要逐字节可复现的成品，用 --jobs 1（默认）。
 *
 * 用法：
 *   npm run render                       # 全片 → out/full.mp4
 *   npm run render -- --out out/v2.mp4
 *   npm run render -- --start 3600 --end 5400        # 只渲某几秒（试错/补渲）
 *   npm run render -- --jobs 4                       # 四进程切片并行
 *   npm run render -- --no-audio                     # 只出无声视频
 *   node tools/render-frames.js --crf 16 --preset slow
 *
 * 音轨：优先用 config.audio 指定的文件；不存在就退回 assets/audio 里第一个 WAV。
 * 产物 out/ 不进 git。
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

import { ROOT, config } from "../src/core/timeline.js";
import { ts, initEngine, createSurface, renderFrame, surfaceToRGBA, rawVideoArgs } from "../src/core/render.js";
import { parsePost, buildPostFilter, hasPost } from "../src/core/post.js";
import { createProgressWriter, startTaskBar, clearProgress } from "./lib/progress.js";

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

const START = Math.max(0, Math.floor(getArg("start", 0)));
const END = Math.min(ts.totalFrames, Math.floor(getArg("end", ts.totalFrames)));
const OUT = resolve(ROOT, getStr("out", "out/full.mp4"));
const CRF = getArg("crf", 18);
const PRESET = getStr("preset", "veryfast");
const JOBS = Math.max(1, Math.floor(getArg("jobs", 1)));
const NO_AUDIO = has("no-audio");
const KEEP_TEMP = has("keep-temp");
const WORKER = has("worker");
// worker 的编号（主进程按分片顺序分配），用于写自己的进度文件
const SLOT = Math.max(0, Math.floor(getArg("slot", 0)));
// 主进程传进来的临时目录（worker 必须和主进程共用一个，否则进度读不到）
const TMPDIR_ARG = getStr("tmpdir", null);
const SAMPLES = Math.max(1, Math.floor(getArg("samples", 1)));
const SHUTTER = getArg("shutter", 0.5);
const FLOOR = has("floor") ? true : has("no-floor") ? false : undefined;

// --post            → 全套默认质感
// --post bloom=0.5,ca=2 → 指名道姓改参数
const POST_ARG = has("post") ? getStr("post", "") : null;
const POST = POST_ARG === null ? null : parsePost(POST_ARG);
const POST_ON = POST !== null && hasPost(POST);

if (!ffmpegPath) {
  console.error("❌ ffmpeg-static 没有提供二进制，重装依赖：npm i ffmpeg-static");
  process.exit(1);
}
if (END <= START) {
  console.error(`❌ 区间为空：start=${START} end=${END}`);
  process.exit(1);
}

// 按进程隔离：并行跑多个 render-frames 时不会互相删掉对方正在用的临时目录
// （要在 worker 块之前定义：worker 也要把进度写进同一个目录）
// 注意：**worker 必须用主进程传进来的同一个目录**（--tmpdir），
// 否则每个 worker 的 process.pid 不同 → 各写各的文件夹 → 主进程读不到进度。
const tmpDir = TMPDIR_ARG
  ? resolve(TMPDIR_ARG)
  : resolve(ROOT, "out", `.render-tmp-${process.pid}`);
mkdirSync(tmpDir, { recursive: true });

// ================================================================ worker
// 影子进程：把 [START, END) 渲成一个无声 mp4。由主进程用 --worker 唤起。
if (WORKER) {
  await initEngine();
  const fps = ts.fps;
  const vf = POST_ON ? buildPostFilter(POST) : null;
  const encArgs = [
    "-y", "-hide_banner", "-loglevel", "error",
    ...rawVideoArgs(fps),
  ];
  if (vf) encArgs.push("-filter_complex", vf.graph, "-map", `[${vf.out}]`);
  encArgs.push("-c:v", "libx264", "-preset", PRESET, "-crf", String(CRF), "-pix_fmt", "yuv420p", OUT);
  const ff = spawn(ffmpegPath, encArgs, { stdio: ["pipe", "inherit", "inherit"] });

  const surface = createSurface();
  const total = END - START;
  const prog = createProgressWriter(SLOT, tmpDir);
  for (let f = START; f < END; f++) {
    renderFrame(surface.ctx, f, { samples: SAMPLES, shutter: SHUTTER, floor: FLOOR });
    if (!ff.stdin.write(surfaceToRGBA(surface))) {
      await new Promise((r) => ff.stdin.once("drain", r));
    }
    const done = f - START + 1;
    prog.update(done, total);
    if (JOBS === 1 && (done % 120 === 0 || done === total)) {
      process.stdout.write(`\r  渲染 ${((done / total) * 100).toFixed(0)}%  (${done}/${total})`);
    }
  }
  prog.finish(total);
  if (JOBS === 1) process.stdout.write("\n");

  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  if (code !== 0) {
    console.error(`❌ 分片 [${START},${END}) ffmpeg 退出码 ${code}`);
    process.exit(1);
  }
  console.log(`  ✅ 分片 ${START}..${END - 1}  → ${basename(OUT)}`);
  process.exit(0);
}

// ================================================================ 主进程

mkdirSync(dirname(OUT), { recursive: true });

console.log(`▶ 全片渲染  ${ts.width}x${ts.height} @ ${ts.fps}fps  帧 ${START}..${END - 1}（${END - START} 帧 / ${((END - START) / ts.fps).toFixed(1)}s）`);
console.log(`  ffmpeg ${basename(ffmpegPath)}   crf ${CRF} preset ${PRESET}   jobs ${JOBS}   samples ${SAMPLES} shutter ${SHUTTER}`);
if (POST_ON) console.log(`  后期 --post ${JSON.stringify(POST)}`);
if (JOBS > 1) {
  console.warn("  ⚠️  --jobs>1：帧内容与单进程一致，但有损编码各片 GOP 独立，最终 mp4 不逐字节相同（视觉一致）");
}

const t0 = Date.now();

// ---- 分片 ----
const n = Math.min(JOBS, END - START);
const bounds = [];
for (let i = 0; i < n; i++) {
  const a = START + Math.round(((END - START) * i) / n);
  const b = START + Math.round(((END - START) * (i + 1)) / n);
  if (b > a) bounds.push([a, b]);
}

const self = fileURLToPath(import.meta.url);
const slabs = bounds.map(([a, b], i) => resolve(tmpDir, `slab-${String(i).padStart(3, "0")}_${a}-${b}.mp4`));

// 进度条：4 个 worker 各自的进度汇总成一条，否则 --jobs 4 时全程没有输出
clearProgress(bounds.length, tmpDir);
const bar = startTaskBar(END - START, bounds.length, tmpDir);

await Promise.all(
  bounds.map(([a, b], i) =>
    new Promise((res, rej) => {
      const child = spawn(
        process.execPath,
        [self, "--worker", "--start", String(a), "--end", String(b), "--out", slabs[i],
         "--crf", String(CRF), "--preset", PRESET, "--jobs", String(JOBS),
         "--samples", String(SAMPLES), "--shutter", String(SHUTTER),
         "--slot", String(i),
         "--tmpdir", tmpDir,
         ...(FLOOR === undefined ? [] : [FLOOR ? "--floor" : "--no-floor"]),
         ...(POST_ARG !== null ? ["--post", POST_ARG] : [])],
        { stdio: ["ignore", "ignore", "inherit"] },
      );
      child.on("close", (c) => (c === 0 ? res() : rej(new Error(`分片 ${i} 退出码 ${c}`))));
    }),
  ),
);
bar.stop();
clearProgress(bounds.length, tmpDir);

// ---- 拼接分片（同参数编码，可 -c copy 无损拼） ----
let videoPath = slabs[0];
if (slabs.length > 1) {
  const listPath = resolve(tmpDir, "concat.txt");
  writeFileSync(listPath, slabs.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n") + "\n");
  const joined = resolve(tmpDir, "joined.mp4");
  await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", joined]);
  videoPath = joined;
  console.log(`  ✅ 拼接 ${slabs.length} 片`);
}

// ---- 音轨 ----
const audio = NO_AUDIO ? null : findAudio();
if (audio) {
  await runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", videoPath, "-i", audio,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-shortest", "-movflags", "+faststart", OUT,
  ]);
  console.log(`  ✅ 混入音轨 ${basename(audio)}`);
} else {
  if (!NO_AUDIO) console.warn("  ⚠️  没找到音轨，输出无声视频（--no-audio 可显式声明）");
  // 复制/移动成最终产物（带上 faststart）
  await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath, "-c", "copy", "-movflags", "+faststart", OUT]);
}

if (!KEEP_TEMP) rmSync(tmpDir, { recursive: true, force: true });

const size = statSync(OUT).size;
const dt = (Date.now() - t0) / 1000;
console.log("");
console.log("══════════════════════════════════════════════════");
console.log(`✅ 完成  ${OUT}`);
console.log(`   ${(size / 1024 / 1024).toFixed(1)} MB   耗时 ${dt.toFixed(1)}s   ${((END - START) / dt).toFixed(1)} 帧/秒`);
console.log("══════════════════════════════════════════════════");

// ================================================================ helpers

/** 找音轨：config.audio 优先，退回 assets/audio 里第一个非下划线开头的 WAV */
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

function runFfmpeg(args) {
  return new Promise((res, rej) => {
    const ff = spawn(ffmpegPath, args, { stdio: ["ignore", "inherit", "inherit"] });
    ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg 退出码 ${c}`))));
    ff.on("error", rej);
  });
}
