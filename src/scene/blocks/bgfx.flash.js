/** bgfx.flash.js — 场景级「白闪」：段内先亮后灭（bgfx） */
import { rgba } from "../../core/fade.js";

export default {
  name: "flash",
  kind: "bgfx",
  params: {
    color: { type: "color", default: "#ffffff" },
    alpha: { type: "number", default: 0.8 },
  },
  apply(ctx, s, params, p) {
    const amount = (params.alpha ?? 0.8) * Math.sin(Math.PI * Math.max(0, Math.min(1, p)));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba(params.color ?? "#ffffff", amount);
    ctx.fillRect(0, 0, s.W, s.H);
  },
};
