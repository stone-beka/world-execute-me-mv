/**
 * kernel.js — 确定性内核
 *
 * 全片唯一允许的随机来源。
 *
 * 铁律：
 *   1. 本工程内禁止出现 Math.random() / Date.now() / performance.now()。
 *      （verify/determinism-check.js 会静态扫描 + 运行期比对来强制这一点）
 *   2. 画面必须是 (seed, frame) 的纯函数。渲染第 12720 帧时，
 *      不允许依赖第 12719 帧留下的任何状态。
 *   3. 所有取整、取模都走本文件的工具函数，避免 -0 / NaN / 浮点误差分叉。
 *
 * 这样做的收益：
 *   - 任意帧可单独重渲（可并行、可断点续渲、可只重跑有问题的那 3 秒）
 *   - 同 seed 跨机器/跨时间产出逐像素一致
 *   - 出 bug 时能二分定位到具体帧号
 */

const GOLDEN = 0x9e3779b9; // 2^32 / phi

/** 32 位整数雪崩混合（MurmurHash3 finalizer 变体） */
function mix32(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 把任意个整数混成一个 uint32。
 * 输入里带 seed 就能一键换「平行宇宙」。
 */
export function hashU32(...nums) {
  let h = GOLDEN >>> 0;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i] | 0; // 强制 int32，避免 1.5 和 1.4999999 混出不同结果
    h = (h ^ mix32((n + Math.imul(i + 1, 0x85ebca6b)) | 0)) >>> 0;
  }
  return mix32(h);
}

/** [0, 1) 均匀随机，纯函数 */
export function rand01(seed, ...keys) {
  return hashU32(seed, ...keys) / 4294967296;
}

/** [min, max) 均匀随机 */
export function randRange(seed, min, max, ...keys) {
  return min + rand01(seed, ...keys) * (max - min);
}

/** [min, max] 整数随机，无偏（用拒绝采样，避免取模偏差） */
export function randInt(seed, min, max, ...keys) {
  const span = max - min + 1;
  const limit = Math.floor(4294967296 / span) * span;
  const h = hashU32(seed, ...keys);
  // 一个 key 不够就再混一次，防止 span 很大时反复拒绝
  if (h < limit) return min + (h % span);
  return min + (hashU32(seed, ...keys, 0x5bd1e995) % span);
}

/** 等概率取数组一项 */
export function pick(seed, arr, ...keys) {
  if (arr.length === 0) return undefined;
  return arr[randInt(seed, 0, arr.length - 1, ...keys)];
}

/**
 * 一维平滑噪声：给定坐标 x（可以是帧号/拍号）返回 [0,1]，
 * 相邻样本连续，适合做「世界状态曲线」（呼吸、漂移、闪烁）。
 * 不用 Math.sin 做插值，改用 smootherstep，跨平台稳定。
 */
export function noise1(seed, x, channel = 0) {
  const xi = Math.floor(x);
  const f = x - xi;
  const t = f * f * f * (f * (f * 6 - 15) + 10); // smootherstep
  const a = rand01(seed, xi, channel);
  const b = rand01(seed, xi + 1, channel);
  return a + (b - a) * t;
}

/** 分形噪声：几个倍频叠加，让曲线更像「自然抖动」而不是正弦 */
export function fbm1(seed, x, octaves = 3, channel = 0) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(seed, x * freq, channel + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- 数学工具

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** 把 v 从 [a,b] 映射到 [c,d]，并夹紧 */
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));

// ---------------------------------------------------------------- 缓动

export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** 回弹：冲过头再收回来，节拍切换时很带感 */
export const easeOutBack = (t, overshoot = 1.70158) =>
  1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);

/** 脉冲：t 在 [0,1] 上从 1 衰减到 0，用于「卡拍闪光」 */
export const pulse = (t, decay = 6) => Math.exp(-decay * clamp01(t));
