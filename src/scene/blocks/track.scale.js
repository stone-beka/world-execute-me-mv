/** track.scale.js — 缩放轨迹 */
import { lerp } from "../../core/kernel.js";

export default {
  name: "scale",
  kind: "track",
  channels: ["scale"],
  apply(state, e, seg) {
    state.scale = lerp(seg.from ?? 1, seg.to ?? 1, e);
  },
};
