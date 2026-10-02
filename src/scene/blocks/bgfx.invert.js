/** bgfx.invert.js — 场景级「反相」：整帧黑白互翻（bgfx） */
import { rgba } from "../../core/fade.js";

export default {
  name: "invert",
  kind: "bgfx",
  params: {
    amount: { type: "number", default: 1 },
  },
  apply(ctx, s, params) {
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = rgba("#ffffff", params.amount ?? 1);
    ctx.fillRect(0, 0, s.W, s.H);
  },
};
