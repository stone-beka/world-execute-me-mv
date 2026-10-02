/**
 * tools/probe-audio.js — 音频探针
 *
 * 回答三个必须先答对的问题：
 *   ① 音乐到底从第几毫秒开始、到第几毫秒结束？
 *      （同人 PV / 视频抽出来的音频，前后往往挂着标题卡、字幕、留白）
 *   ② 真实 BPM 是多少？（别信网上的，自己量）
 *   ③ 首拍落在音频的哪个偏移上？（config 里的 beatOffsetMs）
 *
 * 做法：
 *   读 WAV → 分帧算能量包络 → 半波整流求 onset 强度
 *   → 对 onset 强度做自相关求拍周期（带 130 BPM 先验消八度歧义）
 *   → 把 onset 时刻对拍周期取模做直方图，众数就是 offset
 *
 * 用法：
 *   npm run probe:audio
 *   node tools/probe-audio.js --file assets/audio/xxx.wav --prior 130
 *
 * 产出 assets/audio-probe.json，并把结论打印出来。
 * 注意：本脚本不会自动改 config/project.json —— 那一步要你点头。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { ROOT, config } from "../src/core/timeline.js";
import { readWav } from "./lib/wav.js";

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(`--${n}`);

const PRIOR_BPM = Number(getArg("prior", config.bpm));
const HOP_MS = 5; // 包络步长，5ms 足够定位首拍
const WIN_MS = 20; // 每个包络点的统计窗

// ---------------------------------------------------------------- 找文件

function findWav() {
  const explicit = getArg("file", null);
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
  console.error("❌ 没找到 WAV。先抽音频，或 --file 指定。");
  process.exit(1);
}

console.log(`▶ 探针：${basename(wavPath)}`);

// ---------------------------------------------------------------- 读 WAV

const { samples, sampleRate, channels, durationMs } = readWav(wavPath);
console.log(
  `   ${sampleRate}Hz ${channels}ch  ${(durationMs / 1000).toFixed(2)}s  ` +
    `${(samples.length / sampleRate).toFixed(2)}s 单声道样本`,
);

// 样本级绝对边界：第一个/最后一个 |x| > -80dB 的样本。
// 比阈值法硬——同人 PV 的静音尾巴是真的「数字零」，这里能精确到样本。
const SILENCE_EPS = 1e-4; // ≈ -80 dB
let firstNZ = -1;
let lastNZ = -1;
for (let i = 0; i < samples.length; i++) {
  if (samples[i] > SILENCE_EPS || samples[i] < -SILENCE_EPS) {
    if (firstNZ < 0) firstNZ = i;
    lastNZ = i;
  }
}
const firstNZms = firstNZ < 0 ? 0 : (firstNZ / sampleRate) * 1000;
const lastNZms = lastNZ < 0 ? 0 : (lastNZ / sampleRate) * 1000;
const tailSilenceMs = durationMs - lastNZms;

// ---------------------------------------------------------------- 包络

const hop = Math.round((HOP_MS / 1000) * sampleRate);
const win = Math.round((WIN_MS / 1000) * sampleRate);

/** 滑动平均当粗略低通：N 个样本的滑动平均在 sr/N 处有第一个零点 */
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

/** 分帧 RMS 包络 */
function envelopeOf(sig, hopS, winS) {
  const n = Math.floor((sig.length - winS) / hopS);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * hopS;
    let sum = 0;
    for (let j = 0; j < winS; j++) {
      const v = sig[off + j];
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / winS);
  }
  return out;
}

/** 对数能量 + 半波整流差分 = 经典 onset strength envelope */
function onsetOf(env) {
  const logE = Float64Array.from(env, (v) => Math.log(v + 1e-9));
  const out = new Float64Array(env.length);
  for (let i = 1; i < env.length; i++) {
    out[i] = Math.max(0, logE[i] - logE[i - 1]);
  }
  return out;
}

const rms = envelopeOf(samples, hop, win);
const nFrames = rms.length;

// 低频带（≈250Hz 以下）：踢鼓和贝斯。
// 拍相位只能信它——全频段在四踩歌里反拍一样响，相位会滑。
const lowSig = movingAverage(samples, Math.round(sampleRate / 250));
const rmsLow = envelopeOf(lowSig, hop, win);

const rmsMax = Math.max(...rms);
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));
const floorDb = db(rmsMax) - 45; // 比峰值低 45dB 以下算静音

// ---------------------------------------------------------------- 音乐起止

const musicStartMs = findFirstSustained(rms, hop, sampleRate, floorDb, rmsMax, 400);
const musicEndMs = findLastSustained(rms, hop, sampleRate, floorDb, rmsMax, 400);

console.log("");
console.log("① 音乐边界");
console.log(`   音频总长      ${fmt(durationMs)}`);
console.log(`   首个有声样本  ${fmt(firstNZms)}`);
console.log(`   末个有声样本  ${fmt(lastNZms)}   （样本级，-80dB 门限）`);
console.log(`   尾部静音      ${fmt(tailSilenceMs)}`);
console.log(`   阈值法边界    ${fmt(musicStartMs)} → ${fmt(musicEndMs)}  ( sustenance 法，仅供参考)`);
if (musicStartMs > 1500) {
  console.log(`   ⚠️  开头有 ${fmt(musicStartMs)} 的非音乐内容（标题卡/留白），必须裁掉`);
}
if (durationMs - musicEndMs > 1500) {
  console.log(`   ⚠️  结尾有 ${fmt(durationMs - musicEndMs)} 的非音乐内容，必须裁掉`);
}

// 剖面：别让一个阈值替你判断，把整首的音量结构摊开看
if (has("profile")) {
  const chunk = Number(getArg("chunk", 4000));
  const prof = profile(rms, hop, sampleRate, chunk);
  const pMax = Math.max(...prof.map((p) => p.rms));
  const top = db(pMax);
  const BAR = " ▁▂▃▄▅▆▇█";
  console.log("");
  console.log(`   音量剖面（每 ${chunk / 1000}s 一格，纵轴 0..${top.toFixed(0)}dB）`);
  for (const p of prof) {
    const rel = Math.max(0, Math.min(1, (db(p.rms) - (top - 45)) / 45));
    const bar = BAR[Math.round(rel * (BAR.length - 1))].repeat(3);
    const mark =
      p.ms >= musicStartMs && p.ms < musicEndMs ? " " : "← 判定为非音乐";
    console.log(
      `   ${fmt(p.ms).padStart(8)}  ${bar.padEnd(4)}  ${db(p.rms).toFixed(1).padStart(6)} dB  ${mark}`,
    );
  }
}

// ---------------------------------------------------------------- onset 强度

const onsetS = smooth(onsetOf(rms), 3);
const onsetLowS = smooth(onsetOf(rmsLow), 3);

// ---------------------------------------------------------------- BPM

const srFrames = sampleRate / hop; // 包络帧率
const bpm = estimateBpm(onsetS, srFrames, PRIOR_BPM);

console.log("");
console.log("② 节奏");
console.log(`   实测 BPM      ${bpm.bpm.toFixed(2)}   （自相关置信度 ${bpm.confidence.toFixed(2)}）`);
console.log(`   候选          ${bpm.candidates.map((c) => `${c.bpm.toFixed(1)}(${c.score.toFixed(2)})`).join("  ")}`);
console.log(`   config 现值   ${config.bpm}`);
if (Math.abs(bpm.bpm - config.bpm) > 1) {
  console.log(`   ⚠️  和 config 差 ${(bpm.bpm - config.bpm).toFixed(2)}，需要决定改哪个`);
} else {
  console.log(`   ✅ 和 config 一致`);
}
if (bpm.halfDoubleSuspect) {
  console.log(`   ⚠️  检测到八度歧义（可能是半速/倍速），看候选里哪个对得上`);
}

// ---------------------------------------------------------------- 拍相位

const onsets = pickOnsets(onsetS, srFrames);
const periodMs = 60000 / bpm.bpm;
const phase = fitBeatPhase(onsetLowS, srFrames, periodMs, musicStartMs);

/**
 * 首尾分段验证 —— 这是判断 BPM 准不准的【决定性】测试。
 * 在曲子开头和结尾各拟合一次相位。周期对了，两处相位该一样；
 * 周期错了，尾段会自己漂开，漂移量还能反推出正确的 BPM。
 * 比任何「置信度」都有说服力。
 */
function sliceMs(arr, ms0, ms1) {
  const i0 = Math.max(0, Math.floor((ms0 * srFrames) / 1000));
  const i1 = Math.min(arr.length, Math.ceil((ms1 * srFrames) / 1000));
  return { arr: arr.subarray(i0, i1), i0 };
}

const q = (lastNZms - musicStartMs) / 4;
const s1 = sliceMs(onsetLowS, musicStartMs, musicStartMs + q);
const s4 = sliceMs(onsetLowS, musicStartMs + 3 * q, lastNZms);
const pEarly = fitBeatPhase(s1.arr, srFrames, periodMs, musicStartMs, s1.i0);
const pLate = fitBeatPhase(s4.arr, srFrames, periodMs, musicStartMs, s4.i0);

const wrapHalf = (x) => ((x % periodMs) + 1.5 * periodMs) % periodMs - periodMs / 2;
const drift = wrapHalf(pLate.ms - pEarly.ms);
const spanT = 3 * q; // 两个窗口起点之间经过的时间
const correctedPeriod = periodMs + (drift * periodMs) / spanT;
const correctedBpm = 60000 / correctedPeriod;

console.log("");
console.log("③ 拍相位（依据：低频踢鼓 <250Hz）");
console.log(`   全频段 onset ${onsets.length} 个   拍周期 ${periodMs.toFixed(3)}ms`);
console.log(`   拟合 offset  ${phase.ms.toFixed(1)}ms  → 音频第 ${fmt(phase.ms)}`);
console.log(`   锐度         ${phase.contrast.toFixed(3)}  (峰值/中位数)`);
if (phase.contrast < 1.15) {
  console.log(`   ❌ 锐度太低，这个相位和噪声没区别，**不能用**`);
} else if (phase.contrast < 1.4) {
  console.log(`   ⚠️  锐度勉强，必须用人耳复核`);
} else {
  console.log(`   ✅ 锐度可用`);
}
if (phase.rivalMs !== null) {
  const half = periodMs / 2;
  console.log(
    `   竞争相位     ${phase.rivalMs.toFixed(1)}ms  ` +
      `(相对强度 ${phase.rivalRatio.toFixed(3)}，相隔 ${phase.rivalSeparationMs}ms)`,
  );
  if (Math.abs(phase.rivalSeparationMs - half) < 40) {
    console.log(`   ⚠️  竞争者正好在反拍（半拍）上且强度接近 → 正反拍歧义`);
  }
}

console.log("");
console.log("④ 周期验证（首尾分段，决定 BPM 能不能用）");
console.log(`   首段(${fmt(musicStartMs)}~${fmt(musicStartMs + q)})  相位 ${pEarly.ms.toFixed(1)}ms  锐度 ${pEarly.contrast.toFixed(3)}`);
console.log(`   尾段(${fmt(musicStartMs + 3 * q)}~${fmt(lastNZms)})  相位 ${pLate.ms.toFixed(1)}ms  锐度 ${pLate.contrast.toFixed(3)}`);
console.log(`   漂移         ${drift.toFixed(1)}ms   ← 应接近 0`);
if (Math.abs(drift) < 25) {
  console.log(`   ✅ 漂移很小，BPM ${bpm.bpm.toFixed(3)} 可信`);
} else {
  console.log(`   ❌ 漂移 ${drift.toFixed(0)}ms，说明周期不对`);
  console.log(`      按漂移反推的修正值：BPM ${correctedBpm.toFixed(3)}  (周期 ${correctedPeriod.toFixed(3)}ms)`);
  console.log(`      这就是「开头对得上、最后一个副歌错半拍」的病根`);
}

// ---------------------------------------------------------------- 落盘

const probe = {
  file: basename(wavPath),
  sampleRate,
  channels,
  durationMs: Math.round(durationMs),
  musicStartMs: Math.round(musicStartMs),
  musicEndMs: Math.round(musicEndMs),
  musicDurationMs: Math.round(musicEndMs - musicStartMs),
  bpm: Number(bpm.bpm.toFixed(4)),
  bpmConfidence: Number(bpm.confidence.toFixed(4)),
  bpmCandidates: bpm.candidates.map((c) => ({
    bpm: Number(c.bpm.toFixed(3)),
    score: Number(c.score.toFixed(4)),
  })),
  beatOffsetMs: Number(phase.ms.toFixed(2)),
  beatOffsetContrast: Number(phase.contrast.toFixed(4)),
  beatOffsetTrustworthy: phase.contrast >= 1.4,
  beatOffsetRivalMs: phase.rivalMs === null ? null : Number(phase.rivalMs.toFixed(2)),
  beatOffsetRivalRatio: Number(phase.rivalRatio.toFixed(4)),
  onsetCount: onsets.length,
  leadingNonMusicMs: Math.round(musicStartMs),
  trailingNonMusicMs: Math.round(durationMs - musicEndMs),
  firstAudibleSampleMs: Number(firstNZms.toFixed(2)),
  lastAudibleSampleMs: Number(lastNZms.toFixed(2)),
  tailDigitalSilenceMs: Number(tailSilenceMs.toFixed(2)),
};

writeFileSync(
  resolve(ROOT, "assets", "audio-probe.json"),
  JSON.stringify(probe, null, 2),
);

console.log("");
console.log("══════════════════════════════════════════════════");
console.log("✅ assets/audio-probe.json 已写出");
console.log("");
console.log("结论：");
console.log(`   有效音频 ${fmt(firstNZms)} → ${fmt(lastNZms)}（${fmt(lastNZms - firstNZms)}）`);
if (tailSilenceMs > 500) {
  console.log(`   ⚠️  尾部还有 ${fmt(tailSilenceMs)} 数字静音，建议再裁一次`);
} else {
  console.log(`   ✅ 边界干净，尾部静音只有 ${Math.round(tailSilenceMs)}ms，无需再裁`);
}

const cfgDuration = Math.round(durationMs);
const phaseUsable = phase.contrast >= 1.4 && Math.abs(drift) < 25;
console.log("");
console.log("config/project.json 建议值（我没自动改，等你点头）：");
console.log(`   "durationMs":   ${cfgDuration}`);
console.log(`   "bpm":          ${Math.round(correctedBpm * 1000) / 1000}   ← 实测 ${bpm.bpm.toFixed(3)}，首尾漂移 ${drift.toFixed(1)}ms`);
console.log(
  `   "beatOffsetMs": ${Math.round(phase.ms)}   ` +
    `← 锐度 ${phase.contrast.toFixed(2)}${phaseUsable ? "（可用）" : "（不可用）"}`,
);
console.log("");
if (phaseUsable) {
  console.log("✅ 自动分析这次站得住：锐度够、首尾漂移小。");
  console.log("   但还是建议听一遍确认 —— 机器分不出「正拍」和「反拍」，耳朵一秒就能分。");
  console.log("   下一步：npm run beat:check -- --sweep   中间那个应该是准的");
} else {
  console.log("❌ 自动分析不可信，必须人耳校准。");
  console.log("   下一步：npm run beat:check -- --sweep   听哪个咔哒最「粘」");
}
console.log("══════════════════════════════════════════════════");

// ================================================================ 实现

/** 从前往后找「连续 loudMs 毫秒都超过阈值」的第一个点 */
function findFirstSustained(rms, hop, sr, floorDb, rmsMax, loudMs) {
  const need = Math.ceil(loudMs / HOP_MS);
  const thr = Math.pow(10, floorDb / 20);
  let run = 0;
  for (let i = 0; i < rms.length; i++) {
    run = rms[i] > thr ? run + 1 : 0;
    if (run >= need) return ((i - need + 1) * hop * 1000) / sr;
  }
  return 0;
}

function findLastSustained(rms, hop, sr, floorDb, rmsMax, loudMs) {
  const need = Math.ceil(loudMs / HOP_MS);
  const thr = Math.pow(10, floorDb / 20);
  let run = 0;
  for (let i = rms.length - 1; i >= 0; i--) {
    run = rms[i] > thr ? run + 1 : 0;
    if (run >= need) return ((i + need - 1) * hop * 1000) / sr;
  }
  return (rms.length * hop * 1000) / sr;
}

function smooth(arr, radius) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let n = 0;
    for (let d = -radius; d <= radius; d++) {
      const j = i + d;
      if (j < 0 || j >= arr.length) continue;
      s += arr[j];
      n++;
    }
    out[i] = s / n;
  }
  return out;
}

/**
 * 自相关估 BPM。
 * 八度歧义（130 vs 65 vs 260）靠两点消：
 *   1. 只在 60..200 BPM 的 lag 范围里找峰
 *   2. 对接近先验 BPM 的候选给一点加权（先验只用来投票，不用来定值）
 */
function estimateBpm(onset, frameRate, priorBpm) {
  const minLag = Math.floor((60 / 200) * frameRate);
  const maxLag = Math.ceil((60 / 60) * frameRate);

  const ac = new Float64Array(maxLag + 1);
  let norm0 = 0;
  for (let i = 0; i < onset.length; i++) norm0 += onset[i] * onset[i];
  if (norm0 === 0) return { bpm: priorBpm, confidence: 0, candidates: [], halfDoubleSuspect: false };

  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < onset.length; i++) s += onset[i] * onset[i - lag];
    ac[lag] = s / norm0;
  }

  // 找所有局部极大
  const peaks = [];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      peaks.push({ lag, score: ac[lag], bpm: (60 * frameRate) / lag });
    }
  }
  peaks.sort((a, b) => b.score - a.score);

  // 先验加权：先验周边 ±3% 的候选升一档，只用于在接近的候选之间打破平局
  for (const p of peaks) {
    const rel = Math.abs(p.bpm - priorBpm) / priorBpm;
    p.weighted = p.score * (rel < 0.03 ? 1.15 : 1);
  }
  const ranked = [...peaks].sort((a, b) => b.weighted - a.weighted);

  const best = ranked[0];
  const halfDoubleSuspect = ranked
    .slice(1, 4)
    .some((p) => {
      const ratio = p.bpm / best.bpm;
      return Math.abs(ratio - 0.5) < 0.03 || Math.abs(ratio - 2) < 0.03;
    });

  // 整数 lag 的分辨率太粗：130 BPM 对应 lag 92.5，只能取 92 或 93，
  // 也就是 BPM 只能落在 129.3 或 130.7 —— 0.65 BPM 的误差在 212 秒里
  // 会累积成半拍。必须用抛物线插值拿到亚帧精度的峰值位置。
  const li = best.lag;
  let refined = li;
  if (li > minLag && li < maxLag) {
    const y0 = ac[li - 1];
    const y1 = ac[li];
    const y2 = ac[li + 1];
    const denom = y0 - 2 * y1 + y2;
    if (denom !== 0) {
      const delta = (0.5 * (y0 - y2)) / denom;
      if (Math.abs(delta) <= 0.5) refined = li + delta;
    }
  }
  const refinedBpm = (60 * frameRate) / refined;

  const second = ranked[1]?.score ?? 0;
  const confidence = best.score > 0 ? 1 - second / best.score : 0;

  return {
    bpm: refinedBpm,
    rawBpm: best.bpm,
    refinedLag: refined,
    confidence,
    candidates: ranked.slice(0, 5).map((p) => ({ bpm: p.bpm, score: p.score })),
    halfDoubleSuspect,
  };
}

/** 峰值拾取：挑出足够强的 onset 时刻（毫秒）
 *
 *  阈值用「中位数 + k×MAD」而不是「峰值的固定百分比」。
 *  固定百分比在密集电子乐上会全军覆没——整首都在响，峰值的 25% 比什么都高。
 *  自适应阈值对「大部分帧是背景、少数帧是击打」这种分布才合理。
 */
function pickOnsets(onset, frameRate) {
  const sorted = Float64Array.from(onset).sort();
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = medianAbsDev(onset, median);
  const K = 2.0;
  const thr = median + K * mad;

  const out = [];
  let last = -Infinity;
  for (let i = 1; i < onset.length - 1; i++) {
    if (onset[i] < thr) continue;
    if (onset[i] < onset[i - 1] || onset[i] < onset[i + 1]) continue;
    const ms = (i * 1000) / frameRate;
    if (ms - last < 30) continue; // 30ms 内只算一次
    out.push(ms);
    last = ms;
  }
  return out;
}

function medianAbsDev(arr, median) {
  const dev = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) dev[i] = Math.abs(arr[i] - median);
  const s = Float64Array.from(dev).sort();
  return s[Math.floor(s.length / 2)];
}

/**
 * 粗粒度 dB 剖面：每 chunkMs 一段的 RMS。
 * 用来肉眼确认「哪里真有声音」，别让一个阈值替你做判断。
 */
function profile(rms, hop, sr, chunkMs) {
  const per = Math.max(1, Math.round(chunkMs / HOP_MS));
  const out = [];
  for (let i = 0; i < rms.length; i += per) {
    let s = 0;
    let n = 0;
    for (let j = i; j < Math.min(i + per, rms.length); j++) {
      s += rms[j] * rms[j];
      n++;
    }
    out.push({ ms: (i * hop * 1000) / sr, rms: Math.sqrt(s / Math.max(1, n)) });
  }
  return out;
}

/**
 * 拍相位搜索（才是对的做法，别用「众数取模」那种糊弄法）
 *
 * 把每个 onset 的强度按「距参考点一个周期内的相位」累加进直方图，
 * 再用一个三角核在周期上做环形相关，找让网格最贴合 onset 的那个相位。
 *
 * 关键是要给出**锐度**：峰值 / 中位数。
 *   < 1.15  → 网格和噪声没区别，这个相位不能用
 *   1.15~1.4 → 勉强，需要人耳复核
 *   > 1.4   → 可信
 * 之前那版打的「命中率 100%」是自己编的数，没有任何信息量，已删。
 */
function fitBeatPhase(onset, frameRate, periodMs, refMs, i0 = 0) {
  const P = Math.round(periodMs); // 1ms 一桶
  const hist = new Float64Array(P);
  for (let i = 0; i < onset.length; i++) {
    if (onset[i] <= 0) continue;
    const ms = ((i + i0) * 1000) / frameRate;
    let ph = (ms - refMs) % periodMs;
    if (ph < 0) ph += periodMs;
    hist[Math.min(P - 1, Math.floor(ph))] += onset[i];
  }

  const K = 30; // 三角核半宽 30ms：容忍微小摇摆
  const kern = new Float64Array(K + 1);
  for (let d = 0; d <= K; d++) kern[d] = 1 - d / (K + 1);

  const score = new Float64Array(P);
  for (let p = 0; p < P; p++) {
    let s = 0;
    for (let d = 0; d <= K; d++) {
      s += hist[(p + d) % P] * kern[d];
      if (d > 0) s += hist[(p - d + P) % P] * kern[d];
    }
    score[p] = s;
  }

  const sorted = Float64Array.from(score).sort();
  const median = sorted[Math.floor(P / 2)];
  const max = sorted[P - 1];
  const contrast = median > 0 ? max / median : 0;

  let best = 0;
  for (let p = 1; p < P; p++) if (score[p] > score[best]) best = p;

  // 竞争者：离冠军至少 80ms 的最强相位（用来暴露「反拍也很强」）
  let rival = -1;
  let rivalScore = -1;
  for (let p = 0; p < P; p++) {
    const sep = Math.min(Math.abs(p - best), P - Math.abs(p - best));
    if (sep < 80) continue;
    if (score[p] > rivalScore) {
      rivalScore = score[p];
      rival = p;
    }
  }

  return {
    ms: refMs + best,
    binMs: best,
    contrast,
    rivalMs: rival >= 0 ? refMs + rival : null,
    rivalRatio: rivalScore > 0 ? rivalScore / max : 0,
    rivalSeparationMs: rival >= 0 ? Math.abs(rival - best) : null,
  };
}

function fmt(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}
