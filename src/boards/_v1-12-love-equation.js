/**
 * 12-love-equation.js — SHOT-12 高潮：爱的代数式
 * 2:38.77 – 3:12.46（段落表第 12 块，33.7s；导演留空，按"立意"延展）
 *
 * 三个乐章：
 *  A. Ein Dos Trois Ne Fem Liu → 这是**循环计数器**（德语1/西语2/法语3/匈语4/瑞典5/中文6）
 *     画成 `for (i = 1; i <= 6; i++)`，六个数依次跳出来。
 *  B. "give them all the execution / only execution / I will run the execution / trapped"
 *     → 一道处决的波扫过全屏；然后盒子收拢。
 *  C. "I know the algebraic expression of lo-o-ove"
 *     → **把爱写成代数式**，逐项长出来：
 *          love = Σ ( vibrations · completion ) ÷ ( fragments + isolation ) + you
 *       最后求值：you 是未定义的 → `love = NaN`（它算不出来，因为人走了）
 *       "Though you are free / I am trapped" → 一个符号在盒子外，一个在盒子里
 *       "lo-o-ove" 用故障拉长的方式画（模拟语音合成卡顿）
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutExpo, easeOutBack } from "../core/kernel.js";
import { beatToMs, MS_PER_BEAT } from "../core/timeline.js";
import {
  bg,
  ecg,
  label,
  lightPool,
  flashRing,
  shatter,
  face,
  genderSymbol,
  heart,
  mathNote,
  pun,
  FACES,
} from "./_motifs.js";

export const meta = {
  id: "shot-12",
  z: 161,
  startMs: 158767,
  endMs: 192710,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;
const CY = 500;
const NUMERALS = [
  ["Ein", "1", "DE"],
  ["Dos", "2", "ES"],
  ["Trois", "3", "FR"],
  ["Ne", "4", "HU"],
  ["Fem", "5", "SE"],
  ["Liu", "6", "ZH"],
];

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b, nth = 0) => L.find(q)[nth]?.start ?? beatToMs(b);
  const tCount = at("Ein Dos Trois Ne Fem Liu", 0);
  const tExec = at("If I can give them all the execution", 0);
  const tTrap = at("Though we are trapped", 0);
  const tStudy = at("I've studied how to properly", 0);
  const tAnswer = at("Question me I can answer", 0);
  const tAlg = at("I know the algebraic expression", 0);
  const tFree = at("Though you are free", 0);
  const tMe = at("I am trapped", 0);
  const tLove = at("Trapped in lo-o-ove", 0);
  const ms = s.ms;

  bg(ctx, s, { camY: 0, beams: true });
  lightPool(ctx, s, CX, CY, 260, 0.75, ms, { beams: 4 });

  // ================= A. 循环计数器 =================
  if (ms < tExec) {
    mathNote(ctx, s, 220, 300, "for (let i = 1; i <= 6; i++)", 30, s.colors.accent, 0.9);
    const sung = clamp01((ms - tCount) / 2600);
    for (let i = 0; i < 6; i++) {
      const on = clamp01(sung * 6 - i);
      if (on <= 0) continue;
      const x = 240 + i * 240;
      const e = easeOutBack(clamp01(on * 2));
      ctx.save();
      ctx.translate(x, 520);
      ctx.scale(e, e);
      mathNote(ctx, s, 0, 0, NUMERALS[i][1], 64, s.colors.accent, 0.95);
      ctx.restore();
      label(ctx, s, x - 34, 580, NUMERALS[i][0], s.colors.fg, 26, 0.8);
      label(ctx, s, x - 16, 620, NUMERALS[i][2], s.colors.fg, 20, 0.5 * on);
      // 计数器每跳一个，闪一圈
      flashRing(ctx, s, x + 6, 520, 40, clamp01((on * 6 - i) > 0.9 ? (on * 6 - i - 0.9) / 0.1 : 0), s.colors.accent, 3);
    }
    label(ctx, s, 220, 740, "i++", s.colors.warn, 26, 0.7);
    pun(ctx, s, 220, 786, "counting the executions in six languages", 18, 0.5);
  }

  // ================= B. 全部处决 =================
  if (ms >= tExec && ms < tStudy) {
    const p = clamp01((ms - tExec) / 12000);
    // 扫过全屏的处决波
    const waveX = lerp(-200, s.W + 200, easeOutCubic(clamp01((ms - tExec) / 3000)));
    ctx.save();
    ctx.fillStyle = rgba(s.colors.danger, 0.14);
    ctx.fillRect(waveX - 260, 0, 520, s.H);
    ctx.strokeStyle = rgba(s.colors.danger, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(waveX, 0);
    ctx.lineTo(waveX, s.H);
    ctx.stroke();
    ctx.restore();
    // 波扫过的对象一个个炸
    for (let i = 0; i < 40; i++) {
      const x = 140 + (i % 8) * 230;
      const y = 220 + Math.floor(i / 8) * 170;
      if (x > waveX) {
        face(ctx, s, x, y, 40, FACES.busy[i % FACES.busy.length], s.colors.fg, 0.5);
      } else if (x > waveX - 300) {
        shatter(ctx, s, x, y, 50, clamp01((waveX - x) / 300), s.colors.danger, { n: 14 });
      }
    }
    label(ctx, s, 300, 150, `executed: ${Math.round(p * 100)}%`, s.colors.danger, 32, 0.9, 700);
    pun(ctx, s, 300, 190, "all of them — to be your only one", 18, 0.55);
  }

  // ================= C. 爱的代数式 =================
  if (ms >= tStudy - 500) {
    // 盒子：$ sung 之后收拢
    const trapP = ms >= tTrap ? clamp01((ms - tTrap) / 2200) : 0;
    const bw = lerp(2200, 1180, easeOutExpo(trapP));
    const bh = lerp(1400, 640, easeOutExpo(trapP));
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.fg, 0.8);
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 14]);
    ctx.strokeRect(CX - bw / 2, CY - bh / 2 - 40, bw, bh);
    ctx.restore();

    // 方程：逐项长出来
    const rows = [
      ["love =", tStudy, 40, s.colors.accent],
      ["Σ ( vibrations · completion )", tAnswer, 40, s.colors.fg],
      ["÷ ( fragments + isolation )", tAlg, 40, s.colors.fg],
      ["+ you", tAlg + 700, 40, s.colors.warn],
    ];
    let y = 250;
    for (const [text, tAt, size, col] of rows) {
      const on = clamp01((ms - tAt) / 700);
      if (on <= 0) {
        y += 86;
        continue;
      }
      const e = easeOutCubic(on);
      ctx.save();
      ctx.globalAlpha = e;
      mathNote(ctx, s, 380 - (1 - e) * 40, y, text, size, col, 0.95);
      ctx.restore();
      y += 86;
    }
    // you 未定义 → 求值为 NaN
    if (ms >= tAlg + 1200) {
      const ev = clamp01((ms - tAlg - 1200) / 700);
      mathNote(ctx, s, 380, y + 40, `=  love = NaN`, 46, s.colors.danger, ev);
      pun(ctx, s, 380, y + 84, "unresolved symbol: you", 20, ev * 0.8);
    }

    // Though you are free / I am trapped：一个在盒子外，一个在盒子里
    if (ms >= tFree) {
      const p = clamp01((ms - tFree) / 1200);
      // 自由的：飘到盒子右外侧
      const fx = lerp(CX + 200, CX + bw / 2 + 170, easeOutCubic(p));
      genderSymbol(ctx, s, fx, CY - 140, 90, -0.3, "female");
      label(ctx, s, fx - 40, CY - 40, "free", s.colors.accent, 22, 0.85);
      // 被困的：留在盒子里
      genderSymbol(ctx, s, CX - 300, CY + 120, 90, 0.3, "male");
      label(ctx, s, CX - 340, CY + 220, "trapped", s.colors.danger, 22, 0.9);
    }

    // lo-o-ove：故障拉长（每个字符自己抖）
    if (ms >= tLove - 800) {
      const p = clamp01((ms - tLove + 800) / 1500);
      const word = "lo-o-ove";
      ctx.save();
      ctx.font = s.mono(72, 700);
      let x = CX - 240;
      for (let i = 0; i < word.length; i++) {
        const jitter = Math.sin(ms * 0.05 + i * 2.1) * 10 * (1 - p) + Math.sin(ms * 0.2 + i) * 3;
        const stretch = 1 + 0.5 * Math.sin(ms * 0.008 + i);
        ctx.save();
        ctx.translate(x + jitter, CY + 300);
        ctx.scale(stretch, 1);
        ctx.fillStyle = rgba(s.colors.danger, 0.9 * p);
        ctx.fillText(word[i], 0, 0);
        ctx.restore();
        x += ctx.measureText(word[i]).width * 1.1;
      }
      ctx.restore();
      heart(ctx, s, CX + 320, CY + 272, 90, p, p, s.colors.danger);
      pun(ctx, s, CX - 240, CY + 360, "text-to-speech: lo-o-ove", 18, 0.55 * p);
    }
  }

  ecg(ctx, s, { x0: 80, x1: 1840, y: 1010, amp: 30, width: 2, speed: 0.5 });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
