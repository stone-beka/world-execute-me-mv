/**
 * evaluate.js — 场景求值器
 *
 * resolveElement：纯函数，把 (元素, 毫秒) 解析成 { visible, x, y, scale, rot, alpha, fx }。
 * evaluateScene：按 z 排序逐元素绘制；元素块在原点画，变换在这里统一施加。
 */
import { envelope } from "../core/fade.js";
import { easeFn } from "../core/motion.js";
import { clamp01 } from "../core/kernel.js";
import { getElementBlock, getTrackBlock, getFxBlock } from "./registry.js";
import { drawSceneBoards } from "./board-layer.js";

export function resolveElement(el, ms) {
  const life = el.life;
  if (ms < life.inMs || ms >= life.outMs) {
    return { visible: false, x: el.at.x, y: el.at.y, scale: el.at.scale, rot: el.at.rot, alpha: 0, fx: [] };
  }

  const state = { x: el.at.x, y: el.at.y, scale: el.at.scale, rot: el.at.rot, alpha: el.at.alpha };
  const fx = [];

  for (const seg of el.tracks) {
    if (ms < seg.startMs) break; // tracks 已按 startMs 升序
    if (seg.startMs + seg.durMs <= life.inMs) continue; // 整段在生命之前 → 不参与计算
    const p = seg.durMs <= 0 ? 1 : clamp01((ms - seg.startMs) / seg.durMs);
    const e = easeFn(seg.ease)(p);
    if (seg.kind === "fx") {
      // 特效只在 [startMs, startMs + durMs) 窗口内激活；窗口结束后不再叠加。
      if (ms < seg.startMs + seg.durMs) {
        fx.push({ block: seg.block, p, params: seg.params ?? {} });
      }
    } else {
      getTrackBlock(seg.kind).apply(state, e, seg);
    }
  }

  const env = envelope(ms, life.inMs, life.outMs, {
    fadeInMs: life.fadeInMs,
    fadeOutMs: life.fadeOutMs,
  });
  state.alpha *= env;
  return { visible: env > 0 && state.alpha > 0, ...state, fx };
}

export function evaluateScene(ctx, scene, s, opt = {}) {
  const used = opt.used ?? null;
  let drawn = 0;

  // 先画旧画板（在下），再画声明式元素（在上）
  if (scene.boards && scene.boards.length) {
    drawn += drawSceneBoards(ctx, s, scene.boards, { used });
  }

  for (const el of scene.elements) {
    try {
      const r = resolveElement(el, s.ms);
      if (!r.visible) continue;
      drawResolved(ctx, s, el, r, used);
    } catch (err) {
      throw new Error(`元素 "${el.id}" 在 ${s.ms.toFixed(1)}ms 崩溃：${err.message}`);
    }
    drawn++;
  }
  return drawn;
}

function drawResolved(ctx, s, el, r, used) {
  const block = getElementBlock(el.block);
  if (used) used.add(`element:${el.block}`);
  let size = null;
  if (typeof block.sizeOf === "function") size = block.sizeOf(el.params ?? {});
  const info = { el, size };

  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.rot);
  ctx.scale(r.scale, r.scale);
  ctx.globalAlpha *= r.alpha;

  let inner = () => block.draw(ctx, s, el.params ?? {});
  for (const f of r.fx) {
    const fxBlock = getFxBlock(f.block);
    if (used) used.add(`fx:${f.block}`);
    const base = inner;
    if (fxBlock.mode === "wrap") {
      inner = () => fxBlock.drawWrapped(ctx, s, base, f.p, f.params, info);
    } else {
      inner = () => {
        fxBlock.apply(s, f.p, f.params);
        base();
      };
    }
  }
  inner();
  ctx.restore();
}
