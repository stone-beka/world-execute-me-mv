/**
 * tools/query.js — 命令行「探针」：查某一刻的元素 / 运动矢量 / 图层，不用出图。
 *
 * 为什么有它（用户 2026-09-29 的要求）：
 * 「别每次都只能靠识图」—— 想看某个时刻某元素在哪、下一时刻往哪走，
 * 应该敲一条命令就拿到数字，而不是渲一张图再用眼睛比对。
 *
 * 用法（<t> 支持 `14.5` 秒 或 `0:14.5`）：
 *   node tools/query.js at 14.5                    元素清单 + 运动矢量
 *   node tools/query.js at 14.5 --dt 200           用 200ms 间隔估速度
 *   node tools/query.js at 14.5 --moving           只看在动的
 *   node tools/query.js at 14.5 --near 865,528 --r 500   只看某点附近的
 *   node tools/query.js at 14.5 --json             机器可读
 *   node tools/query.js hit 865 300 --t 14.5       这个像素上是谁
 *   node tools/query.js board 14.5                 这一帧的画板 + env
 *   node tools/query.js board                      全片画板区间一览
 *   node tools/query.js track chessPiece --from 12.5 --to 14.5 --step 200
 *   node tools/query.js frame 14.5 [--boxes] [--out path.png]   真出一张图（少数时候才需要）
 *
 * 输出一律 ASCII（Windows 控制台按 GBK 解码 UTF-8 会糊，表格看不清）。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { probeAt, probeFrame, attachVelocity, hitTest, renderPNG, initProbe, dirArrow, timeLabel } from "./lib/probe.js";
import { ts } from "../src/core/render.js";
import { boards, resolveRange } from "../src/core/registry.js";
import { ROOT } from "../src/core/timeline.js";

const DIRS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
const dirName = (deg) => (deg == null ? "-" : DIRS[Math.round(deg / 45) % 8]);

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const getNum = (n, d) => {
  const v = getStr(n, d);
  return v === undefined ? d : Number(v);
};

/** `14.5` / `0:14.5` / `1:02` → 秒 */
function parseTime(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    return parts.reduce((acc, v) => acc * 60 + v, 0);
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const pad = (v, n) => String(v ?? "-").padEnd(n);
const padL = (v, n) => String(v ?? "-").padStart(n);

function fmtPos(e) {
  return e.x == null ? "-" : `${e.x},${e.y}`;
}
function fmtSize(e) {
  if (e.w == null && e.h == null) return "-";
  if (e.w == null) return `h${e.h}`;
  if (e.h == null) return `w${e.w}`;
  return `${e.w}x${e.h}`;
}

function printBoardLine(p) {
  const sec = p.boards.map((b) => `${b.id}(env ${b.env.toFixed(2)}, z${b.z})`).join("  ");
  const s = p.section ? `${p.section.name}[${p.section.index}]` : "-";
  console.log(`t=${timeLabel(p.sec)}  frame=${p.frame}  section=${s}  boards=${sec || "(none)"}`);
}

function printTable(list) {
  console.log(pad("ID", 16) + pad("DEVICE", 13) + pad("POS", 13) + pad("SIZE", 10) + padL("SPEED", 8) + "  " + pad("DIR", 4) + "TEXT");
  for (const e of list) {
    const sp = e.speed == null ? "-" : e.speed.toFixed(1);
    console.log(
      pad(e.id, 16) +
        pad(e.device, 13) +
        pad(fmtPos(e), 13) +
        pad(fmtSize(e), 10) +
        padL(sp, 8) + "  " +
        pad(dirName(e.dirDeg), 4) +
        (e.text ?? ""),
    );
  }
}

// ---------------------------------------------------------------- 子命令

const cmd = argv[0];

if (cmd === "board" && argv[1] === undefined && !has("t")) {
  // 全片画板区间一览（不需要 initEngine 之外的东西，但 loadBoards 要有）
  await initProbe();
  console.log(pad("FILE", 15) + pad("ID", 12) + padL("START", 10) + padL("END", 10) + padL("DUR", 9) + "  FADE(in/out)");
  for (const b of boards) {
    const r = resolveRange(b.meta);
    const f = b.meta.fade ?? {};
    console.log(
      pad(b.file.replace(/\.js$/, ""), 15) +
        pad(b.meta.id, 12) +
        padL((r.startMs / 1000).toFixed(2), 10) +
        padL((r.endMs / 1000).toFixed(2), 10) +
        padL(((r.endMs - r.startMs) / 1000).toFixed(2), 9) + "  " +
        `${f.fadeInMs ?? 0}/${f.fadeOutMs ?? 0}`,
    );
  }
} else if (cmd === "board") {
  await initProbe();
  const sec = parseTime(argv[1]) ?? parseTime(getStr("t", "0"));
  const p = probeAt(sec);
  if (has("json")) console.log(JSON.stringify({ sec: p.sec, frame: p.frame, boards: p.boards, section: p.section }, null, 2));
  else {
    printBoardLine(p);
    for (const b of p.boards) {
      console.log(`  ${pad(b.id, 12)} ${b.file.padEnd(15)} ${(b.startMs / 1000).toFixed(2)}..${(b.endMs / 1000).toFixed(2)}s  env=${b.env.toFixed(3)}`);
    }
  }
} else if (cmd === "at") {
  await initProbe();
  const sec = parseTime(argv[1]);
  if (sec == null) { console.error("usage: query.js at <sec> [--dt 100] [--moving] [--near x,y --r 300] [--json]"); process.exit(2); }
  const dt = getNum("dt", 100);
  const p = probeAt(sec);
  const q = probeAt(sec + dt / 1000);
  attachVelocity(p.live, q.live, dt);

  let list = p.live;
  if (has("moving")) list = list.filter((e) => e.speed != null && e.speed > 0.5);
  const near = getStr("near", null);
  if (near) {
    const [nx, ny] = near.split(",").map(Number);
    const r = getNum("r", 400);
    list = list.filter((e) => e.x != null && Math.hypot(e.x - nx, e.y - ny) <= r);
  }

  if (has("json")) {
    console.log(JSON.stringify({ ...p, dtMs: dt, live: list }, null, 2));
  } else {
    printBoardLine(p);
    console.log(`dt=${dt}ms  elements=${list.length}${has("moving") ? " (moving only)" : ""}`);
    printTable(list);
  }
} else if (cmd === "hit") {
  await initProbe();
  const x = Number(argv[1]);
  const y = Number(argv[2]);
  const sec = parseTime(getStr("t", "0")) ?? parseTime(argv[3]) ?? 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) { console.error("usage: query.js hit <x> <y> [--t sec]"); process.exit(2); }
  const p = probeAt(sec);
  const hits = hitTest(p.live, x, y);
  if (has("json")) console.log(JSON.stringify({ sec: p.sec, x, y, hits }, null, 2));
  else {
    console.log(`${timeLabel(p.sec)}  (${x},${y})  hits=${hits.length}`);
    for (const e of hits) console.log(`  ${pad(e.id, 16)} ${pad(e.device, 13)} ${pad(fmtPos(e), 13)} ${pad(fmtSize(e), 10)} ${e.text ?? ""}`);
  }
} else if (cmd === "track") {
  await initProbe();
  const q = argv[1];
  const from = parseTime(getStr("from", "0")) ?? 0;
  const to = parseTime(getStr("to", String(from + 5))) ?? from + 5;
  const step = getNum("step", 200);
  if (!q) { console.error("usage: query.js track <device|text> --from <sec> --to <sec> [--step 200]"); process.exit(2); }
  const rows = [];
  for (let t = from; t <= to + 1e-9; t += step / 1000) {
    const p = probeAt(t);
    const next = probeAt(t + step / 1000);
    const hit = p.live.filter((e) => e.device === q || (e.text ?? "").toLowerCase().includes(q.toLowerCase()));
    attachVelocity(hit, next.live, step);
    for (const e of hit) rows.push({ t, ...e });
  }
  if (has("json")) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(`track "${q}"  ${from}s..${to}s  step ${step}ms  rows=${rows.length}`);
    console.log(pad("TIME", 8) + pad("ID", 16) + pad("POS", 13) + padL("DX", 8) + padL("DY", 8) + padL("SPEED", 8) + "  DIR  TEXT");
    for (const r of rows) {
      console.log(
        pad(r.t.toFixed(2), 8) +
          pad(r.id, 16) +
          pad(fmtPos(r), 13) +
          padL(r.dx == null ? "-" : r.dx.toFixed(1), 8) +
          padL(r.dy == null ? "-" : r.dy.toFixed(1), 8) +
          padL(r.speed == null ? "-" : r.speed.toFixed(1), 8) + "  " +
          pad(dirName(r.dirDeg), 4) + (r.text ?? ""),
      );
    }
  }
} else if (cmd === "frame") {
  await initProbe();
  const sec = parseTime(argv[1]);
  if (sec == null) { console.error("usage: query.js frame <sec> [--boxes] [--out path.png]"); process.exit(2); }
  const dir = resolve(ROOT, "out", "probe");
  mkdirSync(dir, { recursive: true });
  const out = getStr("out", resolve(dir, `q-${String(sec).replace(".", "_")}${has("boxes") ? "-boxed" : ""}.png`));
  const { png, probe } = renderPNG(sec, { floor: !has("no-floor") });
  writeFileSync(out, png);
  console.log(`${out}`);
  printBoardLine(probe);
  for (const e of probe.live) console.log(`  ${pad(e.id, 16)} ${pad(e.device, 13)} ${pad(fmtPos(e), 13)} ${pad(fmtSize(e), 10)} ${e.text ?? ""}`);
} else {
  console.log(`tools/query.js — 命令行探针（查元素/运动矢量/图层，不用出图）

  at <sec> [--dt 100] [--moving] [--near x,y --r 400] [--json]
  hit <x> <y> [--t sec]
  board [sec] [--json]          (不给 sec = 全片区间一览)
  track <device|text> --from <sec> --to <sec> [--step 200] [--json]
  frame <sec> [--boxes] [--out path.png]

  ts.fps=${ts.fps} totalFrames=${ts.totalFrames} duration=${(ts.durationMs / 1000).toFixed(1)}s`);
  process.exit(1);
}

void dirArrow;
