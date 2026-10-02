/**
 * 14-unplug.js — SHOT-14 拔插头，充电环归零
 * 3:27.23 – 3:32.00（段落表第 14 块：导演指定「可以弄个插头拔掉，充电环归零」）
 *
 * 和 SHOT-01 对称收尾：插头被拔出来 → 充电环从 100% 掉到 0% → 光池熄灭 →
 * 画面收黑，只剩一颗闪烁的光标。这样片尾和片头对得上（可循环）。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { bg, chargingRing, groundShadow, lightPool, plug, label, flashRing, pun } from "./_motifs.js";

export const meta = {
  id: "shot-14",
  z: 163,
  startMs: 207229,
  endMs: 212000,
  fade: { fadeInMs: 250, fadeOutMs: 900 }, // 结束前淡到黑
  tags: ["film", "shot"],
};

const CX = 960;
const CY = 560;

export function draw(ctx, s) {
  const ms = s.ms;
  const t0 = 207229;
  const p = clamp01((ms - t0) / 2400); // 拔插头的进度
  const drain = clamp01((ms - t0 - 900) / 2600); // 掉电

  bg(ctx, s, { camY: 0, beams: true, grid: true });
  lightPool(ctx, s, CX, CY, 250, (1 - drain) * 0.9, ms, { beams: 4 });

  const r = 250;
  groundShadow(ctx, s, CX, CY + r * 0.92, r * 1.15, r * 0.16, 1 - drain * 0.8, s.colors.accent);
  chargingRing(ctx, s, CX, CY, r, 1 - drain, ms);

  // ---- 插头被拔出来：往左移，边移边熄 ----
  const plugX = lerp(CX - 320, 180, easeOutCubic(p));
  ctx.save();
  ctx.globalAlpha = 1 - drain * 0.7;
  plug(ctx, plugX, CY, s.colors.fg);
  ctx.restore();

  // ---- 电源线：拔掉之后断掉（线头两个小点）----
  ctx.save();
  ctx.strokeStyle = rgba(s.colors.fg, 0.25 * (1 - drain));
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(180, CY);
  ctx.lineTo(plugX - 54, CY);
  ctx.stroke();
  ctx.restore();

  // 拔掉那一刻：闪一下
  flashRing(ctx, s, CX - 250, CY, 120, clamp01((p - 0.85) / 0.15), s.colors.danger, 4);

  // ---- 掉电读数 ----
  const pct = Math.round((1 - drain) * 100);
  label(ctx, s, 80, 60, `power: ${String(pct).padStart(3, " ")}%`, pct > 40 ? s.colors.accent : s.colors.warn, 24, 0.8, 600);
  label(ctx, s, 80, 96, `plugged: ${p < 1 ? "yes" : "no"}`, s.colors.fg, 20, 0.5);
  pun(ctx, s, 80, 940, "unplugged — the cache keeps running", 18, 0.5 * (1 - drain));

  // ---- 最后：只剩一颗光标 ----
  const endP = clamp01((ms - t0 - 4600) / 800);
  if (endP > 0) {
    ctx.save();
    ctx.fillStyle = rgba(s.colors.bg, endP * 0.95);
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
    ctx.fillStyle = rgba(s.colors.accent, s.beatPhase < 0.5 ? 0.9 * endP : 0.1 * endP);
    ctx.font = s.mono(40, 700);
    ctx.fillText("_", 940, 600);
  }
}
