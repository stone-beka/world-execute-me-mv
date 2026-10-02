/**
 * fade.js — 淡入淡出协议
 *
 * 所有画板必须实现这个信封，不允许「啪」地出现/消失。
 * 视觉上这是 MV 不像 PPT 的关键。
 */

import { clamp01 } from "./kernel.js";

/**
 * @param {number} ms      当前时间
 * @param {number} startMs 画板进场时间
 * @param {number} endMs   画板退场时间
 * @param {object} [opt]
 * @param {number} [opt.fadeInMs]   淡入时长，默认 66ms（4 帧 @60fps）
 * @param {number} [opt.fadeOutMs]  淡出时长
 * @param {string} [opt.inCurve]    'linear' | 'cubic' | 'expo' | 'back'
 * @param {string} [opt.outCurve]
 * @returns {number} 0..1 不透明度
 */
export function envelope(ms, startMs, endMs, opt = {}) {
  const {
    fadeInMs = 66,
    fadeOutMs = 132,
    inCurve = "cubic",
    outCurve = "cubic",
  } = opt;

  if (ms < startMs || ms >= endMs) return 0;

  let a = 1;
  if (fadeInMs > 0 && ms < startMs + fadeInMs) {
    a = clamp01((ms - startMs) / fadeInMs);
    a = curve(a, inCurve);
  }
  let b = 1;
  if (fadeOutMs > 0 && ms > endMs - fadeOutMs) {
    b = clamp01((endMs - ms) / fadeOutMs);
    b = curve(b, outCurve);
  }
  return a * b;
}

function curve(t, kind) {
  switch (kind) {
    case "linear":
      return t;
    case "expo":
      return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case "back": {
      const s = 1.70158;
      return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
    }
    case "cubic":
    default:
      return t * t * (3 - 2 * t); // smoothstep
  }
}

/**
 * 硬切（卡拍用）。刻意不做淡入淡出，但是单独一个函数，
 * 这样 review 时能一眼看出「这里是有意硬切」而不是「忘了写信封」。
 */
export function hardCut(ms, startMs, endMs) {
  return ms >= startMs && ms < endMs ? 1 : 0;
}

/**
 * 全局调色板插值：把 0..1 映射成背景→主题色的过渡，
 * 让整片有统一的明暗呼吸，而不是每块画板各玩各的。
 */
export function mixColor(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * clamp01(t));
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * clamp01(t));
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * clamp01(t));
  return { r, g, b: bl, css: `rgb(${r},${g},${bl})` };
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 加 alpha 的 rgba 字符串，画板里高频使用 */
export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}
