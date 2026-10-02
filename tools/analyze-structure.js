/**
 * tools/analyze-structure.js — 段落结构分析（候选，不是结论）
 *
 * 要回答的问题：这首歌哪里是主歌、哪里是副歌、哪里是桥段？
 * 直接问音频是问不出来的（"副歌"是人的叫法）。所以这里做两件事：
 *
 *   ① 机器找人耳能听出来的"换段"点：按拍统计响度/低频占比/高频占比/onset 密度，
 *      用前后窗口的差异做 novelty（换段强度），挑峰 → 候选边界。
 *   ② 把听起来"长得像"的段落聚成一组（A/B/C…），并标出哪一组最响 ——
 *      最响又反复出现的那组，大概率就是副歌。
 *
 * 结论**必须人耳复核**：机器分不出"主歌/副歌"，它只给候选边界和分组。
 * 确认后把 assets/sections.json 里的 name 改成你真认的名字（verse1/chorus1/…），
 * 画板就能用 s.section.name === "chorus1" 这种写法。
 *
 * 用法：
 *   npm run analyze:structure
 *   node tools/analyze-structure.js --bars          # 只打逐小节响度剖面
 *   node tools/analyze-structure.js --min-bars 8 --win-bars 2
 *
 * 产出 assets/sections.json + assets/sections.js
 */

import { writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { ROOT, config, MS_PER_BEAT, beatsPerBar, beatOffsetMs, durationMs, msToBar, barPhaseBeats } from "../src/core/timeline.js";
import { readWav } from "./lib/wav.js";

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

const HOP_MS = 20;
const WIN_MS = 60;
const WIN_BARS = getArg("win-bars", 2); // 前后各看几个小节
const MIN_BARS = getArg("min-bars", 8); // 两段之间至少隔几小节
const K_MAD = getArg("k", 1.5); // novelty 阈值的保守度
const ONLY_BARS = has("bars");
const WRITE = !has("no-write");

// ---------------------------------------------------------------- 找 WAV

function findWav() {
  const explicit = getStr("file", null);
  if (explicit) {
    const p = resolve(ROOT, explicit);
    if (!existsSync(p)) {
      console.error(`❌ 找不到 ${p}`);
      process.exit(1);
    }
    return p;
  }
  const dir = resolve(ROOT, "assets", "audio");
  if (existsSync(dir)) {
    const hit = readdirSync(dir).find((f) => /\.wav$/i.test(f) && !f.startsWith("_"));
    if (hit) return resolve(dir, hit);
  }
  return null;
}

const wavPath = findWav();
if (!wavPath) {
  console.error("❌ assets/audio/ 里没有 WAV。先抽音频，或 --file 指定。");
  process.exit(1);
}

console.log(`▶ 结构分析：${basename(wavPath)}`);
console.log(
  `   网格：${config.bpm} BPM，第 1 拍 ${beatOffsetMs.toFixed(1)}ms，` +
    `一小节 ${beatsPerBar} 拍   前/后窗口 ${WIN_BARS} 小节，最短段落 ${MIN_BARS} 小节`,
);

const { samples, sampleRate, durationMs: wavDur } = readWav(wavPath);

// ---------------------------------------------------------------- 包络

const hop = Math.round((HOP_MS / 1000) * sampleRate);
const win = Math.round((WIN_MS / 1000) * sampleRate);

/** 滑动平均当粗略低通 */
function movingAverage(sig, n) {
  const out = new Float32Array(sig.length);
  let acc = 0;
  for (let i = 0; i < sig.length; i++) {
    acc += sig[i];
    if (i >= n) acc -= sig[i - n];
    out[i] = acc / Math.min(i + 1, n);
  }
  return out;
}

function envelopeOf(sig, hopS, winS) {
  const n = Math.max(0, Math.floor((sig.length - winS) / hopS));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * hopS;
    let sum = 0;
    for (let j = 0; j < winS; j++) sum += sig[off + j] * sig[off + j];
    out[i] = Math.sqrt(sum / winS);
  }
  return out;
}

const rms = envelopeOf(samples, hop, win);
const lowSig = movingAverage(samples, Math.round(sampleRate / 250)); // ≈250Hz 以下
const low = envelopeOf(lowSig, hop, win);
const high = envelopeOf(
  Float32Array.from(samples, (v, i) => v - lowSig[i]),
  hop,
  win,
);
const frames = rms.length;
const msOfFrame = (i) => (i * hop * 1000) / sampleRate;

// onset 强度（对数能量半波整流差分），用来量"这一拍有多密"
const onset = new Float64Array(frames);
for (let i = 1; i < frames; i++) {
  onset[i] = Math.max(0, Math.log(rms[i] + 1e-9) - Math.log(rms[i - 1] + 1e-9));
}

// ---------------------------------------------------------------- 按拍聚合

const msPerBeat = MS_PER_BEAT;
const beatCount = Math.max(1, Math.floor(((durationMs - beatOffsetMs) / msPerBeat))) - 1;
const feat = []; // 每拍一个特征向量

for (let b = 0; b < beatCount; b++) {
  const t0 = beatOffsetMs + b * msPerBeat;
  const t1 = t0 + msPerBeat;
  const i0 = Math.max(0, Math.floor((t0 / 1000) * sampleRate / hop));
  const i1 = Math.min(frames, Math.ceil((t1 / 1000) * sampleRate / hop));
  let sumRms = 0;
  let sumLow = 0;
  let sumHigh = 0;
  let sumOn = 0;
  let onCount = 0;
  let peakOn = 0;
  const n = Math.max(1, i1 - i0);
  for (let i = i0; i < i1; i++) {
    sumRms += rms[i];
    sumLow += low[i];
    sumHigh += high[i];
    sumOn += onset[i];
    if (onset[i] > peakOn) peakOn = onset[i];
  }
  const meanRms = sumRms / n;
  const meanLow = sumLow / n;
  const meanHigh = sumHigh / n;
  const meanOn = sumOn / n;
  // 一个"击打"算一次：超过该拍平均 onset 强度的帧
  for (let i = i0; i < i1; i++) if (onset[i] > meanOn * 1.5 && onset[i] > 0.02) onCount++;
  feat.push({
    b,
    ms: t0,
    db: 20 * Math.log10(Math.max(meanRms, 1e-9)),
    lowRatio: meanLow / Math.max(meanRms, 1e-9),
    highRatio: meanHigh / Math.max(meanRms, 1e-9),
    onsetPerBeat: onCount,
    flux: meanOn,
  });
}

// ---------------------------------------------------------------- 逐小节剖面

const perBar = [];
// 从「小节头」那一拍开始分组 —— 这样每组的第 1 拍才是真正的小节第 1 拍
for (let i = barPhaseBeats; i < feat.length; i += beatsPerBar) {
  const chunk = feat.slice(i, i + beatsPerBar);
  if (!chunk.length) break;
  const db = chunk.reduce((s, f) => s + f.db, 0) / chunk.length;
  perBar.push({ bar: (i - barPhaseBeats) / beatsPerBar, ms: chunk[0].ms, db });
}

if (ONLY_BARS) {
  const sorted = perBar.map((p) => p.db).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const lo = p95 - 36;
  const CH = " ▁▂▃▄▅▆▇█";
  console.log(`\n逐小节响度（竖轴 ${p95.toFixed(0)}dB 往下 36dB）\n`);
  for (const p of perBar) {
    const rel = Math.max(0, Math.min(1, (p.db - lo) / 36));
    const bar = CH[Math.round(rel * (CH.length - 1))];
    console.log(`   小节 ${String(p.bar).padStart(3)}  ${(p.ms / 1000).toFixed(2).padStart(7)}s  ${bar.repeat(4).padEnd(4)}  ${p.db.toFixed(1).padStart(6)}dB`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- novelty

const names = ["db", "lowRatio", "highRatio", "onsetPerBeat", "flux"];
const stats = {};
for (const k of names) {
  const arr = feat.map((f) => f[k]);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const varr = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length;
  stats[k] = { mean, sd: Math.sqrt(varr) || 1 };
}
const z = (k, v) => (v - stats[k].mean) / stats[k].sd;

const W = Math.max(2, WIN_BARS * beatsPerBar);
const novelty = new Float64Array(feat.length);
for (let i = W; i < feat.length - W; i++) {
  let d = 0;
  for (const k of names) {
    const a = feat.slice(i - W, i).reduce((s, f) => s + z(k, f[k]), 0) / W;
    const b = feat.slice(i, i + W).reduce((s, f) => s + z(k, f[k]), 0) / W;
    d += Math.abs(a - b);
  }
  novelty[i] = d / names.length;
}

// ---------------------------------------------------------------- 挑边界

const vals = [...novelty].filter((v) => v > 0);
const med = median(vals);
const mad = median(vals.map((v) => Math.abs(v - med)));
const thr = med + K_MAD * mad;

const minSep = Math.max(1, MIN_BARS * beatsPerBar);
const boundaries = [0];
for (let i = W; i < feat.length - W; i++) {
  if (novelty[i] < thr || novelty[i] <= 1e-9) continue;
  if (novelty[i] < novelty[i - 1] || novelty[i] < novelty[i + 1]) continue;
  if (i - boundaries[boundaries.length - 1] < minSep) continue;
  boundaries.push(i);
}
boundaries.push(feat.length);

// ---------------------------------------------------------------- 段落 + 聚类

const raw = [];
for (let s = 0; s < boundaries.length - 1; s++) {
  const a = boundaries[s];
  const b = boundaries[s + 1];
  const chunk = feat.slice(a, b);
  if (!chunk.length) continue;
  const mean = (k) => chunk.reduce((s2, f) => s2 + f[k], 0) / chunk.length;
  raw.push({
    startMs: Math.round(chunk[0].ms),
    endMs: Math.round(feat[Math.min(b, feat.length - 1)].ms),
    beats: b - a,
    db: mean("db"),
    lowRatio: mean("lowRatio"),
    highRatio: mean("highRatio"),
    onsetPerBeat: mean("onsetPerBeat"),
    novelty: novelty[a] || 0,
  });
}

// 归一化后贪心聚类：听起来"长得像"的段落分进同一组
const keys = ["db", "lowRatio", "highRatio", "onsetPerBeat"];
const cstats = {};
for (const k of keys) {
  const arr = raw.map((r) => r[k]);
  const mean = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, arr.length)) || 1;
  cstats[k] = { mean, sd };
}
const vecOf = (r) => keys.map((k) => (r[k] - cstats[k].mean) / cstats[k].sd);
const clusters = [];
for (const r of raw) {
  const v = vecOf(r);
  let best = -1;
  let bestD = Infinity;
  clusters.forEach((c, ci) => {
    let d = 0;
    for (let i = 0; i < v.length; i++) d += (v[i] - c.centroid[i]) ** 2;
    d = Math.sqrt(d);
    if (d < bestD) {
      bestD = d;
      best = ci;
    }
  });
  if (best >= 0 && bestD < 1.15) {
    clusters[best].members.push(raw.indexOf(r));
    r.cluster = clusters[best].label;
    // 更新质心
    const n = clusters[best].members.length;
    clusters[best].centroid = clusters[best].centroid.map((c, i) => c + (v[i] - c) / n);
  } else {
    const label = String.fromCharCode(65 + clusters.length);
    r.cluster = label;
    clusters.push({ label, centroid: v, members: [raw.indexOf(r)] });
  }
}

const sections = raw.map((r, i) => {
  const beat = (r.startMs - beatOffsetMs) / msPerBeat;
  return {
    index: i + 1,
    name: `s${i + 1}`, // ← 你确认后改成 verse1 / chorus1 / bridge …
    cluster: r.cluster,
    startMs: r.startMs,
    endMs: r.endMs,
    startBeat: Number(beat.toFixed(2)),
    // 用 timeline 的小节换算（已含 barPhase 对齐）
    startBar: Number(msToBar(r.startMs).toFixed(2)),
    durationMs: r.endMs - r.startMs,
    bars: Number((r.beats / beatsPerBar).toFixed(1)),
    stats: {
      db: Number(r.db.toFixed(2)),
      lowRatio: Number(r.lowRatio.toFixed(3)),
      highRatio: Number(r.highRatio.toFixed(3)),
      onsetPerBeat: Number(r.onsetPerBeat.toFixed(2)),
    },
  };
});

// ---------------------------------------------------------------- 报告

const fmt = (ms) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};
const dbs = sections.map((s) => s.stats.db);
const loudest = Math.max(...dbs);

console.log(`\n① 候选段落边界  （novelty 阈值 ${thr.toFixed(3)}，最短 ${MIN_BARS} 小节）`);
console.log(
  `   ${"#".padStart(2)}  ${"起".padStart(8)}  ${"止".padStart(8)}  ${"小节".padStart(6)}  ` +
    `${"响度".padStart(7)}  响度分布`,
);
for (const s of sections) {
  const rel = Math.max(0, Math.min(1, (s.stats.db - (loudest - 30)) / 30));
  const bar = "█".repeat(Math.max(1, Math.round(rel * 24)));
  console.log(
    `   ${String(s.index).padStart(2)}  ${fmt(s.startMs).padStart(8)}  ${fmt(s.endMs).padStart(8)}  ` +
      `第${String(Math.round(s.startBar)).padStart(3)}小节  ${s.stats.db.toFixed(1).padStart(6)}dB  ${bar}  [${s.cluster}]`,
  );
}

console.log(`\n② 分组（听起来"长得像"的归一组；最响又反复出现的那组大概率是副歌）`);
for (const c of clusters) {
  const idx = c.members.map((m) => sections[m].index).join(", ");
  const avgDb = c.members.reduce((s, m) => s + sections[m].stats.db, 0) / c.members.length;
  const avgOn = c.members.reduce((s, m) => s + sections[m].stats.onsetPerBeat, 0) / c.members.length;
  console.log(
    `   ${c.label}:  段落 ${idx}   （${c.members.length} 段，平均 ${avgDb.toFixed(1)}dB，` +
      `每拍击打 ${avgOn.toFixed(2)}）`,
  );
}
const loudCluster = [...clusters].sort(
  (a, b) =>
    b.members.reduce((s, m) => s + sections[m].stats.db, 0) / b.members.length -
    a.members.reduce((s, m) => s + sections[m].stats.db, 0) / a.members.length,
)[0];
console.log(
  `   → 最响的一组是 ${loudCluster.label}，出现 ${loudCluster.members.length} 次` +
    `${loudCluster.members.length >= 2 ? "（反复出现 → 大概率是副歌）" : "（只出现一次 → 更像桥段/尾奏）"}`,
);

console.log(`\n③ 逐小节响度剖面（对上耳朵）`);
const CH = " ▁▂▃▄▅▆▇█";
const lo = loudest - 32;
const boundBars = new Set(sections.map((s) => Math.round(s.startBar)));
let line = "";
for (const p of perBar) {
  const rel = Math.max(0, Math.min(1, (p.db - lo) / 32));
  line += CH[Math.round(rel * (CH.length - 1))];
}
console.log(`   ${line}`);
console.log(`   ↑ 每格一小节，共 ${perBar.length} 小节；段落起点在第 ${[...boundBars].join(", ")} 小节`);

// ---------------------------------------------------------------- 落盘

const meta = {
  source: basename(wavPath),
  bpm: config.bpm,
  beatOffsetMs: Number(beatOffsetMs.toFixed(2)),
  beatsPerBar,
  durationMs: Math.round(durationMs),
  params: { hopMs: HOP_MS, winMs: WIN_MS, winBars: WIN_BARS, minBars: MIN_BARS, k: K_MAD, noveltyThreshold: Number(thr.toFixed(4)) },
  _note:
    "机器给的候选。name 现在是 s1、s2…，人耳确认后改成 verse1/chorus1/bridge/…，画板就能按名字用。",
  generatedAt: "STATIC",
  sections: sections.map((s) => ({
    index: s.index,
    name: s.name,
    cluster: s.cluster,
    startMs: s.startMs,
    endMs: s.endMs,
    startBeat: s.startBeat,
    startBar: s.startBar,
    bars: s.bars,
    stats: s.stats,
  })),
};

mkdirSync(resolve(ROOT, "assets"), { recursive: true });
if (!WRITE) {
  console.log(`\n（--no-write：只看候选，未落盘）`);
} else {
  writeFileSync(resolve(ROOT, "assets", "sections.json"), JSON.stringify(meta, null, 2));
  writeFileSync(
    resolve(ROOT, "assets", "sections.js"),
    `// 由 tools/analyze-structure.js 生成（候选，需人耳确认 name）。
// 格式：[name, startMs, endMs]
export const meta = ${JSON.stringify(meta, null, 2)};

export default ${JSON.stringify(meta.sections.map((s) => [s.name, s.startMs, s.endMs]))};
`,
  );

  console.log(`\n✅ assets/sections.json / assets/sections.js 已写出`);
  console.log(
    `⚠️  这些是候选，不是结论：机器分不出"主歌/副歌"。` +
      `\n   请听一遍（或看上面的剖面），把 name 改成你真认的名字，再告诉我。`,
  );
}

// ---------------------------------------------------------------- helpers

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
