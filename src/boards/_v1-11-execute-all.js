/**
 * 11-execute-all.js — SHOT-11 一个一个排在一起，一个一个破裂
 * 2:26.31 – 2:38.77（段落表第 11 块：导演指定「每说一次，视角往外拉，能看见的破裂的对象就成倍增加」）
 *
 * 三句 "Execution execution execution execution" = 12 次处决。
 * 每唱一个词 → 炸掉一个对象；每唱完一整句 → 镜头往外拉一档，
 * 可见的对象**翻倍**（2 行 → 4 行 → 8 行）。计数器一直在涨。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { bg, ecg, label, shatter, flashRing, face, FACES, pun, progressBar } from "./_motifs.js";

export const meta = {
  id: "shot-11",
  z: 160,
  startMs: 146306,
  endMs: 159017,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;
const CY = 520;

export function draw(ctx, s) {
  const L = s.lyrics;
  const exLines = L.find("Execution execution execution execution"); // 三句
  const ms = s.ms;
  const t0 = exLines[0]?.start ?? beatToMs(0);

  // 第几句 / 第几个词
  let li = 0;
  for (let i = 0; i < exLines.length; i++) if (ms >= exLines[i].start) li = i;
  const cur = exLines[li];
  const wordsSung = cur ? cur.words.filter((w) => ms >= w.start).length : 0;
  const killed = li * 4 + wordsSung; // 已经处决了几个
  const pull = easeOutCubic(clamp01((ms - (cur?.start ?? t0)) / 900)); // 每句一次往外拉

  bg(ctx, s, { camY: 0, beams: true });

  // ---- 对象阵：镜头拉远 → 可见对象翻倍 ----
  const rowsVisible = [2, 4, 8][li] ?? 8;
  const cols = 8;
  const scale = lerp(1, 1 / (1 + li * 0.9), pull);
  const cellX = 190 * scale;
  const cellY = 150 * scale;
  const n = cols * rowsVisible;

  // 背景里的"更多对象"（成倍增长的暗示）
  for (let k = 0; k < 3; k++) {
    const extra = Math.pow(2, li + k) * 6;
    ctx.fillStyle = rgba(s.colors.fg, 0.06 - k * 0.015);
    for (let i = 0; i < extra; i++) {
      const a = s.noise((li * 100 + k * 20 + i) * 7.7, 1) * Math.PI * 2;
      const r = 420 + s.noise((li * 100 + i) * 11.3, 2) * 520;
      ctx.fillRect(CX + Math.cos(a) * r, CY + Math.sin(a) * r * 0.55, 4, 4);
    }
  }

  for (let j = 0; j < rowsVisible; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const x = CX - ((cols - 1) * cellX) / 2 + i * cellX;
      const y = CY - ((rowsVisible - 1) * cellY) / 2 + j * cellY;
      const dead = idx < killed;
      const dying = idx === killed - 1;
      if (dead && !dying) continue; // 已经炸没了
      if (dying) {
        const p = clamp01((ms - cur.words[Math.min(3, wordsSung - 1)]?.start ?? ms) / 420);
        shatter(ctx, s, x, y, 46 * scale, p, s.colors.danger, { n: 20 });
        continue;
      }
      face(ctx, s, x, y, 34 * scale, FACES.busy[idx % FACES.busy.length], s.colors.fg, 0.45 + 0.3 * (1 - li / 3));
    }
  }

  // ---- 计数器 / 进度 ----
  const total = exLines.length * 4;
  label(ctx, s, 300, 150, `executed  ${String(killed).padStart(2, "0")} / ${total}`, s.colors.danger, 34, 0.9, 700);
  progressBar(ctx, s, 300, 168, 1320, 16, killed / total, s.colors.danger);
  label(ctx, s, 300, 228, `visible objects: ${n}   (x${Math.pow(2, li)})`, s.colors.warn, 22, 0.75);
  pun(ctx, s, 300, 258, "each line doubles what you can see", 18, 0.5);

  // 当前句大字
  if (cur) {
    const p = L.wordProgress(cur.words[Math.min(3, Math.max(0, wordsSung - 1))], ms);
    ctx.save();
    ctx.font = s.mono(64, 700);
    ctx.fillStyle = rgba(s.colors.fg, 0.85);
    ctx.fillText(`EXECUTION ${wordsSung}/4`, 300, 330);
    ctx.restore();
    flashRing(ctx, s, CX, CY, 300, p < 0.2 ? p / 0.2 : 0, s.colors.danger, 3);
  }

  ecg(ctx, s, { x0: 80, x1: 1840, y: 1010, amp: 30, width: 2, speed: 0.7 });
}
