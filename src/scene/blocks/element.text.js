/** element.text.js — 文本元素块（在原点绘制，居中基线） */

export default {
  name: "text",
  kind: "element",
  params: {
    text: { type: "string", default: "world.execute(me);" },
    size: { type: "number", default: 22 },
    color: { type: "color", default: "#c8f0e8" },
    weight: { type: "number", default: 400 },
  },
  sizeOf(p) {
    return { w: (p.text ?? "").length * (p.size ?? 22) * 0.6, h: (p.size ?? 22) * 1.3 };
  },
  draw(ctx, s, p) {
    ctx.font = s.mono(p.size ?? 22, p.weight ?? 400);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.color ?? s.colors.fg;
    ctx.fillText(p.text ?? "", 0, 0);
  },
};
