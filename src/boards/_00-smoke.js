/**
 * 00-smoke.js — 冒烟画板 / 模板
 *
 * 作用有两个：
 *   1. 证明「引擎 → 画板 → 像素」这条链路通
 *   2. 当作以后每块新画板的抄写模板（复制这个文件改 id / 时间 / 画法）
 *
 * 它画什么：一颗随拍点呼吸的圆，每拍闪一下环，带确定性抖动。
 * 时间：0s ~ 3s。
 */

import { rgba } from "../core/fade.js";
import { easeOutCubic } from "../core/kernel.js";

export const meta = {
  id: "smoke-circle",
  z: 100,
  startMs: 0,
  endMs: 3000,
  fade: { fadeInMs: 200, fadeOutMs: 400 },
  tags: ["debug", "template"],
};

export function draw(ctx, s) {
  const cx = s.W / 2;
  const cy = s.H / 2;

  // 拍内相位：每拍从 1 衰减到 0 —— 卡拍的标准写法
  const beatDecay = Math.pow(1 - s.beatPhase, 3);

  // 基础半径随小节缓慢起伏（世界状态曲线，用 fbm 而不是 sin）
  const breathe = 90 + 40 * s.fbm(s.frame * 0.006, 3, 7);

  // 卡拍：拍点瞬间放大再收回
  const r = (breathe + 70 * beatDecay) * (1 - 0.15 * (s.barPhase > 0.9 ? 1 : 0));

  ctx.save();
  // 淡入淡出由引擎按 meta.fade 统一施加（render.js 里 `ctx.globalAlpha = env`），
  // 画板**不用**自己乘 s.env。（要硬切就配 fade: {} 并用 hardCut()。）

  // 辉光：不用 ctx.filter（慢），改成叠三层不同半径的圆
  for (const [mult, alpha] of [
    [2.6, 0.05],
    [1.7, 0.1],
    [1.0, 0.9],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * mult, 0, Math.PI * 2);
    ctx.fillStyle = rgba(s.colors.accent, alpha * (0.35 + 0.65 * beatDecay));
    ctx.fill();
  }

  // 卡拍扩散环：每拍冲出去一次
  if (s.beatPhase < 0.35) {
    const p = s.beatPhase / 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 + 1.8 * easeOutCubic(p)), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(s.colors.accent, 0.5 * (1 - p));
    ctx.lineWidth = 3 * (1 - p) + 1;
    ctx.stroke();
  }

  // 确定性抖动：同一帧永远是同一个偏移
  const jx = (s.rnd(1) - 0.5) * 3;
  const jy = (s.rnd(2) - 0.5) * 3;

  ctx.fillStyle = rgba(s.colors.fg, 0.9);
  ctx.font = s.mono(22, 600);
  ctx.fillText(
    `frame=${s.frame}  t=${s.t.toFixed(3)}s  beat=${s.beat.toFixed(3)}`,
    40 + jx,
    s.H - 40 + jy,
  );
  ctx.restore();
}
