/**
 * tools/align-beat.js — 拟合 / 复核全曲拍网格
 *
 * probe-audio 给出「一个 BPM + 首拍偏移」，beat-check 让人耳定死相位。
 * 这个工具拿音频 onset 复核这套网格在全曲是否站得住：
 *   · 全曲残差统计（命中率 / 中位数 / p90）
 *   · 分段漂移（开头对得上、最后副歌错半拍的病根就藏在这）
 *   · 按漂移反推修正后的 BPM
 * 产出 assets/beat-grid.json（显式网格 + 校验结论），供人看 / 供后续工具 grep。
 *
 * 默认【不】改 config/project.json —— 和 probe-audio 一个规矩：改动要人点头。
 * 加 --apply 才写入；--bar-phase N 可顺带定 4 拍里哪拍是「1」。
 *
 * 用法：
 *   npm run align:beat
 *   node tools/align-beat.js --windows 6 --tol 25
 *   node tools/align-beat.js --apply                 # 把复核后的 bpm/beatOffsetMs 写回 config
 *   node tools/align-beat.js --bar-phase 2 --apply   # 同时定小节开头
 *
 * 依赖 assets/onsets.json：先跑 npm run detect:onsets。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, config } from "../src/core/timeline.js";
import { residualStats, windowPhases } from "./lib/grid.js";

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

const WINDOWS = getArg("windows", 4);
const TOL = getArg("tol", 25);
const APPLY = has("apply");
const BAR_PHASE = has("bar-phase") ? getArg("bar-phase", null) : null;

// ---------------------------------------------------------------- 读 onsets

const onsetsPath = resolve(ROOT, getStr("onsets", "assets/onsets.json"));
if (!existsSync(onsetsPath)) {
  console.error(
    [
      "❌ 没找到 assets/onsets.json。",
      "",
      "   这个工具吃的是音频 onset，先跑：",
      "     npm run detect:onsets",
      "   （有 MIDI 的话，parse-midi 产出的 assets/onsets.json 也能喂进来）",
    ].join("\n"),
  );
  process.exit(1);
}

const data = JSON.parse(readFileSync(onsetsPath, "utf8"));
const onsets = data.onsets ?? data;
if (!Array.isArray(onsets) || onsets.length === 0) {
  console.error("❌ assets/onsets.json 里没有 onset 数组");
  process.exit(1);
}

// ---------------------------------------------------------------- 网格

const bpm = config.bpm;
const periodMs = 60000 / bpm;
const beatOffsetMs = config.beatOffsetMs ?? 0;

const stats = residualStats(onsets, beatOffsetMs, periodMs, TOL);

const musicStart = data.gridCheck?.drift?.[0]?.startMs ?? 0;
const musicEnd = config.durationMs ?? data.durationMs ?? 212000;
const drift = windowPhases(onsets, beatOffsetMs, periodMs, musicStart, musicEnd, WINDOWS);

console.log(`▶ 复核网格：BPM ${bpm}   拍周期 ${periodMs.toFixed(3)}ms   offset ${beatOffsetMs.toFixed(1)}ms`);
console.log(`   onset ${onsets.length} 个   分 ${WINDOWS} 窗   容差 ±${TOL}ms`);

console.log("");
console.log("① 全曲残差（参考）");
console.log(`   中位数 ${stats.medianAbs}ms   p90 ${stats.p90Abs}ms   最大 ${stats.maxAbs}ms   均值 ${stats.meanAbs}ms`);
console.log(`   落在 ±${TOL}ms   ${stats.withinTol}/${stats.count}  (${stats.pctWithinTol}%)   ← 密集曲目天然偏低，别当判据`);

console.log("");
console.log("② 分段漂移");
for (const w of drift) {
  console.log(
    `   ${(w.startMs / 1000).toFixed(0).padStart(4)}s~${(w.endMs / 1000).toFixed(0).padStart(4)}s  ` +
      `n=${String(w.count).padStart(4)}  相位 ${String(w.phaseMs.toFixed(1)).padStart(6)}ms  ` +
      `集中度 ${w.concentration.toFixed(3)}`,
  );
}

// 用「可信窗口」的首尾相位差反推修正周期（只在集中度够时用）
const wrapHalf = (x) => ((x % periodMs) + 1.5 * periodMs) % periodMs - periodMs / 2;
const usable = drift.filter((w) => w.count >= 8 && w.concentration >= 0.2);
let correctedBpm = bpm;
let driftMs = 0;
let spanT = 0;
if (usable.length >= 2) {
  const first = usable[0];
  const last = usable[usable.length - 1];
  driftMs = wrapHalf(last.phaseMs - first.phaseMs);
  const center = (w) => (w.startMs + w.endMs) / 2;
  spanT = center(last) - center(first);
  if (spanT > 0) correctedBpm = 60000 / (periodMs + (driftMs * periodMs) / spanT);
}

console.log("");
console.log("③ 结论");
const spread = Math.max(...drift.map((w) => w.phaseMs)) - Math.min(...drift.map((w) => w.phaseMs));
if (usable.length < 2) {
  console.log("   ⚠️  可用窗口不足（onset 太稀或太糊），无法判断漂移；信任 config 现值");
} else if (Math.abs(driftMs) < 20 && Math.abs(correctedBpm - bpm) < 0.02) {
  console.log(`   ✅ 首尾相位差 ${driftMs.toFixed(1)}ms，全局 BPM ${bpm} 站得住，不用改`);
} else {
  console.log(`   ⚠️  首尾相位差 ${driftMs.toFixed(1)}ms（跨 ${(spanT / 1000).toFixed(0)}s）`);
  console.log(`      按漂移反推：BPM ${correctedBpm.toFixed(3)}（现值 ${bpm}）`);
  console.log("      这就是「开头对、后段错半拍」的病根；可用 --apply 写回");
}

// ---------------------------------------------------------------- 落盘 beat-grid

const beatCount = Math.ceil((musicEnd - beatOffsetMs) / periodMs);
const grid = {
  bpm,
  periodMs: Number(periodMs.toFixed(6)),
  beatOffsetMs: Number(beatOffsetMs.toFixed(2)),
  beatsPerBar: config.beatsPerBar ?? 4,
  barPhase: BAR_PHASE ?? config.barPhase ?? null,
  firstBeatMs: Number(beatOffsetMs.toFixed(2)),
  lastBeatMs: Number((beatOffsetMs + (beatCount - 1) * periodMs).toFixed(2)),
  beatCount,
  source: "assets/onsets.json",
  validation: { residual: stats, drift },
  corrected: { bpm: Number(correctedBpm.toFixed(4)), driftMs: Number(driftMs.toFixed(2)), spanMs: Math.round(spanT) },
  generatedAt: "STATIC", // 不写时间戳：产物可复现
};

writeFileSync(resolve(ROOT, "assets", "beat-grid.json"), JSON.stringify(grid, null, 2));
console.log("");
console.log(`✅ assets/beat-grid.json 已写出   全曲 ${beatCount} 拍   ${(beatCount / (config.beatsPerBar ?? 4)).toFixed(0)} 小节`);

// ---------------------------------------------------------------- --apply

if (!APPLY) {
  console.log("");
  console.log("（未改 config。要写回就加 --apply）");
  process.exit(0);
}

const cfgPath = resolve(ROOT, "config", "project.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const changes = [];

const nextBpm = Math.abs(correctedBpm - bpm) >= 0.02 ? Number(correctedBpm.toFixed(3)) : bpm;
if (nextBpm !== cfg.bpm) changes.push(`bpm: ${cfg.bpm} → ${nextBpm}`);
cfg.bpm = nextBpm;

const nextOffset = Math.round(beatOffsetMs);
if (nextOffset !== cfg.beatOffsetMs) changes.push(`beatOffsetMs: ${cfg.beatOffsetMs} → ${nextOffset}`);
cfg.beatOffsetMs = nextOffset;

if (BAR_PHASE !== null) {
  if (BAR_PHASE < 0 || BAR_PHASE >= (cfg.beatsPerBar ?? 4)) {
    console.error(`❌ --bar-phase 必须在 0..${(cfg.beatsPerBar ?? 4) - 1} 之间`);
    process.exit(1);
  }
  if (cfg.barPhase !== BAR_PHASE) changes.push(`barPhase: ${cfg.barPhase} → ${BAR_PHASE}`);
  cfg.barPhase = BAR_PHASE;
}

if (changes.length === 0) {
  console.log("");
  console.log("✅ config 已是最新，无需改动");
  process.exit(0);
}

writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log("");
console.log("✅ 已写回 config/project.json：");
for (const c of changes) console.log(`   ${c}`);
console.log("   ⚠️ 改完 BPM/offset 后，跑 npm run verify 确认全绿");
