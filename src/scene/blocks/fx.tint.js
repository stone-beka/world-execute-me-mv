/** fx.tint.js — 变色：给元素叠一层颜色（source-atop，只作用于元素自身） */
export default {
  name: "tint",
  kind: "fx",
  mode: "wrap",
  params: {
    color: { type: "color", default: "#ff3b5c" },
    amount: { type: "number", default: 0.9 },
  },
  drawWrapped(ctx, s, inner, p, params) {
    inner();
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = Math.max(0, Math.min(1, params.amount ?? 0.9)) * p;
    ctx.fillStyle = params.color ?? "#ff3b5c";
    ctx.fillRect(-4000, -4000, 8000, 8000);
    ctx.restore();
  },
};
