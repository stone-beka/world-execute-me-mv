/**
 * render.js — 场景帧渲染入口
 *
 * 镜像 src/core/render.js 的结构（清屏 / 求值 / 地板 / 子帧运动模糊），
 * 但只画场景，不经过全局画板注册表。
 */
import * as tl from "../core/timeline.js";
import { ts, createSurface } from "../core/render.js";
import { makeState } from "../core/registry.js";
import { drawFloor } from "../core/floor.js";
import { evaluateScene } from "./evaluate.js";
import { applyGlobalFx } from "./global-fx.js";

let scratch = null;
function getScratch() {
  if (!scratch) scratch = createSurface();
  return scratch;
}

export function renderSceneFrame(ctx, scene, frame, opt = {}) {
  const samples = Math.max(1, Math.floor(opt.samples ?? 1));
  if (samples === 1) return drawSceneFrame(ctx, scene, frame, opt);

  const shutter = opt.shutter ?? 0.5;
  const span = shutter * tl.MS_PER_FRAME;
  const s0 = getScratch();
  const info = { drawn: 0, samples };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  for (let k = 0; k < samples; k++) {
    const u = (k + 0.5) / samples - 0.5;
    const r = drawSceneFrame(s0.ctx, scene, frame, opt, tl.frameToMs(frame) + u * span);
    info.drawn = r.drawn;
    ctx.globalAlpha = 1 / (k + 1);
    ctx.drawImage(s0.canvas, 0, 0);
  }
  ctx.restore();
  return info;
}

function drawSceneFrame(ctx, scene, frame, opt = {}, msOverride) {
  const time = tl.frameState(frame, msOverride);
  const base = makeState(frame, { ...ts, ...time });

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = scene.background ?? ts.colors.bg;
  ctx.fillRect(0, 0, ts.width, ts.height);
  ctx.restore();

  const drawn = evaluateScene(ctx, scene, base, opt);

  if (opt.floor ?? ts.floor) drawFloor(ctx, base);
  applyGlobalFx(ctx, scene, base, opt);
  return { drawn, samples: 1 };
}
