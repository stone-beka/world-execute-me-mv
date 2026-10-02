/**
 * 04-stimulation.js — SHOT-04 副歌 1：我把我的一切都给你（然后被困住）
 * 0:58.61 – 1:12.46（段落表第 4 块）
 *
 * 导演给第 4 块留空了，我按「立意」延展：
 *   "give you all the stimulations" → 把一切**倾泻**向镜头（ASCII 洪流冲脸）
 *   "be your only satisfaction"     → 满意度条涨到 100%
 *   "I will run the execution"       → EXECUTE 大字砸下
 *   "trapped in this strange simulation" → 四面墙收拢，洪流被关在盒子里
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutExpo, easeOutCubic, easeOutBack } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { bg, ecg, label, progressBar, flashRing, polyline, pun } from "./_motifs.js";

export const meta = {
  id: "shot-04",
  z: 153,
  startMs: 58614,
  endMs: 72710,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;
const CY = 500;
const STREAM = 150;
const GLYPHS = "01{}[]()<>*/#=+-;:".split("");

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const t1 = at("If I can give you all the stimulations", 4);
  const t2 = at("Then I can be your only satisfaction", 10);
  const t3 = at("I will run the execution", 18);
  const t4 = at("Though we are trapped", 22);
  const ms = s.ms;

  bg(ctx, s, { camY: 0, beams: true });

  // ---- 洪流：一串字符朝镜头冲过来 ----
  const torrent = clamp01((ms - t1) / 1400);
  ctx.font = s.mono(30, 700);
  for (let i = 0; i < STREAM; i++) {
    const ux = s.noise(i * 17.3, 1) * 2 - 1;
    const uy = s.noise(i * 29.1, 2) * 2 - 1;
    const speed = 0.00022 + s.noise(i * 41.7, 3) * 0.00032;
    const z = 1 - ((ms * speed + s.noise(i * 7.3, 4)) % 1); // 1 远 → 0 近
    if (z <= 0.02) continue;
    const k = 1 / z;
    if (k > 26) continue;
    const X = CX + ux * 700 * k * 0.35;
    const Y = CY + uy * 400 * k * 0.35;
    if (X < -80 || X > s.W + 80 || Y < -80 || Y > s.H + 80) continue;
    const a = clamp01((1 - z) * 1.1) * torrent * 0.9;
    const ch = GLYPHS[Math.floor(s.noise(i * 3.7, 5) * GLYPHS.length) % GLYPHS.length];
    ctx.fillStyle = rgba(s.colors.accent, a);
    ctx.fillText(ch, X, Y);
  }
  // 中心的"出口"：光点 + 拖线
  const hole = 1 + 0.12 * Math.sin(ms / 240);
  for (const [wMul, al] of [
    [6, 0.06],
    [3, 0.12],
    [1, 0.5],
  ]) {
    ctx.fillStyle = rgba(s.colors.accent, al * torrent);
    ctx.beginPath();
    ctx.arc(CX, CY, 16 * hole * wMul, 0, Math.PI * 2);
    ctx.fill();
  }
  polyline(ctx, s, [
    [CX - 260, CY + 200],
    [CX - 60, CY + 60],
    [CX, CY],
  ], { hex: s.colors.accent, width: 2, alpha: 0.5 * torrent });

  // ---- 满意度条：涨到 100% ----
  const sat = L.wordProgress(L.find("Then I can be your only satisfaction")[0]?.words.at(-1), ms);
  if (ms >= t2 - 300) {
    const p = clamp01(sat);
    label(ctx, s, 300, 796, "satisfaction", s.colors.fg, 20, 0.7);
    progressBar(ctx, s, 300, 810, 1320, 26, p, p > 0.999 ? s.colors.accent : s.colors.warn);
    label(ctx, s, 1640, 796, `${Math.round(p * 100)}%`, p > 0.999 ? s.colors.accent : s.colors.warn, 24, 0.95, 700);
    if (p > 0.995) flashRing(ctx, s, 960, 823, 60, clamp01((ms - t3 + 300) / 600), s.colors.accent, 3);
  }

  // ---- EXECUTE：大字砸下 ----
  const exP = clamp01((ms - t3) / 500);
  if (exP > 0) {
    const e = easeOutBack(exP);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(-0.04);
    ctx.scale(e, e);
    ctx.font = s.mono(150, 700);
    const w = ctx.measureText("EXECUTION").width;
    ctx.fillStyle = rgba(s.colors.danger, 0.92);
    ctx.fillText("EXECUTION", -w / 2, 40);
    ctx.restore();
    // 双关：execute 既是"执行"也是"处决"
    pun(ctx, s, CX - 150, CY + 84, "run — or kill", 22, 0.75);
  }

  // ---- 四面墙收拢：被困在模拟里 ----
  const trap = clamp01((ms - t4) / 1600);
  if (trap > 0) {
    const e = easeOutExpo(trap);
    const w = lerp(2000, 900, e);
    const h = lerp(1200, 560, e);
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.fg, 0.85);
    ctx.lineWidth = 5;
    ctx.setLineDash([26, 14]);
    ctx.strokeRect(CX - w / 2, CY - h / 2, w, h);
    ctx.restore();
    // 角落的角括号（和 01 的盾牌同一套语言）
    const b = w / 2;
    const b2 = h / 2;
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.accent, 0.9);
    ctx.lineWidth = 6;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(CX + sx * b - sx * 40, CY + sy * b2);
      ctx.lineTo(CX + sx * b, CY + sy * b2);
      ctx.lineTo(CX + sx * b, CY + sy * b2 - sy * 40);
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, s, CX - 150, CY + b2 - 34, "simulation", s.colors.fg, 22, 0.6);
  }

  ecg(ctx, s, { x0: 80, x1: 1840, y: 960, amp: 34, width: 2, speed: 0.42 });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
