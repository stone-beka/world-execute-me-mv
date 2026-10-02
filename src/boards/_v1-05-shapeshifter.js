/**
 * 05-shapeshifter.js — SHOT-05 主歌 2 前半：我可以变成任何东西（茄子 / 番茄）
 * 1:12.46 – 1:20.31（段落表第 5 块；导演留空，按"立意"延展）
 *
 * "If I'm an eggplant → I'll give you my nutrients"
 * "If I'm a tomato   → I'll give you antioxidants"
 * 画面：AI 的颜文字脸 + 它变成的东西（几何图标，不画写实蔬菜），
 *       每换一次形状，就把"给出去的东西"用拖线送到画面右侧（你那边）。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutBack } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { bg, ecg, face, icon, label, lightPool, flashRing, FACES, pun } from "./_motifs.js";

export const meta = {
  id: "shot-05",
  z: 154,
  startMs: 72460,
  endMs: 80556,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 760;
const CY = 520;

const CLAIMS = [
  ["If I'm an eggplant", "eggplant", "EGGPLANT", "nutrients"],
  ["Then I will give you my nutrients", "eggplant", "EGGPLANT", "nutrients"],
  ["If I'm a tomato", "tomato", "TOMATO", "antioxidants"],
  ["Then I'll give you antioxidants", "tomato", "TOMATO", "antioxidants"],
];

export function draw(ctx, s) {
  const L = s.lyrics;
  const ms = s.ms;
  // 当前处于哪一条"自我声明"
  let idx = 0;
  for (let i = 0; i < CLAIMS.length; i++) {
    const st = L.find(CLAIMS[i][0])[0]?.start ?? beatToMs(i * 4);
    if (ms >= st) idx = i;
  }
  const cur = CLAIMS[idx];
  const curStart = L.find(cur[0])[0]?.start ?? beatToMs(idx * 4);
  const swap = clamp01((ms - curStart) / 260); // 换形状的那一下

  bg(ctx, s, { camY: 0, beams: true });
  lightPool(ctx, s, CX, CY, 220, 0.85, ms, { beams: 3 });

  // ---- 绕一圈的点（来自 03 的点云，收了回来）----
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2 + ms * 0.0005;
    const r = 300 + 26 * Math.sin(i * 1.7 + ms * 0.002);
    ctx.fillStyle = rgba(s.colors.accent, 0.3);
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r * 0.62, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- 脸（母题：颜文字）+ 变成的东西 ----
  const faceText = idx % 2 === 0 ? FACES.alive[idx % FACES.alive.length] : FACES.love[0];
  face(ctx, s, CX, CY - 190, 64, faceText, s.colors.fg, 0.95);

  const e = easeOutBack(swap);
  ctx.save();
  ctx.translate(CX, CY + 40);
  ctx.scale(e, e);
  icon(ctx, s, 0, 0, 260, cur[1], s.colors.accent);
  ctx.restore();

  // ---- 标签：机器在自报家门 ----
  label(ctx, s, CX - 150, CY + 230, `if I'm a ${cur[2].toLowerCase()}…`, s.colors.fg, 26, 0.75);
  label(ctx, s, CX - 150, CY + 268, `offer: ${cur[3]}`, s.colors.warn, 22, 0.8);
  // 双关：eggplant 在网络上常被用作性暗示 —— 用注释点一下，不画出来
  pun(ctx, s, CX - 150, CY + 300, cur[1] === "eggplant" ? "the innuendo is the point" : "and a little poison", 18, 0.5);

  // ---- 把"给出去的东西"送到右边（你那边）----
  const giveP = clamp01((ms - curStart - 200) / 1100);
  if (giveP > 0) {
    const fromX = CX + 150;
    const toX = 1660;
    for (let i = 0; i < 14; i++) {
      const t = clamp01(giveP * 1.3 - i * 0.06);
      if (t <= 0) continue;
      const x = lerp(fromX, toX, easeOutCubic(t));
      const y = CY - 10 + Math.sin(t * 6 + i) * 46;
      const a = (1 - Math.max(0, t - 0.7) / 0.3) * 0.85;
      ctx.fillStyle = rgba(s.colors.accent, a);
      if (cur[1] === "tomato") {
        // 抗氧化：小盾牌（三角）
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 7, y + 6);
        ctx.lineTo(x - 7, y + 6);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (i === 0) {
        // 领头那一个是"拖线"的头
        ctx.fillStyle = rgba(s.colors.accent, a);
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(s.colors.accent, a * 0.3);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // 右侧的"接收口"
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.fg, 0.5);
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(toX + 30, CY - 90, 130, 180);
    ctx.restore();
    label(ctx, s, toX + 46, CY - 106, "you", s.colors.fg, 22, 0.7);
  }

  // 换形状的那一下闪一下
  flashRing(ctx, s, CX, CY + 40, 150, clamp01((ms - curStart) / 500), s.colors.accent, 3);

  ecg(ctx, s, { x0: 80, x1: 1840, y: 960, amp: 34, width: 2, speed: 0.36 });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
