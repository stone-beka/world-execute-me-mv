/**
 * board-layer.js — 把现有手写画板接进场景引擎（桥接）
 *
 * 旧画面一帧不改：用引擎原生的 activeBoards(ms) 取当前活跃画板，按 id 过滤，
 * 逐块复刻 core/render.js 注入的 s 字段与淡入淡出包络，再调画板自己的 draw。
 * 这样场景渲染与旧引擎应逐像素等价。
 */

import { boards, activeBoards, loadBoards } from "../core/registry.js";
import { envelope } from "../core/fade.js";

let ready = false;

/** 幂等：core/registry.loadBoards() 会重复 push，必须只调一次 */
export async function ensureBoardsLoaded() {
  if (ready || boards.length > 0) {
    ready = true;
    return;
  }
  await loadBoards();
  ready = true;
}

/** 校验场景引用的画板 id 都存在；缺失报错并列出可用 id */
export function validateBoardIds(ids) {
  const have = new Set(boards.map((b) => b.meta.id));
  for (const id of ids) {
    if (!have.has(id)) {
      throw new Error(`未知画板 "${id}"（场景 boards）。可用：${[...have].join(", ")}`);
    }
  }
}

/**
 * 画当前时刻活跃、且在 ids 名单里的旧画板（底→顶，顺序由 activeBoards 保证）。
 * @returns 实际画了几块
 */
export function drawSceneBoards(ctx, s, ids, opt = {}) {
  const allowed = new Set(ids);
  const used = opt.used ?? null;
  let drawn = 0;

  for (const b of activeBoards(s.ms)) {
    if (!allowed.has(b.meta.id)) continue;
    const { startMs, endMs } = b;
    const env = envelope(s.ms, startMs, endMs, b.meta.fade ?? {});
    if (env <= 0) continue;

    const span = endMs - startMs;
    const bs = {
      ...s,
      env,
      local: span ? (s.ms - startMs) / span : 0,
      localMs: s.ms - startMs,
      remainMs: endMs - s.ms,
      startMs,
      endMs,
      __reg: null,
      __boardFile: b.file.replace(/\.js$/, ""),
    };

    ctx.save();
    ctx.globalAlpha = env;
    try {
      b.draw(ctx, bs);
    } catch (err) {
      throw new Error(`画板 "${b.meta.id}" 在 ${s.ms.toFixed(1)}ms 崩溃：${err.message}`);
    }
    ctx.restore();

    if (used) used.add(`board:${b.meta.id}`);
    drawn++;
  }
  return drawn;
}
