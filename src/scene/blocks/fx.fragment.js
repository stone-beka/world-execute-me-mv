/** fx.fragment.js — 粉碎：把元素切成若干横条，按进度错位散开、旋转、变淡 */
export default {
  name: "fragment",
  kind: "fx",
  mode: "wrap",
  params: {
    pieces: { type: "number", default: 8 },
    spread: { type: "number", default: 140 },
    size: { type: "number", default: 420 },
    spin: { type: "number", default: 0.5 },
  },
  drawWrapped(ctx, s, inner, p, params) {
    const pieces = Math.max(1, Math.round(params.pieces ?? 8));
    const spread = (params.spread ?? 140) * p;
    const size = params.size ?? 420;
    const spin = params.spin ?? 0.5;
    const h = size / pieces;
    for (let i = 0; i < pieces; i++) {
      const frac = pieces === 1 ? 0 : i / (pieces - 1);
      const dir = i % 2 === 0 ? 1 : -1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-size * 2, -size / 2 + h * i, size * 4, h);
      ctx.clip();
      ctx.translate(dir * spread * frac, (frac - 0.5) * spread * 0.6);
      ctx.rotate(dir * frac * spin * p);
      ctx.globalAlpha *= 1 - 0.7 * frac * p;
      inner();
      ctx.restore();
    }
  },
};
