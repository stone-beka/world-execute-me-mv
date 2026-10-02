/**
 * tools/align-lyrics.js — 歌词 → 词级时间戳（并且会给人给的时间戳做体检）
 *
 * 输入 assets/lyrics.txt，一行一句。两种写法：
 *
 *   A. 有 LRC 时间戳：
 *        [00:12.34] There was a sudden drop
 *      → 行时间当锚点，只推断词级细分。
 *
 *   B. 纯文本（没有时间）：
 *        There was a sudden drop
 *      → 用音频里 300~3400Hz 的能量段（人声大致就在这）找出「在唱」的区间，
 *        再按每句字数把句子铺进去。这是**机器估的候选**，一定要人耳复核。
 *
 *   C. 混着写：有时间戳的行当锚点，没时间的行在锚点之间插值。
 *
 * 两个关键设计：
 *
 *   ① **行尾不靠"下一行开始"硬撑**。LRC 只给开始时间，如果下一行在 18 秒后，
 *      按"下一行前一瞬"算会把整句词摊到 18 秒的器乐段上。这里改成：
 *      行尾 = min(下一行开始前, 该处"在唱"区间的结束, 按词数估的时长)。
 *
 *   ② **给网上抄来的时间戳做体检**。把所有行开始处之后 500ms 的人声带能量
 *      和在整首上滑动求最佳整体偏移，报出偏移量与对比度；逐行也报能量比，
 *      最差的几行点名。这样"时间戳可能不准"就变成一个有数字的结论。
 *
 * 用法：
 *   npm run align:lyrics
 *   node tools/align-lyrics.js --no-write          # 只看体检报告
 *   node tools/align-lyrics.js --offset-ms -120    # 手动整体平移
 *   node tools/align-lyrics.js --auto-offset       # 采用体检出的最佳偏移
 *
 * 产出 assets/lyrics.json（引擎读）+ assets/lyrics.js。生成物不写时间戳。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { ROOT, durationMs } from "../src/core/timeline.js";
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

const SNAP_MS = getArg("snap", 250);
const GAP_MS = getArg("gap", 40);
const WRITE = !has("no-write");
const DURATION_MS = durationMs;
const HOP_MS = 20;
const WIN_MS = 60;
const VOCAL_ATTACH_MS = 400; // 行开始后多久内找到"在唱"区间就算附着
const VOCAL_LOOK_MS = 500; // 体检窗口长度
const MAX_LINE_MS = 6000; // 行尾：与下一行间隔超过这个数就当成器乐段，改用估时

// ---------------------------------------------------------------- 读歌词

const lyricPath = resolve(ROOT, getStr("file", "assets/lyrics.txt"));
if (!existsSync(lyricPath)) {
  console.error(`❌ 找不到 ${basename(lyricPath)}`);
  console.error("   放一份 assets/lyrics.txt：一行一句歌词（可选 [mm:ss.xx] 行首时间戳）。");
  console.error("   格式示例见 assets/lyrics.example.txt。");
  process.exit(1);
}

const LRC = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/;

const rawLines = [];
for (const [i, l] of readFileSync(lyricPath, "utf8").split(/\r?\n/).entries()) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const m = t.match(LRC);
  if (m) rawLines.push({ n: i + 1, text: m[3].trim(), start: Number(m[1]) * 60000 + Number(m[2]) * 1000 });
  else rawLines.push({ n: i + 1, text: t, start: null });
}
if (!rawLines.length) {
  console.error("❌ 歌词文件里没有有效行");
  process.exit(1);
}

const anchoredCount = rawLines.filter((l) => l.start !== null).length;
const mode = anchoredCount === 0 ? "derived" : anchoredCount === rawLines.length ? "lrc" : "mixed";
console.log(`▶ 歌词对齐：${basename(lyricPath)}`);
console.log(`   ${rawLines.length} 行，带时间戳 ${anchoredCount} 行  →  模式 ${mode}`);

// ---------------------------------------------------------------- 音频

function findWav() {
  const explicit = getStr("wav", null);
  if (explicit) return resolve(ROOT, explicit);
  const dir = resolve(ROOT, "assets", "audio");
  if (existsSync(dir)) {
    const hit = readdirSync(dir).find((f) => /\.wav$/i.test(f) && !f.startsWith("_"));
    if (hit) return resolve(dir, hit);
  }
  return null;
}

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

function medianAbsDev(arr, median) {
  const dev = Float64Array.from(arr, (v) => Math.abs(v - median)).sort();
  return dev[Math.floor(dev.length / 2)];
}

let env = null; // 人声带能量包络（HOP_MS 一格）
let onsets = [];
let spans = [];

const wavPath = findWav();
if (wavPath) {
  console.log(`   音频：${basename(wavPath)}`);
  const { samples, sampleRate } = readWav(wavPath);
  const hop = Math.round((HOP_MS / 1000) * sampleRate);
  const win = Math.round((WIN_MS / 1000) * sampleRate);

  // 人声带 ≈ 300~3400Hz：两个滑动平均（低通）相减
  const lpHi = movingAverage(samples, Math.max(2, Math.round(sampleRate / 3400)));
  const lpLo = movingAverage(samples, Math.max(2, Math.round(sampleRate / 300)));
  const band = Float32Array.from(samples, (_, i) => lpHi[i] - lpLo[i]);
  env = envelopeOf(band, hop, win);
  const msOfFrame = (i) => (i * hop * 1000) / sampleRate;

  // 全频 onset（吸附点）
  const rms = envelopeOf(samples, hop, win);
  const flux = new Float64Array(env.length);
  for (let i = 1; i < flux.length; i++) flux[i] = Math.max(0, Math.log(rms[i] + 1e-9) - Math.log(rms[i - 1] + 1e-9));
  const fs = Float64Array.from(flux).sort();
  const fmed = fs[Math.floor(fs.length / 2)];
  const fthr = fmed + 2.0 * medianAbsDev(flux, fmed);
  let lastOn = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] < fthr || flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    const t = msOfFrame(i);
    if (t - lastOn < 60) continue;
    onsets.push({ ms: t, strength: flux[i] });
    lastOn = t;
  }

  // 「在唱」区间：阈值 + 最短时长 + 合并小间隙
  const es = Float64Array.from(env).sort();
  const emed = es[Math.floor(es.length / 2)];
  const ethr = emed + 0.8 * medianAbsDev(env, emed);
  const MIN_MS = 250;
  const MERGE_MS = 200;
  const raw = [];
  let seg = null;
  for (let i = 0; i < env.length; i++) {
    const t = msOfFrame(i);
    const loud = env[i] > ethr;
    if (loud && !seg) seg = { startMs: t, endMs: t };
    else if (loud && seg) seg.endMs = t;
    else if (!loud && seg) {
      if (seg.endMs - seg.startMs >= MIN_MS) raw.push(seg);
      seg = null;
    }
  }
  if (seg && seg.endMs - seg.startMs >= MIN_MS) raw.push(seg);
  for (const a of raw) {
    const last = spans[spans.length - 1];
    if (last && a.startMs - last.endMs <= MERGE_MS) last.endMs = a.endMs;
    else spans.push({ ...a });
  }
  console.log(
    `   人声带检出「在唱」区间 ${spans.length} 段，吸附用 onset ${onsets.length} 个`,
  );
  if (!spans.length) spans = [{ startMs: 0, endMs: DURATION_MS }];
} else {
  console.log("   ⚠️  没有 WAV：行时间只能照抄，词级细分是估的");
  spans = [{ startMs: 0, endMs: DURATION_MS }];
}

/** 人声带能量：ms0..ms1 的平均（越界夹紧） */
function bandMean(ms0, ms1) {
  if (!env) return 0;
  const i0 = Math.max(0, Math.round(ms0 / HOP_MS));
  const i1 = Math.min(env.length, Math.max(i0 + 1, Math.round(ms1 / HOP_MS)));
  let sum = 0;
  for (let i = i0; i < i1; i++) sum += env[i];
  return sum / (i1 - i0);
}

/** 逐词预算：一个词的演唱时长估计（毫秒），行尾估时用它 */
function estimateLineMs(words) {
  return words * 320 + 500;
}

// ---------------------------------------------------------------- 行开始时间

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** 把一串行按权重铺进可用区间合集；返回每行的 start */
function spreadStarts(lines, fromMs, toMs) {
  const weights = lines.map((l) => Math.max(1, l.text.replace(/\s/g, "").length));
  const total = weights.reduce((a, b) => a + b, 0);
  const avail = spans
    .filter((s) => s.endMs > fromMs && s.startMs < toMs)
    .map((s) => ({ startMs: Math.max(s.startMs, fromMs), endMs: Math.min(s.endMs, toMs) }))
    .filter((s) => s.endMs > s.startMs);
  const list = avail.length ? avail : [{ startMs: fromMs, endMs: toMs }];
  const totalMs = list.reduce((s, x) => s + (x.endMs - x.startMs), 0);
  const at = (frac) => {
    let target = frac * totalMs;
    for (const a of list) {
      const len = a.endMs - a.startMs;
      if (target <= len) return a.startMs + target;
      target -= len;
    }
    return list[list.length - 1].endMs;
  };
  let acc = 0;
  return lines.map((l, i) => {
    const t = at(acc / total);
    acc += weights[i];
    return t;
  });
}

let starts;
if (mode === "lrc") {
  starts = rawLines.map((l) => l.start);
} else if (mode === "derived") {
  starts = spreadStarts(rawLines, spans[0].startMs, spans[spans.length - 1].endMs);
} else {
  starts = rawLines.map((l) => l.start);
  const anchors = [];
  for (let i = 0; i < rawLines.length; i++) if (rawLines[i].start !== null) anchors.push(i);
  // 锚点之间/之外的空档：插值
  const ranges = [];
  if (anchors[0] > 0) ranges.push({ from: 0, to: anchors[0], lo: spans[0].startMs, hi: rawLines[anchors[0]].start - GAP_MS });
  for (let k = 0; k < anchors.length - 1; k++) {
    if (anchors[k + 1] - anchors[k] > 1) {
      ranges.push({
        from: anchors[k] + 1,
        to: anchors[k + 1],
        lo: rawLines[anchors[k]].start + 300,
        hi: rawLines[anchors[k + 1]].start - GAP_MS,
      });
    }
  }
  if (anchors[anchors.length - 1] < rawLines.length - 1) {
    ranges.push({
      from: anchors[anchors.length - 1] + 1,
      to: rawLines.length,
      lo: rawLines[anchors[anchors.length - 1]].start + 300,
      hi: spans[spans.length - 1].endMs,
    });
  }
  for (const r of ranges) {
    const sub = rawLines.slice(r.from, r.to);
    const s2 = spreadStarts(sub, r.lo, Math.max(r.lo + 100, r.hi));
    s2.forEach((t, i) => (starts[r.from + i] = t));
  }
}

// ---------------------------------------------------------------- 时间戳体检

let suggestedOffset = 0;
let contrast = 0;

if (env) {
  const gmed = (() => {
    const s = Float64Array.from(env).sort();
    return s[Math.floor(s.length / 2)];
  })();
  const scoreAt = (shift) => {
    let sum = 0;
    for (const t of starts) sum += bandMean(t + shift, t + shift + VOCAL_LOOK_MS);
    return sum / starts.length / gmed;
  };

  const curve = [];
  for (let sh = -2000; sh <= 2000; sh += 20) curve.push({ sh, v: scoreAt(sh) });
  const best = curve.reduce((a, b) => (b.v > a.v ? b : a), curve[0]);
  const vals = curve.map((c) => c.v).sort((a, b) => a - b);
  const mid = vals[Math.floor(vals.length / 2)];
  contrast = mid > 0 ? best.v / mid : 0;
  suggestedOffset = best.sh;

  const base = scoreAt(0);
  console.log(`\n① 时间戳体检（对「人声带能量」）`);
  console.log(`   当前偏移 0ms 时的平均人声能量比      ${base.toFixed(3)}`);
  console.log(`   整体最佳偏移 ${String(best.sh).padStart(5)}ms  能量比 ${best.v.toFixed(3)}  对比度 ${contrast.toFixed(3)}`);
  if (Math.abs(best.sh) < 60) {
    console.log(`   ✅ 最佳偏移接近 0 —— 你给的时间戳整体是对的`);
  } else if (contrast >= 1.04) {
    console.log(`   ⚠️  整体更像偏了 ${best.sh}ms（对比度 ${contrast.toFixed(2)}）：加 --auto-offset 或 --offset-ms ${best.sh} 采用`);
  } else {
    console.log(`   ➖ 偏移搜索的对比度太低（${contrast.toFixed(3)}），说明人声段太密、分辨不出整体偏移；不建议整体平移`);
  }

  // 逐行：能量比最低的点名（注意：安静段也会低，所以这只是"存疑"，不是"错"）
  const per = starts.map((t, i) => ({ i, t, r: bandMean(t, t + VOCAL_LOOK_MS) / gmed }));
  const sorted = [...per].sort((a, b) => a.r - b.r);
  const poor = sorted.filter((p) => p.r < 0.8).slice(0, 10);
  console.log(`   逐行能量比 < 0.8 的有 ${sorted.filter((p) => p.r < 0.8).length} 行（安静段也会低，只算存疑）${poor.length ? "，最差的几行：" : ""}`);
  for (const p of poor) {
    console.log(`      ${fmt(p.t)}  能量比 ${p.r.toFixed(2)}  ${rawLines[p.i].text}`);
  }
}

// 采用偏移
let offset = 0;
if (has("auto-offset")) offset = suggestedOffset;
if (argv.includes("--offset-ms")) offset = getArg("offset-ms", 0);
if (offset !== 0) {
  starts = starts.map((t) => t + offset);
  console.log(`\n   → 已整体平移 ${offset > 0 ? "+" : ""}${offset}ms`);
}

// ---------------------------------------------------------------- 行尾 + 词级细分

function fmt(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

const lines = rawLines.map((l, i) => {
  const start = starts[i];
  const words = l.text.split(/\s+/).filter(Boolean);
  const nextStart = starts[i + 1] ?? spans[spans.length - 1].endMs;
  const est = estimateLineMs(words.length);

  // 判据只有一条：下一句是不是"紧接着"的
  //   · 紧接着（≤ MAX_LINE_MS）→ 唱到下一句之前，画面区间首尾相接，**不留缝**
  //   · 隔着器乐段 → 按词数估一个演唱时长，画面提前收掉，留白是**有意的**
  const gapToNext = nextStart - start;
  let singEnd = gapToNext <= MAX_LINE_MS ? nextStart - GAP_MS : start + est;
  if (singEnd < start + 160) singEnd = start + 160;
  const end = gapToNext <= MAX_LINE_MS ? Math.max(singEnd, nextStart) : singEnd;

  // 词级：按音节在**唱歌区间**内分配，再吸附到最近 onset
  const weights = words.map(syllables);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const parts = words.map((w, k) => {
    const s0 = start + ((singEnd - start) * acc) / total;
    acc += weights[k];
    return { w, start: s0 };
  });
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    const lo = k === 0 ? start : parts[k - 1].start + 40;
    const hi = k === parts.length - 1 ? singEnd : parts[k + 1].start - 40;
    if (onsets.length) {
      let best = null;
      let bestD = Infinity;
      for (const o of onsets) {
        if (o.ms < start - SNAP_MS) continue;
        if (o.ms > singEnd + SNAP_MS) break;
        const d = Math.abs(o.ms - p.start);
        if (d < bestD) {
          bestD = d;
          best = o.ms;
        }
      }
      if (best !== null && bestD <= SNAP_MS) p.start = best;
    }
    p.start = Math.min(hi, Math.max(lo, p.start));
  }
  const win = parts.map((p, k) => ({
    w: p.w,
    start: Math.round(p.start),
    end: Math.round(k === parts.length - 1 ? singEnd : Math.max(p.start + 40, parts[k + 1].start - 20)),
    conf: mode === "lrc" ? "lrc" : "derived",
  }));
  return {
    text: l.text,
    start: Math.round(start),
    singEnd: Math.round(singEnd),
    end: Math.round(end),
    conf: mode === "lrc" ? "lrc" : "derived",
    words: win,
  };
});

console.log(`\n② 时长自检（这个能直接抓出坏时间戳）`);
const tooTight = [];
const tooClose = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const words = l.words.length;
  const dur = l.singEnd - l.start; // 用「在唱」的区间，不是占画面的区间
  if (dur < words * 120) tooTight.push({ i, dur, words });
  if (i + 1 < lines.length) {
    const gap = lines[i + 1].start - l.start;
    if (gap < 80) tooClose.push({ i, gap });
  }
}
if (!tooTight.length && !tooClose.length) {
  console.log("   ✅ 每句都塞得下自己的词，句与句之间也不重叠");
} else {
  if (tooTight.length) {
    console.log(`   ❌ ${tooTight.length} 句"塞不下"（时长 < 词数×120ms，物理上唱不完）：`);
    for (const t of tooTight.slice(0, 10)) {
      console.log(`      ${fmt(lines[t.i].start)}  只有 ${t.dur}ms 要塞 ${t.words} 个词  ${lines[t.i].text}`);
    }
  }
  if (tooClose.length) {
    console.log(`   ⚠️  ${tooClose.length} 处相邻两句贴得太近（<80ms），源时间戳可能记重了：`);
    for (const t of tooClose.slice(0, 10)) {
      console.log(`      ${fmt(lines[t.i].start)} → ${fmt(lines[t.i + 1].start)}  ${lines[t.i].text}`);
    }
  }
}

console.log(`\n③ 行与词`);
for (const [i, l] of lines.entries()) {
  console.log(
    `   ${String(i + 1).padStart(3)}  ${fmt(l.start)} → ${fmt(l.singEnd)}` +
      `${l.end - l.singEnd > 200 ? `  (画面留到 ${fmt(l.end)})` : ""}  ${l.text}`,
  );
  console.log(`        ${l.words.map((w) => `${w.w}(${fmt(w.start)})`).join(" ")}`);
}

if (mode !== "lrc") {
  const d = lines.filter((l) => l.conf !== "lrc").length;
  console.log(`\n⚠️  ${d}/${lines.length} 行的行时间是机器估的（人声段 + 字数分配），必须人耳复核。`);
} else {
  console.log(`\nℹ️  行时间来自你的 LRC 时间戳（已体检，见上）；词级细分和行尾是机器推的。`);
}

// ---------------------------------------------------------------- 落盘

if (WRITE) {
  const meta = {
    source: basename(lyricPath),
    mode,
    params: { snapMs: SNAP_MS, gapMs: GAP_MS, hopMs: HOP_MS, offsetMs: offset },
    _note:
      "conf='lrc' 表示行时间来自 LRC 时间戳；'derived' 表示机器从音频估的。词级细分与行尾始终是机器推的。",
    generatedAt: "STATIC",
    lines: lines.map((l) => ({
      text: l.text,
      start: l.start,
      singEnd: l.singEnd,
      end: l.end,
      conf: l.conf,
      words: l.words,
    })),
  };
  mkdirSync(resolve(ROOT, "assets"), { recursive: true });
  writeFileSync(resolve(ROOT, "assets", "lyrics.json"), JSON.stringify(meta, null, 2));
  writeFileSync(
    resolve(ROOT, "assets", "lyrics.js"),
    `// 由 tools/align-lyrics.js 生成（行时间来自 LRC 则 conf=lrc，否则为候选）。格式：[text, startMs, endMs]
export const meta = ${JSON.stringify({ source: meta.source, mode: meta.mode, lineCount: lines.length }, null, 2)};

export default ${JSON.stringify(lines.map((l) => [l.text, l.start, l.end]))};
`,
  );
  console.log(`\n✅ assets/lyrics.json / assets/lyrics.js 已写出`);
  console.log(`   画板里就能用：s.lyrics.get("…") / s.line / s.word / s.lyrics.wordProgress(word, s.ms)`);
} else {
  console.log(`\n（--no-write：只看报告，未落盘）`);
}
