/**
 * tools/overview.js — 逐段总览页（一屏看完 14 段，供「对着画面说」）
 *
 * 【为什么有它】
 * 过审时最难的是**说清「第几段、哪个时刻」**。这个工具把全片按 `assets/sections.json`
 * 的段落切开，每段取一个代表性时刻出一帧，拼成**一页**，并在每格下面写清：
 *
 *     #3  verse1   0:45.74   shot-03   elements 11
 *
 * 于是你可以直接说「第 3 段那个读数不对」或「0:45 这格……」，我按 ID / 时刻都能定位。
 *
 * 用法：
 *   node tools/overview.js                    # → out/overview.png（4 列）
 *   node tools/overview.js --cols 5 --frac 0.5 --tile 420
 *   node tools/overview.js --out out/ov-v8.png
 *   node tools/overview.js --text             # 只打表，不出图
 *
 * 段落名来自 `assets/sections.json`（人耳确认过的）。取帧时刻默认在段的 55% 处
 * （躲开进场/退场，落在主体内容上）。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

import { ROOT, sections, sectionAt } from "../src/core/timeline.js";
import { ts } from "../src/core/render.js";
import { initProbe, probeAt, probeSurface, timeLabel } from "./lib/probe.js";

const argv = process.argv.slice(2);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const getNum = (n, d) => {
  const v = getStr(n, d);
  return v === undefined ? d : Number(v);
};
const has = (n) => argv.includes(`--${n}`);

const COLS = Math.max(1, Math.floor(getNum("cols", 4)));
const TILE = Math.max(160, Math.floor(getNum("tile", 460)));
const FRAC = Math.min(0.95, Math.max(0.05, getNum("frac", 0.55)));
const LABEL = 44;
const PAD = 8;

await initProbe();

const list = sections.sections ?? sections;
const at = (sec) => (sec.startMs + (sec.endMs - sec.startMs) * FRAC) / 1000;

// ---- 文本表（永远打，方便不看图也能引用）----
const text = [];
for (const sec of list) {
  const t = at(sec);
  const p = probeAt(t);
  text.push({
    idx: sec.index,
    name: sec.name,
    t,
    frame: p.frame,
    board: p.boards.map((b) => b.id).join("+") || "-",
    elements: p.live.length,
  });
}
console.log("段  段落名           取帧      板                元素");
for (const r of text) {
  console.log(
    `#${String(r.idx).padEnd(3)}${String(r.name).padEnd(17)}${String(timeLabel(r.t)).padEnd(10)}${String(r.board).padEnd(18)}${String(r.elements).padStart(3)}`,
  );
}

if (has("text")) process.exit(0);

// ---- 拼图（探一帧就立刻拷走像素：探针那块离屏面是会被下一帧覆盖的）----
const tileW = TILE;
const tileH = Math.round((TILE * ts.height) / ts.width);
const sheetRows = Math.ceil(list.length / COLS);
const sheetW = COLS * tileW + (COLS + 1) * PAD;
const sheetH = sheetRows * (tileH + LABEL) + (sheetRows + 1) * PAD;

const sheet = createCanvas(sheetW, sheetH);
const sctx = sheet.getContext("2d");
sctx.fillStyle = "#0d0d10";
sctx.fillRect(0, 0, sheetW, sheetH);

list.forEach((sec, i) => {
  const t = at(sec);
  const p = probeAt(t); // 渲染到探针的离屏面

  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = PAD + col * (tileW + PAD);
  const y = PAD + row * (tileH + LABEL + PAD);

  // 立刻拷走 —— 下一次 probeAt 会覆盖这块面
  sctx.drawImage(probeSurface().canvas, x, y, tileW, tileH);

  sctx.strokeStyle = "rgba(255,255,255,0.14)";
  sctx.lineWidth = 1;
  sctx.strokeRect(x + 0.5, y + 0.5, tileW - 1, tileH - 1);

  sctx.fillStyle = "#101014";
  sctx.fillRect(x, y + tileH, tileW, LABEL);
  sctx.font = "600 15px Consolas, monospace";
  sctx.fillStyle = "#8fe8c8";
  sctx.fillText(`#${sec.index} ${sec.name}`, x + 8, y + tileH + 19);
  sctx.font = "13px Consolas, monospace";
  sctx.fillStyle = "#9a9aa4";
  sctx.fillText(`${timeLabel(t)}  ${p.boards.map((b) => b.id).join("+") || "-"}`, x + 8, y + tileH + 36);
  sctx.fillStyle = "#c8f0e8";
  sctx.fillText(`elements ${p.live.length}`, x + tileW - 96, y + tileH + 19);
  sctx.fillStyle = "#6b6b73";
  sctx.fillText(`f${p.frame}`, x + tileW - 96, y + tileH + 36);
});

mkdirSync(resolve(ROOT, "out"), { recursive: true });
const outPath = resolve(ROOT, getStr("out", "out/overview.png"));
writeFileSync(outPath, sheet.toBuffer("image/png"));
console.log(`\n总览页 → ${outPath}   ${sheetW}x${sheetH}   ${COLS} 列  ${list.length} 段`);

void sectionAt;
