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
