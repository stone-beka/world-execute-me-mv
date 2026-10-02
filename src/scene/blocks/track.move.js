/** track.move.js — 轨迹预设：line / orbit / curve */
import { lerp } from "../../core/kernel.js";

export default {
  name: "move",
  kind: "track",
  channels: ["x", "y"],
  apply(state, e, seg) {
    const path = seg.path ?? "line";
    const a = seg.from;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) {
      throw new Error('move 需要 from{x,y}');
    }

    if (path === "orbit") {
      const c = seg.center;
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) throw new Error("move.orbit 需要 center{x,y}");
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const a0 = Math.atan2(a.y - c.y, a.x - c.x);
      const dir = seg.clockwise === false ? -1 : 1;
      const ang = a0 + dir * ((seg.sweep ?? 360) * Math.PI / 180) * e;
      state.x = c.x + Math.cos(ang) * r;
      state.y = c.y + Math.sin(ang) * r;
      return;
    }

    const b = seg.to;
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new Error('move 需要 to{x,y}');

    if (path === "curve") {
      const v = seg.via;
      if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new Error("move.curve 需要 via{x,y}");
      const u = 1 - e;
      state.x = u * u * a.x + 2 * u * e * v.x + e * e * b.x;
      state.y = u * u * a.y + 2 * u * e * v.y + e * e * b.y;
      return;
    }

    if (path !== "line") throw new Error(`move 不认识的 path："${path}"（line/orbit/curve）`);
    state.x = lerp(a.x, b.x, e);
    state.y = lerp(a.y, b.y, e);
  },
};
