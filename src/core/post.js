/**
 * post.js — 后期质感层（辉光 / 光晕 / 色散 / 颗粒 / 暗角 / 淡出 / 闪白）
 *
 * 为什么不是逐像素的 JS 循环：
 *   1920×1080 在 JS 里跑一遍全屏像素循环大约 100~500ms/帧，12720 帧 = 几小时。
 *   这里改成拼一条 ffmpeg 滤镜链，交给 ffmpeg 的 C 代码在编码前跑，1080p 基本免费。
 *
 * 用在哪：
 *   tools/render-frames.js --post        （出片）
 *   tools/preview.js --video --post      （试片；联络表 PNG 不走这条路）
 *
 * 参数（写在 --post 后面，逗号分隔，形如 --post bloom=0.6,grain=0.08）：
 *   exposure 0..3   曝光（伽马，1 = 不变）
 *   bloom 0..2      辉光强度（0 = 关）
 *   bloomThreshold  从多亮开始发光 0..1（默认 0.85，只让最亮的部分发光）
 *   bloomSigma      辉光半径（像素，默认 20）
 *   halation 0..1   光晕：高光往外泛橙红（胶片/玻璃味）
 *   ca 0..8         色散：画面边缘红蓝错位（像素，0 = 关）
 *   grain 0..1      胶片颗粒（0 = 关）
 *   vignette 0..1   暗角（0 = 关）
 *   fade 0..1       淡到黑（主要给单段试片用；成片的淡入淡出应该在画板信封里）
 *   invert 0..1     反相（0 = 关，1 = 全反）
 *   seed            颗粒种子。同 seed + 同帧 = 同颗粒。切片渲染时每片种子相同，
 *                   但 ffmpeg 的噪声是逐帧推进的，所以分片拼接后颗粒序列和单进程
 *                   不完全一致（和「分片编码不逐字节相同」是同一类事）。
 *
 * 铁律：这条链里没有实时时钟，所有参数每帧恒定 —— 同输入 + 同参数 = 同输出。
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const DEFAULT_POST = {
  exposure: 1,
  bloom: 0.55,
  bloomThreshold: 0.85,
  bloomSigma: 20,
  halation: 0.22,
  ca: 1.2,
  grain: 0.05,
  vignette: 0.35,
  fade: 0,
  invert: 0,
  seed: 123457,
};

/** 解析 --post 的值：`bloom=0.6,ca=2,grain=0`。空串 = 全套默认。 */
export function parsePost(str) {
  const p = { ...DEFAULT_POST };
  if (typeof str !== "string") return p;
  for (const kv of str.split(",")) {
    const t = kv.trim();
    if (!t) continue;
    const i = t.indexOf("=");
    if (i < 0) {
      // 只写名字 = 用默认值打开（方便 --post bloom）
      if (t in DEFAULT_POST) p[t] = DEFAULT_POST[t];
      continue;
    }
    const k = t.slice(0, i).trim();
    if (k in DEFAULT_POST) p[k] = num(t.slice(i + 1), p[k]);
  }
  return p;
}

/**
 * 拼滤镜图。返回 { graph, out }，没有可加的效果时返回 null。
 * 调用方用 -filter_complex "<graph>" -map "[<out>]"。
 */
export function buildPostFilter(p, inLabel = "0:v", outLabel = "vout") {
  const cast = [];
  const f = [];
  const L = (() => {
    let k = 0;
    return () => `pp${k++}`;
  })();

  const thr = clamp(p.bloomThreshold, 0, 0.999).toFixed(3);
  const cr = `colorlevels=rimin=${thr}:gimin=${thr}:bimin=${thr}`;
  // 辉光/光晕的本质是低频，没必要在全分辨率上模糊。
  // 缩小 → 模糊 → 放大：像素少 16~64 倍，效果肉眼几乎一样，速度差一个量级。
  const downsample = (level, sigma) =>
    `scale=iw/${level}:ih/${level},gblur=sigma=${(sigma / level).toFixed(2)},scale=iw*${level}:ih*${level}`;

  // ---- 辉光 + 光晕：抠高光 → 缩模糊 → screen 叠回 ----
  const bloomOn = p.bloom > 0;
  const haloOn = p.halation > 0;
  if (bloomOn || haloOn) {
    const a = L();
    const b = L();
    const bl = L();
    f.push(`[${inLabel}]split=2[${a}][${b}]`);
    f.push(`[${b}]${cr},${downsample(4, p.bloomSigma)}[${bl}]`);
    const ob = bloomOn ? p.bloom : 0;
    let cur = L();
    if (bloomOn) f.push(`[${a}][${bl}]blend=all_mode=screen:all_opacity=${ob.toFixed(3)}[${cur}]`);
    else f.push(`[${a}]null[${cur}]`);
    let prev = cur;
    if (haloOn) {
      const h0 = L();
      const h1 = L();
      const hl = L();
      const ho = L();
      f.push(`[${prev}]split=2[${h0}][${h1}]`);
      // 更大半径 + 偏红 = 光晕（先在小图上染色，再放大）
      f.push(
        `[${h1}]${cr},scale=iw/8:ih/8,gblur=sigma=${(p.bloomSigma / 8).toFixed(2)},` +
          `colorchannelmixer=rr=1:gg=0.42:bb=0.16,scale=iw*8:ih*8[${hl}]`,
      );
      f.push(`[${h0}][${hl}]blend=all_mode=screen:all_opacity=${clamp(p.halation, 0, 1).toFixed(3)}[${ho}]`);
      prev = ho;
    }
    cast.push({ in: prev });
  }

  const start = cast.length ? cast[0].in : null;

  // ---- 色散：边缘红蓝错位 ----
  const steps = [];
  if (p.ca > 0) {
    const c = Math.round(clamp(p.ca, 0, 8));
    if (c > 0) steps.push(`rgbashift=rh=${c}:bh=${-c}`);
  }
  // ---- 曝光（伽马）----
  if (Math.abs(p.exposure - 1) > 1e-3) steps.push(`eq=gamma=${clamp(p.exposure, 0.05, 4).toFixed(3)}`);
  // ---- 反相 ----
  if (p.invert > 0.5) steps.push(`negate`);
  // ---- 淡到黑（乘性）----
  if (p.fade > 0) {
    const e = (1 - clamp(p.fade, 0, 1)).toFixed(4);
    steps.push(`colorlevels=romax=${e}:gomax=${e}:bomax=${e}`);
  }
  // ---- 颗粒 ----
  if (p.grain > 0) {
    steps.push(
      `noise=alls=${Math.round(clamp(p.grain, 0, 1) * 60)}:allf=t+u:all_seed=${Math.round(p.seed)}`,
    );
  }
  // ---- 暗角 ----
  if (p.vignette > 0) {
    const angle = (Math.PI / 6 + clamp(p.vignette, 0, 1) * (Math.PI / 3)).toFixed(4);
    steps.push(`vignette=angle=${angle}`);
  }

  // 把「链式步骤」接在（可能已经分叉过的）主干后面
  if (steps.length === 0 && start === null) return null;
  const head = start ?? inLabel;
  if (steps.length === 0) {
    f.push(`[${head}]null[${outLabel}]`);
  } else {
    f.push(`[${head}]${steps.join(",")}[${outLabel}]`);
  }
  return { graph: f.join(";"), out: outLabel };
}

export function hasPost(p) {
  return (
    p.bloom > 0 ||
    p.halation > 0 ||
    p.ca > 0 ||
    p.grain > 0 ||
    p.vignette > 0 ||
    p.fade > 0 ||
    p.invert > 0.5 ||
    Math.abs(p.exposure - 1) > 1e-3
  );
}
