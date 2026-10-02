/**
 * tools/lib/grid.js — 拍网格工具
 *
 * 给 tools/onset-detect.js（校验网格）和 tools/align-beat.js（拟合网格）共用。
 * 只做「onset 时刻 ↔ 拍网格」的数学，不读文件、不碰音频。
 *
 * 网格定义：第 k 拍 = beatOffsetMs + k × periodMs（k 可为负，拍 0 = 首拍）。
 */

/** 把一个时刻折算成「离最近拍点」的有符号残差，范围 [-P/2, P/2) */
export function beatResidual(ms, beatOffsetMs, periodMs) {
  const r = (ms - beatOffsetMs) % periodMs;
  return r < -periodMs / 2 ? r + periodMs : r >= periodMs / 2 ? r - periodMs : r;
}

/** 最近的整拍序号（四舍五入） */
export function nearestBeat(ms, beatOffsetMs, periodMs) {
  return Math.round((ms - beatOffsetMs) / periodMs);
}

/**
 * onsets（[{ms,strength}] 或 [[ms,strength]]）对网格的残差统计。
 * @returns {count, withinTol, pctWithinTol, medianAbs, p90Abs, maxAbs, tolMs}
 */
export function residualStats(onsets, beatOffsetMs, periodMs, tolMs = 25) {
  const abs = onsets.map((o) => Math.abs(beatResidual(ms(o), beatOffsetMs, periodMs)));
  if (abs.length === 0) {
    return { count: 0, withinTol: 0, pctWithinTol: 0, medianAbs: 0, p90Abs: 0, maxAbs: 0, tolMs };
  }
  const sorted = [...abs].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
  return {
    count: abs.length,
    meanAbs: Number(mean.toFixed(3)),
    withinTol: abs.filter((v) => v <= tolMs).length,
    pctWithinTol: Number(((abs.filter((v) => v <= tolMs).length / abs.length) * 100).toFixed(1)),
    medianAbs: Number(at(0.5).toFixed(3)),
    p90Abs: Number(at(0.9).toFixed(3)),
    maxAbs: Number(sorted[sorted.length - 1].toFixed(3)),
    tolMs,
  };
}

/**
 * 一阶圆均值求「这一批 onset 最贴合的相位偏移」（毫秒，[-P/2,P/2)）。
 * 用矢量求和而不是直方图众数：对摇摆更鲁棒，也不怕分桶边界。
 * strength 用作权重（可选）。
 */
export function circularPhase(onsets, beatOffsetMs, periodMs) {
  let sx = 0;
  let sy = 0;
  for (const o of onsets) {
    const w = Math.max(1e-6, strength(o));
    const r = beatResidual(ms(o), beatOffsetMs, periodMs);
    const a = (2 * Math.PI * r) / periodMs;
    sx += w * Math.sin(a);
    sy += w * Math.cos(a);
  }
  if (sx === 0 && sy === 0) return { phaseMs: 0, r: 0 };
  const mean = Math.atan2(sx, sy);
  const R = Math.hypot(sx, sy) / onsets.reduce((s, o) => s + Math.max(1e-6, strength(o)), 0);
  return { phaseMs: Number(((mean / (2 * Math.PI)) * periodMs).toFixed(3)), r: Number(R.toFixed(4)) };
}

/** 把残差按窗口切片，返回每窗的相位 + 残差中位数（看漂移用） */
export function windowPhases(onsets, beatOffsetMs, periodMs, startMs, endMs, windows = 4) {
  const out = [];
  const span = (endMs - startMs) / windows;
  for (let w = 0; w < windows; w++) {
    const a = startMs + w * span;
    const b = startMs + (w + 1) * span;
    const inWin = onsets.filter((o) => ms(o) >= a && ms(o) < b);
    const ph = circularPhase(inWin, beatOffsetMs, periodMs);
    const stats = residualStats(inWin, beatOffsetMs, periodMs);
    out.push({
      index: w,
      startMs: Math.round(a),
      endMs: Math.round(b),
      count: inWin.length,
      phaseMs: ph.phaseMs,
      concentration: ph.r,
      medianAbsMs: stats.medianAbs,
    });
  }
  return out;
}

// onset 既支持 [{ms,strength}] 也支持 [[ms,strength]]
function ms(o) {
  return Array.isArray(o) ? o[0] : o.ms;
}
function strength(o) {
  if (Array.isArray(o)) return o.length > 1 ? o[1] : 1;
  return o.strength ?? 1;
}
