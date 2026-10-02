/** element.rect.js — 圆角矩形元素块（在原点绘制） */

export default {
  name: "rect",
  kind: "element",
  params: {
    w: { type: "number", default: 200 },
    h: { type: "number", default: 120 },
    radius: { type: "number", default: 0 },
    fill: { type: "color", default: "#39ff88" },
    stroke: { type: "color", default: null },
    lineWidth: { type: "number", default: 2 },
  },
  sizeOf(p) {
    return { w: p.w ?? 200, h: p.h ?? 120 };
  },
  draw(ctx, s, p) {
    const w = p.w ?? 200;
    const h = p.h ?? 120;
    const r = Math.max(0, Math.min(p.radius ?? 0, Math.min(w, h) / 2));
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    if (p.fill !== null) {
      ctx.fillStyle = p.fill ?? s.colors.accent;
      ctx.fill();
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.lineWidth ?? 2;
      ctx.stroke();
    }
  },
};

function roundRect(ctx, x, y, w, h, r) {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
