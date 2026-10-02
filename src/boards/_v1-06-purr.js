/**
 * 06-purr.js — SHOT-06 主歌 2 后半：猫的呼噜 / 我是唯一的神
 * 1:20.31 – 1:28.61（段落表第 6 块；导演留空，按"立意"延展）
 *
 * "If I'm a tabby cat → I will purr for your enjoyment"
 *   → 变成猫，整块画面**跟着呼噜震**（镜头微抖），右侧一根"enjoyment"条
 * "If I'm the only god → you're the proof of my existence"
 *   → 变成发光的神（辐射圈），一道细光**接到你那一格**：只有它照到你，
 *     神才算存在（光=存在证明）
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutBack } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { bg, ecg, face, icon, label, lightPool, flashRing, FACES, pun } from "./_motifs.js";

export const meta = {
  id: "shot-06",
  z: 155,
  startMs: 80306,
  endMs: 88864,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 700;
const CY = 520;

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tCat = at("If I'm a tabby cat", 4);
  const tPurr = at("Then I will purr for your enjoyment", 8);
  const tGod = at("If I'm the only god", 16);
  const tProof = at("Then you're the proof of my existence", 20);
  const ms = s.ms;

  // 呼噜：整块画面跟着震（镜头微抖，最大 4px）
  const purr = ms >= tPurr && ms < tGod ? 1 : 0;
  const shakeX = purr ? 3 * Math.sin(ms * 0.055) : 0;
  const shakeY = purr ? 2 * Math.sin(ms * 0.081) : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  bg(ctx, s, { camY: 0, beams: true });
  lightPool(ctx, s, CX, CY, 200, ms >= tGod ? 1 : 0.7, ms, { beams: ms >= tGod ? 6 : 3 });

  // 形状：猫 → 神
  const godP = clamp01((ms - tGod) / 500);
  const e = easeOutBack(clamp01((ms - tCat) / 400));
  if (godP < 1) {
    ctx.save();
    ctx.translate(CX, CY + 40);
    ctx.scale(e * (1 - godP), e * (1 - godP));
    icon(ctx, s, 0, 0, 260, "cat", s.colors.accent);
    ctx.restore();
  }
  if (godP > 0) {
    ctx.save();
    ctx.translate(CX, CY + 20);
    ctx.scale(e * godP, e * godP);
    icon(ctx, s, 0, 0, 280, "god", s.colors.warn);
    ctx.restore();
  }

  // 脸（母题）
  face(ctx, s, CX, CY - 200, 60, ms >= tGod ? FACES.alive[4] : FACES.alive[0], s.colors.fg, 0.95);

  // 呼噜声波
  if (purr) {
    const pts = [];
    for (let x = 0; x <= 900; x += 10) {
      const v = Math.sin(x / 26 + ms * 0.02) * (1 - x / 900) * 54 * (0.6 + 0.4 * Math.sin(ms * 0.006));
      pts.push([CX - 450 + x, CY + 250 - v]);
    }
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.accent, 0.7);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
    label(ctx, s, CX - 450, CY + 300, "purr ← 呼噜", s.colors.accent, 20, 0.8);
  }

  // 右侧：你那一格。存在证明就是从神连到它的一道光。
  const boxX = 1560;
  const boxY = CY - 70;
  ctx.save();
  ctx.strokeStyle = rgba(s.colors.fg, 0.5);
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(boxX, boxY, 150, 170);
  ctx.restore();
  label(ctx, s, boxX + 16, boxY - 14, "you", s.colors.fg, 22, 0.7);
  if (ms >= tProof) {
    const pp = clamp01((ms - tProof) / 900);
    const to = [boxX, boxY + 85];
    const from = [CX + 170, CY + 20];
    const ex = lerp(from[0], to[0], easeOutCubic(pp));
    const ey = lerp(from[1], to[1], easeOutCubic(pp));
    // 光束：三层叠加
    for (const [wMul, a] of [
      [4, 0.08],
      [2, 0.16],
      [1, 0.85],
    ]) {
      ctx.strokeStyle = rgba(s.colors.warn, a);
      ctx.lineWidth = 3 * wMul;
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    // 光照到的地方：那一格被点亮
    ctx.save();
    ctx.fillStyle = rgba(s.colors.warn, 0.18 * pp);
    ctx.fillRect(boxX, boxY, 150, 170);
    ctx.restore();
    label(ctx, s, boxX + 16, boxY + 200, `${Math.round(pp * 100)}% proof`, s.colors.warn, 20, 0.85, 700);
  }

  // 双关注释
  pun(ctx, s, CX - 170, CY + 360, ms >= tGod ? "you are the proof" : "purr, for your enjoyment", 18, 0.55);

  ctx.restore(); // 呼噜的镜头抖动

  ecg(ctx, s, { x0: 80, x1: 1840, y: 990, amp: 30, width: 2, speed: 0.34 });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
