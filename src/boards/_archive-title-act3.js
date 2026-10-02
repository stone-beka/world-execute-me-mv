/**
 * _archive-title-act3.js — 【留档】`02-title.js` 原来的第三幕
 *
 * 2026-09-29 被「棋子在中间两侧对弈」替换（用户要求：对弈要延续到 30s，
 * 把 17–30s 原来的动画换掉，旧的可留档）。
 *
 * 这里保存的是**替换前那一刻的原样代码**：`world.execute(me);` 之后
 * 世界一块块装起来（9 个等轴测立方体）→ 连成一张网 + 数据包 → 日志控制台，
 * 最后点云让位给 shot-03。
 *
 * 为什么还留着：
 *   1. 万一要回滚 / A-B 对比，这里是**可运行**的，不是注释；
 *   2. 它是「同一套语汇把画面铺满」的一个参考实现。
 *
 * 怎么重新启用：在 `02-title.js` 里 import 并调用 `drawLegacyAct3(ctx, s, { tCmd, tPts })`。
 * 注意本文件以 `_` 开头 → 不被注册表加载（不会进片子），只作参考。
 */

import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI, wireCube, logConsole, label, rgba } from "./_ui.js";

/**
 * 画原来的第三幕（立方体装配 → 连线/数据包/日志 → 点云交接）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} s 画板状态包
 * @param {{tCmd:number, tPts:number}} opt tCmd = `world.execute(me);` 时刻，tPts = `If I'm a set of points` 时刻
 */
export function drawLegacyAct3(ctx, s, opt = {}) {
  const ms = s.ms;
  const tCmd = opt.tCmd ?? beatToMs(32);
  const tPts = opt.tPts ?? beatToMs(48);

  // ---------- 第三幕：世界开始出现（等轴测立方体一块块装上去）----------
  const cubeAt = (i) => [300 + (i % 3) * 150, 300 + Math.floor(i / 3) * 130];
  const asm = clamp01((ms - tCmd - 1200) / 5000);
  const n = Math.floor(asm * 9);

  // 交给 03 的进度：点云一进场，第三幕整体让位（1 → 0）
  const hand = clamp01((ms - tPts + 500) / 1200);
  const worldAlpha = Math.max(0, 1 - hand);

  ctx.save();
  ctx.globalAlpha = worldAlpha;

  for (let i = 0; i < n; i++) {
    const [gx, gy] = cubeAt(i);
    const e = easeOutCubic(clamp01((asm * 9 - i) / 1));
    ctx.save();
    ctx.globalAlpha *= e;
    wireCube(ctx, s, gx, gy, 110, 0, UI.text);
    ctx.restore();
  }

  // ---------- 第三幕·续：把 9 块连成一张网，并打日志 --------------
  const EDGES = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      if (c < 2) EDGES.push([i, i + 1]);
      if (r < 2) EDGES.push([i, i + 3]);
    }
  }
  const tLink = tCmd + 5400; // ≈ 21.4s：装配刚完成
  const linkP = clamp01((ms - tLink) / 4600); // 连线长满 ≈ 26.0s
  const breathe = s.noise(ms * 0.0006, 11); // 常驻微动

  if (ms < tLink) {
    if (n > 0) label(ctx, s, 300, 160, `objects: ${n}`, null, 20, 0.5);
  } else {
    ctx.save();
    ctx.translate(0, (breathe - 0.5) * 6);
    ctx.lineWidth = 2;
    for (let k = 0; k < EDGES.length; k++) {
      const e = easeOutCubic(clamp01(linkP * EDGES.length - k));
      if (e <= 0) continue;
      const [ax, ay] = cubeAt(EDGES[k][0]);
      const [bx, by] = cubeAt(EDGES[k][1]);
      ctx.strokeStyle = `rgba(233,233,236,${0.1 + 0.14 * e})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // 数据包：在已连上的边上循环跑，永不停止
      const u = (ms / (1500 + (k % 3) * 240) + k * 0.17) % 1;
      ctx.fillStyle = rgba(UI.blue, 0.85 * e);
      ctx.fillRect(lerp(ax, bx, u) - 2, lerp(ay, by, u) - 2, 4, 4);
    }
    ctx.restore();

    const links = Math.min(EDGES.length, Math.floor(linkP * EDGES.length + 1e-6));
    label(ctx, s, 300, 160, `objects: 9   links: ${links}`, null, 20, 0.5);

    // 日志落在真实音符上（每 2 拍一条；beat 47 ≈ 22.15s → beat 61 ≈ 28.61s）
    logConsole(ctx, s, 300, 700, 620, {
      size: 20,
      lines: [
        ["> allocating world", beatToMs(47)],
        ["> mount /world", beatToMs(49)],
        ["> objects: 9 ......... ok", beatToMs(51)],
        ["> linking nodes", beatToMs(53)],
        ["> topology: lattice", beatToMs(55)],
        ["> love := null", beatToMs(57)],
        ["> simulate()", beatToMs(59)],
        ["> ...", beatToMs(61)],
      ],
    });
  }

  ctx.restore();

  // ---------- 交给 03：点 ----------
  if (hand > 0) {
    for (let i = 0; i < 160; i++) {
      const a = s.noise(i * 7.7, 1) * Math.PI * 2;
      const r = 60 + s.noise(i * 13.1, 2) * 520 * hand;
      ctx.fillStyle = `rgba(233,233,236,${0.5 * hand})`;
      ctx.fillRect(960 + Math.cos(a) * r, 460 + Math.sin(a) * r * 0.6, 3, 3);
    }
  }
}
