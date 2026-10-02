/** fx.jitter.js — 抖动：按确定性偏移叠几份（wrap） */

export default {
  name: "jitter",
  kind: "fx",
  mode: "wrap",
  params: {
    amp: { type: "number", default: 6 },
    copies: { type: "number", default: 3 },
  },
  drawWrapped(ctx, s, inner, p, params) {
    const amp = params.amp ?? 6;
    const n = Math.max(1, Math.round(params.copies ?? 3));
    const a = Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
    for (let k = 0; k < n; k++) {
      ctx.save();
      ctx.globalAlpha *= 0.6 / n;
      ctx.translate((s.rnd(k, 11) - 0.5) * amp * a, (s.rnd(k, 12) - 0.5) * amp * a);
      inner();
      ctx.restore();
    }
    inner();
  },
};
