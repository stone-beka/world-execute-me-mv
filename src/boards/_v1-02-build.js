/**
 * 02-build.js — SHOT-02 机器开始构建虚拟世界
 * 0:12.46 – 0:30.00（段落表第 2 块）
 *
 * 承接 SHOT-01 结尾的等待框：进度走完 → 终端打开 → 世界一块块长出来 → 摊平成地面。
 * 时间锚点全部来自歌词表：And let's begin the simulation / world.execute(me); / If I'm a set of points
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutExpo } from "../core/kernel.js";
import { MS_PER_BEAT, beatToMs } from "../core/timeline.js";
import {
  bg,
  ecg,
  groundShadow,
  flashRing,
  waitBox,
  terminal,
  label,
  polyline,
  pun,
} from "./_motifs.js";

export const meta = {
  id: "shot-02",
  z: 151,
  startMs: 12460, // 硬接 SHOT-01（被等待框遮住）
  endMs: 30248, // = 03 的起点 + 250ms 交叠
  fade: { fadeInMs: 0, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, beat) => L.find(q)[0]?.start ?? beatToMs(beat);
  const a1 = at("And let's begin the simulation", 4);
  const a2 = at("world.execute(me);", 8);
  const a3 = at("If I'm a set of points", 16);
  const ms = s.ms;

  bg(ctx, s, { camY: 0, beams: true });

  // ---- 心跳曲线（母题）在底部走 ----
  ecg(ctx, s, { x0: 80, x1: 1840, y: 900, amp: 46, width: 2, speed: 0.3 });

  // ---- ① 等待框收尾（承接 01）----
  if (ms < a1 + 500) {
    const boxP = clamp01((ms - 12460) / 300);
    waitBox(ctx, s, CX, 480, boxP, ms, { title: "executing", heartSlot: true });
    // 进度条走完的那一下：外扩一圈
    flashRing(ctx, s, CX, 480, 200, clamp01((ms - a1 + 200) / 600), s.colors.accent, 3);
  }

  // ---- ② 世界一块块长出来（1/8 拍一块）----
  const floorY = 760;
  const growP = clamp01((ms - a1 - 200) / (a2 - a1 - 400));
  const litCount = Math.floor(((ms - a1) / (MS_PER_BEAT / 2)) );
  const N = 5;
  const cell = 150;
  const x0 = CX - ((N - 1) * cell) / 2;
  const flatten = easeOutCubic(clamp01((ms - a2 - 400) / 1200)); // 摊平成地面

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      if (idx >= litCount) continue;
      const gx = x0 + i * cell;
      const gy = floorY - j * 74;
      const rise = easeOutBack2(clamp01((ms - a1 - idx * (MS_PER_BEAT / 2)) / 420));
      const h = lerp(120, 10, flatten) * rise;
      wireBox(ctx, s, gx, gy, cell * 0.72, h, 26, 0.75 * (1 - flatten * 0.5));
    }
  }

  // 地面被点亮
  if (flatten > 0) {
    groundShadow(ctx, s, CX, floorY + 30, 520 * flatten, 70 * flatten, 0.9 * flatten, s.colors.accent);
  }

  // ---- ③ 终端：机器在敲命令 ----
  const termP = easeOutCubic(clamp01((ms - a1 - 400) / 700));
  if (termP > 0) {
    ctx.save();
    ctx.globalAlpha *= termP;
    const ly = terminal(ctx, s, 96, 150, 620, 210, {
      title: "sh — build",
      lines: [
        ["$ world.execute(me);", a1 + 500],
        ["> creating world...", a1 + 1400],
        ["  objects: " + String(Math.max(0, litCount)).padStart(3, "0"), a1 + 1800, s.colors.accent],
      ],
      typing: 34,
    });
    if (ms > a2) {
      ctx.font = s.mono(24);
      ctx.fillStyle = rgba(s.colors.fg, 0.75);
      ctx.fillText("> world created", 120, ly);
      // 双关：这是全片的标题句，也是全片的判决
      pun(ctx, s, 120, ly + 30, "run me — or kill me", 18, 0.6);
    }
    ctx.restore();
  }

  // ---- ④ 交给 03：点开始散开 ----
  const scatterP = clamp01((ms - a3 + 600) / 1400);
  if (scatterP > 0) {
    const n = Math.floor(140 * scatterP);
    for (let i = 0; i < n; i++) {
      const ang = s.rnd(1200 + i) * Math.PI * 2;
      const r = 40 + s.rnd(1300 + i) * 300;
      const x = CX + Math.cos(ang) * r;
      const y = floorY - 200 + Math.sin(ang) * r * 0.5;
      ctx.fillStyle = rgba(s.colors.accent, 0.5 * scatterP);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // 母题：拖线跟着一颗点往外走
    polyline(ctx, s, [
      [CX, floorY - 200],
      [CX + 120 * scatterP, floorY - 240 - 60 * scatterP],
    ], { hex: s.colors.accent, width: 2, alpha: 0.6 });
  }

  label(ctx, s, 80, 60, `shot-02  build   f=${s.frame}  beat=${s.beat.toFixed(1)}`, s.colors.fg, 16, 0.35);
}

/** 线框盒：底面 + 抬高的顶面 + 四条竖线（3D 感），h 变小时摊平成地砖 */
function wireBox(ctx, s, x, y, w, h, dy, alpha) {
  ctx.save();
  ctx.strokeStyle = rgba(s.colors.accent, alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  // 底面
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + dy);
  ctx.lineTo(x, y + dy);
  ctx.closePath();
  // 顶面
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y - h);
  ctx.lineTo(x + w, y - h + dy);
  ctx.lineTo(x, y - h + dy);
  ctx.closePath();
  // 竖线
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x + w, y + dy],
    [x, y + dy],
  ]) {
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - h);
  }
  ctx.stroke();
  ctx.restore();
}

function easeOutBack2(t) {
  const s = 1.70158;
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}
