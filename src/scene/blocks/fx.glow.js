/**
 * fx.glow.js — 辉光（wrap 型）
 *
 * 不用 ctx.filter（慢且跨平台不一致）：把元素按更大比例重画两层半透明。
 * 元素在原点绘制，所以对 ctx 做 scale 就等于把它放大。
 */

export default {
  name: "glow",
  kind: "fx",
  mode: "wrap",
  params: {
    radius: { type: "number", default: 12 },
    intensity: { type: "number", default: 0.5 },
  },
  drawWrapped(ctx, s, inner, p, params) {
    const amt = p <= 0 ? 0 : p >= 1 ? 1 : p;
    if (amt <= 0) {
      inner();
      return;
    }
    const scaleUp = (params.radius ?? 12) / 100; // 12 → 0.12
    const base = (params.intensity ?? 0.5) * amt;
    for (const [m, a] of [
      [1 + scaleUp * 2.0, 0.35],
      [1 + scaleUp, 0.6],
    ]) {
      ctx.save();
      ctx.scale(m, m);
      ctx.globalAlpha *= a * base;
      inner();
      ctx.restore();
    }
    inner();
  },
};
