/**
 * render.js — 逐帧渲染入口
 *
 * 引擎只做四件事：
 *   1. 按帧号生成时间状态
 *   2. 清屏 + 铺底
 *   3. 把当前时间点活跃的画板按 z 从底到顶画一遍，各自乘上自己的信封
 *   4. 交出像素（PNG buffer 或 raw RGBA）
 *
 * 引擎不知道「剧情」，剧情全在画板里。
 */

import { createCanvas } from "@napi-rs/canvas";
import * as tl from "./timeline.js";
import { activeBoards, makeState, loadBoards } from "./registry.js";
import { envelope } from "./fade.js";
import { registerProjectFonts } from "./fonts.js";
import { drawFloor } from "./floor.js";

/** 全片共享的时间/尺寸上下文 */
export const ts = {
  fps: tl.fps,
  width: tl.width,
  height: tl.height,
  seed: tl.seed,
  colors: tl.colors,
  durationMs: tl.durationMs,
  totalFrames: tl.totalFrames,
  frameState: tl.frameState,
  floor: tl.config.floor ?? false,
};

export async function initEngine(dir) {
  registerProjectFonts(); // 打包字体要在任何画板画字之前注册
  return loadBoards(dir);
}

export function createSurface(width = ts.width, height = ts.height) {
  const canvas = createCanvas(width, height);
  return { canvas, ctx: canvas.getContext("2d") };
}

/**
 * 把第 frame 帧画到 ctx 上。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} frame
 * @param {object} [opt]
 * @param {string} [opt.background] 底色，默认取 config.colors.bg
 * @param {boolean} [opt.debugBounds] 画板边界可视化，调试用
 * @param {number} [opt.samples] 子帧数（默认 1）。>1 = 真运动模糊/时间抗锯齿
 * @param {number} [opt.shutter] 快门占一帧的比例，默认 0.5
 * @returns {{drawn:number, total:number, samples:number}} 本帧实际画了几块 / 全片共几块 / 用了几帧样本
 *
 * 关于 samples：每个子帧画在不同时刻（frame 的时刻 ± shutter/2 内均匀分布），
 * 然后按 1/1, 1/2, 1/3… 的权重叠加（运转平均，精确等于算术平均）。
 * 关键：子帧的 s.frame 不变，只有 ms 变 —— 所以「按帧抖动的噪声」不会双重曝光。
 * 代价是渲染时间 × samples，所以默认 1，只在标了「快甩/砸字」的段开。
 */
export function renderFrame(ctx, frame, opt = {}) {
  const samples = Math.max(1, Math.floor(opt.samples ?? 1));
  if (samples === 1) return drawFrame(ctx, frame, opt);

  const shutter = opt.shutter ?? 0.5;
  const span = shutter * tl.MS_PER_FRAME;
  const s0 = getScratch();
  const info = { drawn: 0, total: 0, samples };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  for (let k = 0; k < samples; k++) {
    const u = (k + 0.5) / samples - 0.5; // -0.5..0.5，均匀铺在快门里
    const r = drawFrame(s0.ctx, frame, opt, tl.frameToMs(frame) + u * span);
    info.drawn = r.drawn;
    info.total = r.total;
    ctx.globalAlpha = 1 / (k + 1); // 运转平均：先满幅，再 1/2、1/3…
    ctx.drawImage(s0.canvas, 0, 0);
  }
  ctx.restore();
  return info;
}

/** 子帧用的离屏面（每次调用都被完全重画，不留状态） */
let scratch = null;
function getScratch() {
  if (!scratch) scratch = createSurface();
  return scratch;
}

/** 单个时刻的真渲染。msOverride 让子帧只挪时间、不动 frame。 */
function drawFrame(ctx, frame, opt = {}, msOverride) {
  const time = tl.frameState(frame, msOverride);
  const base = makeState(frame, { ...ts, ...time });
  // 多画板叠加时，把每个画板的登记汇到同一个数组（供检查器用）
  const regOut = opt.reg ?? null;

  // 图层开关（检查器用；正常渲染时全是 undefined = 全开）
  const layer = opt.layers ?? null;
  const on = (name) => !layer || layer[name] !== false;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = opt.background ?? ts.colors.bg;
  ctx.fillRect(0, 0, ts.width, ts.height);
  ctx.restore();

  const acts = activeBoards(time.ms);
  for (const b of acts) {
    const { meta } = b;
    const env = envelope(time.ms, b.startMs, b.endMs, meta.fade ?? {});
    if (env <= 0) continue;

    // 按画板开关：layers.boards 里显式 false 的画板整块不画
    if (layer?.boards && layer.boards[meta.id] === false) continue;

    const s = {
      ...base,
      env,
      // 图层开关（检查器用）：画板内的「特效」开关 + 背景等全局层开关
      fxOff: layer?.fx ?? null,
      layerOff: layer?.off ?? null,
      // 运行时元素登记（检查器注入；正常渲染时 null，装置里的 reg() 直接返回）
      __reg: regOut,
      __boardFile: b.file.replace(/\.js$/, ""),
      local: (time.ms - b.startMs) / (b.endMs - b.startMs), // 0..1 画板内进度
      localMs: time.ms - b.startMs,
      remainMs: b.endMs - time.ms,
      startMs: b.startMs,
      endMs: b.endMs,
    };

    ctx.save();
    try {
      // 画板自己的淡入淡出。env 由 meta.fade 算出来（0..1）。
      // ⚠️ 2026-09-29：这个值以前只放进 s.env、**没有任何画板用它** ——
      // 结果 14 块画板全部是硬切，`meta.fade` 形同虚设。现在由引擎统一施加。
      // 相邻画板的时间区间本来就按 fade 时长交叠（见 `query.js board`），
      // 所以这里就得到一段真正的交叉溶解。
      ctx.globalAlpha = env;
      b.draw(ctx, s);
    } catch (err) {
      throw new Error(`画板 "${meta.id}" 在第 ${frame} 帧 (${time.ms.toFixed(1)}ms) 崩溃：${err.message}`);
    }
    ctx.restore();

    if (opt.debugBounds) drawBounds(ctx, b);
  }

  // 常驻「地板」：叠在画板之上，极轻、永远在缓慢变化（见 floor.js）。
  // 默认取 config.floor，可被 opt.floor / opt.floor=false 覆盖；
  // 也可被图层开关单独关掉（检查器用）。
  if ((opt.floor ?? ts.floor) && on("floor")) drawFloor(ctx, base);

  return { drawn: acts.length, total: 0 };
}

function drawBounds(ctx, b) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "#ff00ff";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(1, 1, ts.width - 2, ts.height - 2);
  ctx.fillStyle = "#ff00ff";
  ctx.font = "16px monospace";
  ctx.fillText(`${b.meta.id}  z=${b.meta.z ?? 0}`, 16, 28);
  ctx.restore();
}

// ---------------------------------------------------------------- 像素输出

/** PNG buffer。慢（PNG 压缩是大头），但能直接肉眼看单帧。 */
export function surfaceToPNG(surface) {
  return surface.canvas.toBuffer("image/png");
}

/**
 * raw RGBA 像素。喂 ffmpeg 的 rawvideo 用。
 * 比 PNG 快一个数量级——全片渲一遍主要靠这条路。
 */
export function surfaceToRGBA(surface) {
  const img = surface.ctx.getImageData(0, 0, ts.width, ts.height);
  const d = img.data;
  return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
}

/** ffmpeg rawvideo 输入需要的参数（顺序敏感） */
export function rawVideoArgs(inputFps = ts.fps) {
  return [
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${ts.width}x${ts.height}`,
    "-r", String(inputFps),
    "-i", "pipe:0",
  ];
}
