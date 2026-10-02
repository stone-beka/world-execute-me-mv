/** bgfx.tint.js — 场景级「变色 / 滤镜」：整帧叠一层彩色（bgfx） */
import { rgba } from "../../core/fade.js";

export default {
  name: "tint",
  kind: "bgfx",
  params: {
    color: { type: "color", default: "#ff3b5c" },
    alpha: { type: "number", default: 0.3 },
  },
  apply(ctx, s, params) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba(params.color ?? "#ff3b5c", params.alpha ?? 0.3);
    ctx.fillRect(0, 0, s.W, s.H);
  },
};
