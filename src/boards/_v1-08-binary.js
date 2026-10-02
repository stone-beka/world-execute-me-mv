/**
 * 08-binary.js — SHOT-08 符号的变换 / 你走了
 * 1:36.46 – 1:58.61（段落表第 8 块：导演指定「男性和女性的符号的变换（转一圈就变了）」）
 *
 * 前半（To S to M / trance / vibrations / completion）：
 *   中心一个符号**转一圈就变**（半圈是 ♂，半圈是 ♀）；"vibrations" 时它跟着震；
 *   "completion" 时两半圆弧合成一个完整的圆 = 完成。
 * 后半（Though you have left / You have left ×5 / isolation）：
 *   周围六颗符号，**每唱一次 "You have left" 就走掉一颗**，最后只剩一颗
 *   = isolation（孤独）。心跳线跟着变慢。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { bg, ecg, label, lightPool, flashRing, genderSymbol, face, FACES, pun } from "./_motifs.js";

export const meta = {
  id: "shot-08",
  z: 157,
  startMs: 96460,
  endMs: 118864,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;
const CY = 470;

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b, nth = 0) => L.find(q)[nth]?.start ?? beatToMs(b);
  const tRot = at("To S to M", 0);
  const tVib = at("If I can feel your vibrations", 0);
  const tDone = at("Then I can finally be completion", 0);
  const tLeft = at("Though you have left", 0);
  const lefts = L.find("You have left"); // [0]=Though…, [1..5]=独立的五次, 最后一次含 isolation
  const ms = s.ms;

  bg(ctx, s, { camY: 0, beams: true });
  lightPool(ctx, s, CX, CY, 230, 0.8, ms, { beams: 4 });

  // ---- 中心符号：转一圈就变 ----
  const rot = (ms - tRot) * 0.00055;
  const half = Math.floor(((rot % (Math.PI * 2)) + Math.PI * 2) / Math.PI) % 2;
  const kind = half === 0 ? "male" : "female";
  const vib = tVib <= ms && ms < tDone ? 1 : 0;
  const vx = vib ? 5 * Math.sin(ms * 0.06) : 0;
  const vy = vib ? 4 * Math.sin(ms * 0.09 + 1) : 0;
  genderSymbol(ctx, s, CX + vx, CY + vy, 300, rot, kind);

  // 转一整圈的那一下：闪一圈
  const turn = (rot % (Math.PI * 2)) / (Math.PI * 2);
  flashRing(ctx, s, CX, CY, 190, turn > 0.9 ? (turn - 0.9) / 0.1 : 0, s.colors.accent, 3);

  // ---- vibrations：振动波纹 ----
  if (vib) {
    for (let k = 0; k < 3; k++) {
      const rr = 200 + k * 70 + 12 * Math.sin(ms * 0.01 + k);
      ctx.strokeStyle = rgba(s.colors.accent, 0.16 - k * 0.04);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CX, CY, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    label(ctx, s, CX - 70, CY + 300, "vibrations", s.colors.accent, 20, 0.7);
  }

  // ---- completion：两半合成一个整圆 ----
  const done = clamp01((ms - tDone) / 900);
  if (done > 0) {
    const gap = lerp(1.2, 0, easeOutCubic(done)); // 两半圆弧合拢
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.accent, 0.9);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(CX, CY, 210, -Math.PI / 2 + gap, Math.PI / 2 - gap);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CX, CY, 210, Math.PI / 2 + gap, Math.PI * 1.5 - gap);
    ctx.stroke();
    ctx.restore();
    label(ctx, s, CX - 96, CY + 300, "completion", s.colors.accent, 20, 0.8 * done);
  }

  // ---- 你走了：六颗符号一颗颗走 ----
  const ORB = 6;
  for (let k = 0; k < ORB; k++) {
    const dep = lefts[k + 1]?.start ?? Infinity; // 第 k 次 "You have left"
    const gone = ms >= dep ? easeOutCubic(clamp01((ms - dep) / 1400)) : 0;
    if (gone >= 1) continue;
    const a = (k / ORB) * Math.PI * 2 + ms * 0.00022;
    const r = 430 + gone * 420; // 越走越远
    const x = CX + Math.cos(a) * r;
    const y = CY + Math.sin(a) * r * 0.55;
    const alpha = (1 - gone) * 0.85;
    ctx.save();
    ctx.globalAlpha = alpha;
    genderSymbol(ctx, s, x, y, 66, a + Math.PI / 2, k % 2 ? "female" : "male");
    ctx.restore();
    // 走掉时留一道拖线
    if (gone > 0 && gone < 1) {
      ctx.strokeStyle = rgba(s.colors.fg, (1 - gone) * 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * 430, CY + Math.sin(a) * 430 * 0.55);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  // 走掉的画一条淡淡的告别
  for (let k = 0; k < 5; k++) {
    const dep = lefts[k + 1]?.start;
    if (dep === undefined) continue;
    label(ctx, s, 140, 240 + k * 44, `-1  ${((dep - tLeft) / 1000).toFixed(2)}s`, s.colors.fg, 20, ms >= dep ? 0.35 : 0.0);
  }

  // isolation：只剩一颗，脸是难过的
  const iso = at("You have left me in isolation", 0);
  if (ms >= iso) {
    const p = clamp01((ms - iso) / 1200);
    face(ctx, s, CX, CY + 330, 56, FACES.dead[1], s.colors.fg, 0.7 * p);
    label(ctx, s, CX - 110, CY + 400, "isolation", s.colors.danger, 24, 0.8 * p);
  }

  pun(ctx, s, 140, 940, "F/M — a switch, not a truth", 18, 0.5);

  ecg(ctx, s, { x0: 80, x1: 1840, y: 1000, amp: 30, width: 2, speed: lerp(0.4, 0.14, clamp01((ms - tLeft) / 6000)) });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
