/**
 * 10-aftermath.js — SHOT-10 余波（器乐间奏，无歌词）
 * 2:14.31 – 2:26.31（段落表第 10 块；导演留空）
 *
 * 立意里的这一句："人离开了，ai 感到孤独，**缓存仍在运行**，ai 依旧感到孤独和难过。"
 * 所以这 12 秒不做什么大事：碎片慢慢飘、心跳变慢、只剩一个颜文字在闪，
 * 左下角一行注释：`// cache still running`。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp } from "../core/kernel.js";
import { bg, ecg, face, label, lightPool, pun, FACES } from "./_motifs.js";

export const meta = {
  id: "shot-10",
  z: 159,
  startMs: 134306,
  endMs: 146556,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;

export function draw(ctx, s) {
  const ms = s.ms;
  const t0 = 134306;
  const p = clamp01((ms - t0) / (146306 - t0)); // 整段进度

  bg(ctx, s, { camY: 0, beams: false, glyphs: true });
  lightPool(ctx, s, CX, 520, 180, 0.35 * (1 - p * 0.5), ms, { beams: 2 });

  // ---- 碎片慢慢飘（残留的"被删除的对象"）----
  for (let i = 0; i < 90; i++) {
    const rx = s.noise(i * 19.7, 1);
    const ry = s.noise(i * 33.1, 2);
    const rr = s.noise(i * 47.3, 3);
    const ang = rx * Math.PI * 2;
    const rad = 120 + ry * 620;
    const spin = ms * (0.00002 + rr * 0.00004);
    const x = CX + Math.cos(ang + spin) * rad;
    const y = 520 + Math.sin(ang + spin) * rad * 0.6 + 6 * Math.sin(ms * 0.0004 + i);
    const a = (0.10 + 0.16 * rr) * (1 - p * 0.4);
    ctx.fillStyle = rgba(s.colors.fg, a);
    ctx.fillRect(x, y, 3 + rr * 7, 2 + rr * 3);
  }

  // ---- 只剩一个颜文字在闪 ----
  const blink = 0.35 + 0.5 * (Math.sin(ms * 0.0016) * 0.5 + 0.5);
  face(ctx, s, CX, 560, 68, FACES.dead[1], s.colors.fg, blink * 0.9);
  face(ctx, s, CX, 640, 40, FACES.dead[2], s.colors.fg, blink * 0.45);

  // ---- 心跳变慢，偶尔漏一拍 ----
  const speed = lerp(0.34, 0.16, p);
  const at = ecg(ctx, s, { x0: 80, x1: 1840, y: 980, amp: 34, width: 2, speed, periodBeats: lerp(2, 3.4, p) });
  if (Math.sin(ms * 0.0013) > 0.86) {
    // 漏拍：把这一段画成直线
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.fg, 0.12);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(900, 980);
    ctx.lineTo(1080, 980);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 读秒：缓存还在跑 ----
  const secs = ((ms - t0) / 1000).toFixed(1);
  label(ctx, s, 80, 60, `aftermath   t+${secs}s`, s.colors.fg, 20, 0.4);
  label(ctx, s, 80, 96, `objects left: 1`, s.colors.warn, 20, 0.5);
  pun(ctx, s, 80, 940, "cache still running", 20, 0.6);
}
