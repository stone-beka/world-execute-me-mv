/** fx.fragment.js — 粉碎：把元素按网格切成小块，各块随进度向外飞散（wrap） */

export default {
  name: "fragment",
  kind: "fx",
  mode: "wrap",
  params: {
    cols: { type: "number", default: 4 },
    rows: { type: "number", default: 4 },
    spread: { type: "number", default: 40 },
  },
  drawWrapped(ctx, s, inner, p, params, info) {
    const cols = Math.max(1, Math.round(params.cols ?? 4));
    const rows = Math.max(1, Math.round(params.rows ?? 4));
    const spread = params.spread ?? 40;
    const size = (info && info.size) || { w: 300, h: 300 };
    const w = Math.max(8, size.w);
    const h = Math.max(8, size.h);
    const a = Math.min(1, Math.max(0, p) * 1.25);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x0 = -w / 2 + (i * w) / cols;
        const y0 = -h / 2 + (j * h) / rows;
        const cx = x0 + w / (2 * cols);
        const cy = y0 + h / (2 * rows);
        const d = Math.hypot(cx, cy) || 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, w / cols + 1, h / rows + 1);
        ctx.clip();
        ctx.translate((cx / d) * spread * a, (cy / d) * spread * a);
        ctx.globalAlpha *= 1 - 0.4 * a;
        inner();
        ctx.restore();
      }
    }
  },
};
