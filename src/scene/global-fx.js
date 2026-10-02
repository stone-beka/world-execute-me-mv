/**
 * global-fx.js — 场景级「背景特效」求值
 *
 * bgfx 段不依附元素，叠在整帧之上：给定 ms，找出命中的段，
 * 按段内进度 p 调对应 bgfx 块的 apply。
 */
import { getBgfxBlock } from "./registry.js";

export function applyGlobalFx(ctx, scene, s, opt = {}) {
  const used = opt.used ?? null;
  let n = 0;
  for (const seg of scene.bgfx ?? []) {
    if (s.ms < seg.startMs) break;
    if (s.ms >= seg.endMs) continue;
    const p = seg.endMs <= seg.startMs ? 1 : (s.ms - seg.startMs) / (seg.endMs - seg.startMs);
    const b = getBgfxBlock(seg.block);
    if (used) used.add(`bgfx:${seg.block}`);
    ctx.save();
    b.apply(ctx, s, seg.params ?? {}, p);
    ctx.restore();
    n++;
  }
  return n;
}
