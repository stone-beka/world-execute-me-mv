/**
 * 09-delete.js — SHOT-09 终端里输入删除指令
 * 1:58.61 – 2:14.31（段落表第 9 块：导演指定「一个终端模样，然后输入删除其余对象的指令，然后对象破裂消失」）
 *
 * 双关：最后一句是 "You have made some illegal arguments" ——
 * 编程里的 illegal arguments（非法实参）和逻辑上的「不合法的论证」。
 * 所以终端**真的回一个 ERROR: illegal arguments**，整个画面转红。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { beatToMs, MS_PER_BEAT } from "../core/timeline.js";
import { bg, ecg, label, terminal, shatter, flashRing, face, FACES, pun, polyline } from "./_motifs.js";

export const meta = {
  id: "shot-09",
  z: 158,
  startMs: 118614,
  endMs: 134556,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const COLS = 7;
const ROWS = 4;

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tErase = at("If I can erase all the pointless fragments", 4);
  const tMaybe = at("Then maybe", 12);
  const tGod = at("Challenging your god", 20);
  const tIllegal = at("You have made some illegal arguments", 24);
  const ms = s.ms;

  bg(ctx, s, { camY: 0, beams: true });

  // ---- 对象网格（要被删掉的东西）----
  const gx0 = 720;
  const gy0 = 300;
  const cw = 170;
  const ch = 150;
  const eraseP = clamp01((ms - tErase - 900) / 2600); // 成波地删
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const idx = j * COLS + i;
      const x = gx0 + i * cw;
      const y = gy0 + j * ch;
      // 删除顺序：从左到右、从上到下（像 rm 走目录）
      const local = clamp01(eraseP * COLS * ROWS - idx);
      if (local >= 1) continue; // 已删干净：不留痕迹
      if (local > 0) {
        shatter(ctx, s, x + 40, y + 40, 60, local, s.colors.danger, { n: 22 });
      } else {
        face(ctx, s, x + 40, y + 40, 46, FACES.busy[idx % FACES.busy.length], s.colors.fg, 0.6);
      }
    }
  }

  // ---- 终端：敲删除指令 ----
  const lines = [
    ["$ if I can erase all the pointless fragments…", tErase + 200],
    ["$ rm --force /others/*", tErase + 1500, s.colors.danger],
    [`  deleted ${Math.round(eraseP * 100)}%`, tMaybe + 200, s.colors.accent],
  ];
  if (ms >= tGod - 400) lines.push(["$ define god", tGod]);
  if (ms >= tIllegal - 700) lines.push(["! ERROR: illegal arguments", tIllegal - 500, s.colors.danger]);
  const ly = terminal(ctx, s, 96, 300, 560, 320, { title: "rm — world", lines, typing: 30 });
  if (ms >= tIllegal) {
    // 非法实参：整个画面转红 + 提示
    ctx.save();
    ctx.fillStyle = rgba(s.colors.danger, 0.12);
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
    const e = 1 + 0.04 * Math.sin(ms / 40);
    ctx.save();
    ctx.translate(96 + 280, ly + 40);
    ctx.scale(e, e);
    label(ctx, s, -180, 0, "illegal arguments", s.colors.danger, 34, 0.95, 700);
    ctx.restore();
    pun(ctx, s, 96, ly + 80, "bad args — and bad logic", 18, 0.8);
  }

  // 终端和网格之间一根线（机器在指挥）
  polyline(ctx, s, [
    [656, 460],
    [720, 460],
  ], { hex: s.colors.accent, width: 3, alpha: 0.6 });

  ecg(ctx, s, { x0: 80, x1: 1840, y: 1010, amp: 28, width: 2, speed: 0.5 });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
