/**
 * 07-switch.js — SHOT-07 预副歌：切换性别 / 时间 / 角色
 * 1:28.61 – 1:36.46（段落表第 7 块；导演留空，按"立意"延展；第 8 块指定了符号旋转）
 *
 * "Switch my gender / To F to M"     → gender 开关翻到 M
 * "From AM to PM"                     → time 开关翻到 PM
 * "Oh switch my role / To S to M"     → role 开关翻到 M（S/M 的双关用注释点出来）
 * "So we can enter / The trance"      → 三个开关一起狂翻，进入 trance（高速旋转 + 重影）
 *
 * 画面上是一块**物理开关面板**：每一个开关翻转都有"咔哒"（闪一下 + 跳一下）。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutBack } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { bg, ecg, face, label, lightPool, flashRing, FACES, pun } from "./_motifs.js";

export const meta = {
  id: "shot-07",
  z: 156,
  startMs: 88614,
  endMs: 96710,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tG = at("Switch my gender", 0);
  const tF = at("To F to M", 4);
  const tAM = at("From AM to PM", 12);
  const tR = at("Oh switch my role", 20);
  const tS = at("To S to M", 24);
  const tTrance = at("So we can enter", 28);
  const ms = s.ms;

  bg(ctx, s, { camY: 0, beams: true });
  lightPool(ctx, s, CX, 420, 260, 0.8, ms, { beams: 4 });

  const trance = clamp01((ms - tTrance) / 600);
  const spin = trance * (ms - tTrance) * 0.00012;

  // ---- 三个开关 ----
  const rows = [
    { label: "gender", a: "F", b: "M", flipAt: tF, note: "female ⇄ male" },
    { label: "time", a: "AM", b: "PM", flipAt: tAM, note: "上午 ⇄ 下午" },
    { label: "role", a: "S", b: "M", flipAt: tS, note: "the other kind of switch" },
  ];
  const rowsStart = 300;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y = rowsStart + i * 150;
    // trance 时三个开关自己疯狂翻
    const auto = trance > 0 ? (Math.sin((ms - tTrance) * 0.02 + i) > 0 ? 1 : 0) : 0;
    const flipped = ms >= r.flipAt ? 1 : 0;
    const on = trance > 0 ? auto : flipped;
    const anim = clamp01((ms - r.flipAt) / 260);

    // 底板
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.fg, 0.35);
    ctx.lineWidth = 3;
    ctx.strokeRect(420, y - 46, 1080, 96);
    ctx.restore();

    label(ctx, s, 452, y + 8, r.label, s.colors.fg, 30, 0.85, 600);
    pun(ctx, s, 452, y + 40, r.note, 18, 0.45);

    // 左右两个状态字
    const aOn = 1 - on;
    const bOn = on;
    ctx.save();
    ctx.font = s.mono(40, 700);
    ctx.fillStyle = rgba(s.colors.fg, 0.25 + 0.7 * aOn * (1 - anim));
    ctx.fillText(r.a, 700, y + 16);
    ctx.fillStyle = rgba(s.colors.accent, 0.25 + 0.75 * bOn);
    ctx.fillText(r.b, 1180, y + 16);
    ctx.restore();
    // 拨杆
    const kx = lerp(880, 1100, easeOutBack(on));
    ctx.save();
    ctx.fillStyle = rgba(s.colors.fg, 0.9);
    ctx.fillRect(kx - 26, y - 26, 52, 60);
    ctx.fillStyle = rgba(s.colors.bg, 0.9);
    ctx.fillRect(kx - 12, y - 10, 24, 28);
    ctx.restore();
    // 咔哒：翻的那一下闪一圈
    flashRing(ctx, s, kx, y, 60, clamp01((ms - r.flipAt) / 300), s.colors.accent, 3);
  }

  // ---- 状态汇总（机器在念自己的配置）----
  const cfg = [
    `gender = ${ms >= tF || trance > 0 ? '"M"' : '"F"'}`,
    `time   = ${ms >= tAM || trance > 0 ? '"PM"' : '"AM"'}`,
    `role   = ${ms >= tS || trance > 0 ? '"M"' : '"S"'}`,
  ];
  for (let i = 0; i < cfg.length; i++) label(ctx, s, 1540, 316 + i * 40, cfg[i], s.colors.accent, 22, 0.8);

  // ---- trance：面板开始转、脸开始变 ----
  if (trance > 0) {
    const n = Math.floor(trance * 8);
    for (let k = 0; k < n; k++) {
      const a = ms * 0.003 + k * 0.7;
      face(ctx, s, CX + Math.cos(a) * 420, 420 + Math.sin(a) * 240, 40, FACES.love[k % FACES.love.length], s.colors.accent, 0.35);
    }
    label(ctx, s, CX - 120, 140, "… trance …", s.colors.warn, 34, 0.9, 700);
  }
  face(ctx, s, CX, 820, 54, ms >= tF ? FACES.busy[0] : FACES.alive[0], s.colors.fg, 0.9);

  pun(ctx, s, 420, 860, "S/M — and the other kind of switch", 18, 0.55);

  ecg(ctx, s, { x0: 80, x1: 1840, y: 1000, amp: 28, width: 2, speed: 0.4 + trance * 0.6 });
  const line = L.lineAt(ms) ?? L.lastLine(ms);
  if (line) label(ctx, s, 80, 60, line.text, s.colors.fg, 22, 0.5);
}
