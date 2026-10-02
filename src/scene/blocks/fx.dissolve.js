/** fx.dissolve.js — 消融：从内向外（或从外向内）逐渐被挖空 */
export default {
  name: "dissolve",
  kind: "fx",
  mode: "wrap",
  params: {
    radius: { type: "number", default: 600 },
    from: { type: "string", default: "center" },
  },
  drawWrapped(ctx, s, inner, p, params) {
    const R = Math.max(1, params.radius ?? 600);
    ctx.save();
    if ((params.from ?? "center") === "out") {
      // 从外向内：只保留逐渐缩小的中心
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, R * (1 - p)), 0, Math.PI * 2);
      ctx.clip();
    } else {
      // 从内向外：挖掉逐渐扩大的中心
      ctx.beginPath();
      ctx.rect(-4000, -4000, 8000, 8000);
      ctx.arc(0, 0, Math.max(0.5, R * p), 0, Math.PI * 2, true);
      ctx.clip("evenodd");
    }
    inner();
    ctx.restore();
  },
};
