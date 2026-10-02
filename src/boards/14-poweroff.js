/**
 * 14-poweroff.js — SHOT-14 关机
 * 3:27.23 – 3:32.00
 *
 * 复刻参考片的收尾：**电源按钮熄灭 → `void` → 黑**。
 * 和 SHOT-01 的开机对称（等于首尾可循环）。
 */

import {
  clamp01,
  lerp,
  easeOutCubic } from "../core/kernel.js";
import { UI,
  desk,
  powerButton,
  label,
  pun,
  rgba,
  TYPE,
  cameraShake,
  popIn,
  shockLight,
  particleBurst,
} from "./_ui.js";

export const meta = {
  id: "shot-14",
  z: 163,
  startMs: 207229,
  endMs: 212000,
  fade: { fadeInMs: 250, fadeOutMs: 900 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const ms = s.ms;
  const t0 = 207229;
  const p = clamp01((ms - t0) / 2400); // 熄灭进度
  const out = clamp01((ms - t0 - 2600) / 1200);

  desk(ctx, s, { stripes: true });
  // B5 关机瞬间轻抖（t0 + 2200, "void" 出现时）：和 shot-01 开机对称
  cameraShake(ctx, s, 10, 100, t0 + 2200);
  // B3 + B4 关机瞬间从按钮位置扩散
  shockLight(ctx, s, 960, 520, t0 + 2200, { maxR: 320, durMs: 700, color: UI.red, width: 2 });
  particleBurst(ctx, s, 960, 520, t0 + 2200, { n: 16, speed: 380, size: 2.5, durMs: 500, color: UI.red, seedCh: 200 });

  // 电源按钮：亮 → 灭（外圈收缩）
  const pbX = 960;
  const pbY = 520;
  // B1 电源按钮 pop-in：和 shot-01 开机对称
  powerButton(ctx, s, pbX, pbY, 78, {
    on: true,
    glow: (1 - p) * 0.8,
    scale: popIn(s, t0, 500, 0.85, 1.8),
  });
  if (p > 0) {
    for (const [m, a] of [
      [1.3, 0.18],
      [1.1, 0.3],
    ]) {
      ctx.save();
      ctx.strokeStyle = rgba(UI.text, a * (1 - p));
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(pbX, pbY, 64 * m * lerp(1, 0.2, easeOutCubic(p)), -Math.PI * 0.28, Math.PI * 1.28);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 读数：一点点掉到 0
  label(ctx, s, 80, 112, `power: ${String(Math.round((1 - p) * 100)).padStart(3, " ")}%`, p > 0.6 ? UI.red : null, 22, 0.75, 600);
  label(ctx, s, 80, 96, `plugged: ${p < 0.2 ? "yes" : "no"}`, null, TYPE.SUB, 0.45);
  pun(ctx, s, 80, 1030, "unplugged — the cache keeps running", 18, 0.45 * (1 - out));

  // void
  if (ms >= t0 + 2200) {
    const vp = clamp01((ms - t0 - 2200) / 800);
    label(ctx, s, 960 - 60, 700, "void", null, 40, 0.5 * vp, 600);
  }

  // 全黑
  if (out > 0) {
    ctx.save();
    ctx.fillStyle = rgba(UI.ink, out);
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
  }
}
