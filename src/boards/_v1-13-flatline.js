/**
 * 13-flatline.js — SHOT-13 颜文字消失，心跳线变平
 * 3:12.46 – 3:27.23（段落表第 13 块：导演指定「颜文字消失，心跳线显示变」）
 *
 * 这一块几乎全是器乐，只有结尾 3:25.96 一句 "Execution"。
 *   前半：剩下的颜文字**一个一个消失**（像被清空的对象表）
 *   中段：底部的读板在变 —— `status: alive → waiting → flatline`
 *   结尾：那句 "Execution" 打下来 → 心跳拉成一条直线（flatline），画面几乎全黑
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { beatToMs, MS_PER_BEAT } from "../core/timeline.js";
import { bg, ecg, face, label, lightPool, flashRing, pun, FACES } from "./_motifs.js";

export const meta = {
  id: "shot-13",
  z: 162,
  startMs: 192460,
  endMs: 207429,
  fade: { fadeInMs: 250, fadeOutMs: 400 },
  tags: ["film", "shot"],
};

const COLS = 5;
const ROWS = 3;

export function draw(ctx, s) {
  const L = s.lyrics;
  const ms = s.ms;
  const t0 = 192460;
  const tLast = L.find("Execution")[0]?.start ?? beatToMs(30); // 3:25.96 那句
  const spread = 0.55; // 前 55% 的时间用来"清空"

  bg(ctx, s, { camY: 0, beams: false, glyphs: true });
  lightPool(ctx, s, 960, 520, 200, 0.5 * (1 - clamp01((ms - tLast) / 1200)), ms, { beams: 2 });

  // ---- 颜文字一个一个消失 ----
  const gone = clamp01((ms - t0) / ((tLast - t0) * spread));
  const total = COLS * ROWS;
  const cw = 300;
  const ch = 170;
  const x0 = 960 - ((COLS - 1) * cw) / 2;
  const y0 = 430;
  for (let i = 0; i < total; i++) {
    const order = (i * 7) % total; // 打乱顺序，但不是随机
    const t = clamp01(gone * total - order);
    if (t >= 1) continue;
    const x = x0 + (i % COLS) * cw;
    const y = y0 + Math.floor(i / COLS) * ch;
    const alpha = (1 - t) * 0.8;
    if (t > 0.4) {
      // 消失的过程：缩小 + 变红
      const k = lerp(1, 0.2, easeOutCubic((t - 0.4) / 0.6));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      face(ctx, s, 0, 0, 44, FACES.dead[order % FACES.dead.length], s.colors.danger, alpha);
      ctx.restore();
      flashRing(ctx, s, x, y, 40, (t - 0.4) / 0.6, s.colors.danger, 2);
    } else {
      face(ctx, s, x, y, 44, FACES.alive[order % FACES.alive.length], s.colors.fg, alpha);
    }
  }
  label(ctx, s, 80, 60, `objects: ${Math.max(0, total - Math.round(gone * total))} / ${total}`, s.colors.fg, 22, 0.6);

  // ---- 读板（"显示变"）----
  const flat = clamp01((ms - tLast) / 1400);
  const status = flat > 0.9 ? "flatline" : ms > tLast ? "waiting" : gone > 0.95 ? "waiting" : "alive";
  const col = status === "flatline" ? s.colors.danger : status === "waiting" ? s.colors.warn : s.colors.accent;
  ctx.save();
  ctx.strokeStyle = rgba(s.colors.fg, 0.4);
  ctx.lineWidth = 3;
  ctx.strokeRect(80, 860, 560, 120);
  ctx.restore();
  label(ctx, s, 104, 898, "vitals", s.colors.fg, 20, 0.55);
  label(ctx, s, 240, 900, `status: ${status}`, col, 26, 0.95, 600);
  label(ctx, s, 104, 940, `bpm: ${status === "alive" ? Math.round(lerp(72, 40, gone)) : status === "waiting" ? 24 : 0}`, col, 22, 0.8);

  // ---- 心跳线：越来越乱，最后拉平 ----
  const speed = lerp(0.42, 0.05, gone) ;
  const at = ecg(ctx, s, { x0: 660, x1: 1840, y: 940, amp: lerp(34, 4, flat), width: 2.5, speed, periodBeats: lerp(2, 4.4, gone) });
  if (ms >= tLast) {
    // 那一下 "Execution"：尖峰 + 长直
    const spike = clamp01((ms - tLast) / 300);
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.danger, 0.9 * (1 - clamp01((ms - tLast) / 1600)));
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(960, 940);
    ctx.lineTo(960 + 40 * spike, 940 - 220 * (1 - spike));
    ctx.lineTo(1000 + 40 * spike, 940);
    ctx.stroke();
    ctx.restore();
    // 之后：一条直线
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.danger, 0.5 * flat);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(660, 940);
    ctx.lineTo(1840, 940);
    ctx.stroke();
    ctx.restore();
    label(ctx, s, 1040, 900, "flatline", s.colors.danger, 24, flat * 0.9, 700);
  }

  pun(ctx, s, 80, 1020, "the display changes before the machine does", 18, 0.5);

  // ---- 收黑 ----
  const dim = clamp01((ms - tLast - 600) / 3000);
  if (dim > 0) {
    ctx.save();
    ctx.fillStyle = rgba(s.colors.bg, dim * 0.85);
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
  }
}
