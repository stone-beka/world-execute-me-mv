/**
 * tools/lib/onsets.js — 从音频提取 onset（重音）强度包络
 *
 * 给 tools/onset-detect.js 用。算法和 tools/probe-audio.js 内部那份一致：
 *   RMS 包络 → log 能量 → 半波整流差分 = onset strength envelope。
 * 另外单算一条 <250Hz 低频带：踢鼓/贝斯在那里最干净，拍相位只信它。
 *
 * 约束：不引第三方依赖；确定性（同一 WAV 永远出同一结果，无时间/随机来源）。
 */

import { readWav } from "./wav.js";

export const HOP_MS = 5; // 包络步长
export const WIN_MS = 20; // 每个包络点的统计窗

/** 滑动平均当粗略低通：N 个样本的滑动平均在 sr/N 处有第一个零点 */
export function movingAverage(sig, n) {
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
export function envelopeOf(sig, hopS, winS) {
  const n = Math.floor((sig.length - winS) / hopS);
  const out = new Float64Array(Math.max(0, n));
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
export function onsetOf(env) {
  const logE = Float64Array.from(env, (v) => Math.log(v + 1e-9));
  const out = new Float64Array(env.length);
  for (let i = 1; i < env.length; i++) {
    out[i] = Math.max(0, logE[i] - logE[i - 1]);
  }
  return out;
}

/** 简单滑动平均平滑 */
export function smooth(arr, radius) {
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
 * 读 WAV 并算出两条 onset 强度包络。
 * @returns {{onset:Float64Array, onsetLow:Float64Array, srFrames:number,
 *            hopMs:number, sampleRate:number, durationMs:number, channels:number}}
 */
export function onsetEnvelopes(wavPath, { hopMs = HOP_MS, winMs = WIN_MS } = {}) {
  const { samples, sampleRate, durationMs, channels } = readWav(wavPath);
  const hop = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  const win = Math.max(1, Math.round((winMs / 1000) * sampleRate));

  const rms = envelopeOf(samples, hop, win);
  const rmsLow = envelopeOf(movingAverage(samples, Math.round(sampleRate / 250)), hop, win);

  return {
    onset: smooth(onsetOf(rms), 3),
    onsetLow: smooth(onsetOf(rmsLow), 3),
    srFrames: sampleRate / hop, // 包络帧率
    hopMs: (hop / sampleRate) * 1000,
    sampleRate,
    durationMs,
    channels,
  };
}

/**
 * 峰值拾取：挑出足够强的 onset。
 *
 * 阈值用「中位数 + k×MAD」而不是「峰值的固定百分比」——密集电子乐整首都在响，
 * 固定百分比会全军覆没；自适应阈值对「多数帧是背景、少数帧是击打」才合理。
 *
 * @returns {Array<{ms:number, strength:number}>} 按 ms 升序
 */
export function pickOnsets(onset, frameRate, { k = 2.0, minGapMs = 30 } = {}) {
  const sorted = Float64Array.from(onset).sort();
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = medianAbsDev(onset, median);
  const thr = median + k * mad;

  const out = [];
  let last = -Infinity;
  for (let i = 1; i < onset.length - 1; i++) {
    if (onset[i] < thr) continue;
    if (onset[i] < onset[i - 1] || onset[i] < onset[i + 1]) continue;
    const ms = (i * 1000) / frameRate;
    if (ms - last < minGapMs) continue;
    out.push({ ms: Number(ms.toFixed(2)), strength: Number(onset[i].toFixed(5)) });
    last = ms;
  }
  return out;
}

/** 中位数绝对偏差 */
export function medianAbsDev(arr, median) {
  const dev = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) dev[i] = Math.abs(arr[i] - median);
  const s = Float64Array.from(dev).sort();
  return s[Math.floor(s.length / 2)];
}
