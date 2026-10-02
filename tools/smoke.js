/**
 * tools/smoke.js — 端到端冒烟测试
 *
 * 目标：用最短时间证明「渲染 + 编码」这条管线真的能跑出 mp4。
 * 跑的是 src/boards/00-smoke.js 那块画板，3 秒 180 帧。
 *
 * 用法：
 *   npm run smoke              # 默认 1920x1080 @60fps，3 秒
 *   node tools/smoke.js --frames 600 --fps 30
 *
 * 输出：out/smoke.mp4
 */

import { spawn } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

import { ROOT } from "../src/core/timeline.js";
import {
  ts,
  initEngine,
  createSurface,
  renderFrame,
  surfaceToRGBA,
  rawVideoArgs,
} from "../src/core/render.js";

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};

const FRAMES = getArg("frames", 180);
const FPS = getArg("fps", ts.fps);
const OUT = resolve(ROOT, "out", "smoke.mp4");

mkdirSync(resolve(ROOT, "out"), { recursive: true });

if (!ffmpegPath) {
  console.error("❌ ffmpeg-static 没有提供二进制，重装依赖：npm i ffmpeg-static");
  process.exit(1);
}

console.log(`▶ 引擎启动  画布 ${ts.width}x${ts.height} @ ${FPS}fps  共 ${FRAMES} 帧`);
console.log(`▶ ffmpeg: ${ffmpegPath}`);

const boards = await initEngine();
console.log(`▶ 已加载画板 ${boards.length} 块：${boards.map((b) => b.meta.id).join(", ")}`);

const ff = spawn(
  ffmpegPath,
  [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    ...rawVideoArgs(FPS),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    OUT,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

const surface = createSurface();
const t0 = Date.now();

for (let f = 0; f < FRAMES; f++) {
  renderFrame(surface.ctx, f);
  const buf = surfaceToRGBA(surface);
  if (!ff.stdin.write(buf)) {
    await new Promise((r) => ff.stdin.once("drain", r));
  }
  if (f % 30 === 0 || f === FRAMES - 1) {
    const pct = (((f + 1) / FRAMES) * 100).toFixed(0);
    process.stdout.write(`\r  渲染中 ${pct}%  (${f + 1}/${FRAMES})`);
  }
}
process.stdout.write("\n");

ff.stdin.end();
const code = await new Promise((r) => ff.on("close", r));
const dt = ((Date.now() - t0) / 1000).toFixed(1);

if (code !== 0) {
  console.error(`❌ ffmpeg 退出码 ${code}`);
  process.exit(1);
}

const size = statSync(OUT).size;
console.log(`✅ 完成  ${OUT}`);
console.log(`   ${(size / 1024).toFixed(0)} KB   耗时 ${dt}s   平均 ${(FRAMES / dt).toFixed(1)} 帧/秒`);
console.log(`   全片预估：${(ts.totalFrames / (FRAMES / dt) / 60).toFixed(1)} 分钟（单线程）`);
