/** element.wireHeart.js — 复用 _ui.js 的线框爱心（在原点绘制） */
import { wireHeart } from "../../boards/_ui.js";

export default {
  name: "wireHeart",
  kind: "element",
  params: {
    size: { type: "number", default: 160 },
  },
  sizeOf(p) {
    return { w: p.size ?? 160, h: p.size ?? 160 };
  },
  draw(ctx, s, p) {
    wireHeart(ctx, s, 0, 0, p.size ?? 160);
  },
};
