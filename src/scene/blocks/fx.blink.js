/** fx.blink.js — 闪烁：按节奏忽明忽暗 */
import { clamp01 } from "../../core/kernel.js";

export default {
  name: "blink",
  kind: "fx",
  mode: "wrap",
  params: {
    rate: { type: "number", default: 8 },
    min: { type: "number", default: 0.1 },
  },
  drawWrapped(ctx, s, inner, p, params) {
    const rate = params.rate ?? 8;
    const min = clamp01(params.min ?? 0.1);
    const ph = (s.ms / 1000) * rate;
    const on = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
    ctx.save();
    ctx.globalAlpha *= min + (1 - min) * on * (0.4 + 0.6 * p);
    inner();
    ctx.restore();
  },
};
