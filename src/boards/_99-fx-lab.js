/**
 * 99-fx-lab.js — 动效试片（调试用，不是成片内容）
 *
 * 这块画板的唯一用途：把 motion.js 里的效果逐一摆出来给人看，
 * 顺便当「这些效果怎么写」的范例。看完就能删，不影响任何成片画面。
 *
 * 时间 3s~15s，共 7 段：
 *   A 缓动      冲出去急停 / 撞一下弹回来     ← s.keys / EASES
 *   B 错峰      一排格子像多米诺依次亮        ← s.staggerEase
 *   C 拖尾      单点 vs 拖 10 步的彗星尾      ← s.echo + s.shift
 *   D 回声残影  同一形状延迟重现、渐淡偏移偏色 ← s.echo(drift/tint)
 *   E 渐变/擦除 渐变条 + 逐字擦除             ← linearGradient / clipWipe
 *   F 路径      让点沿折线爬，带尾巴          ← makePath / pointAtLength
 *   G 卡拍      网格拍点 vs 真实 onset        ← s.hit / s.onsetsIn
 *
 * 所有文字一律 ASCII：@napi-rs/canvas 不带 CJK 字形，中文会渲染成豆腐块，
 * 而且豆腐块在不同机器上不一样 —— 那既是可读性问题，也是确定性风险。
 */

import { rgba, mixColor } from "../core/fade.js";
import { clamp01, lerp } from "../core/kernel.js";
import { MS_PER_BEAT, MS_PER_FRAME } from "../core/timeline.js";
import {
  easeFn,
  echoSteps,
  makePath,
  pointAtLength,
  strokePath,
  clipWipe,
  linearGradient,
  radialGradient,
} from "../core/motion.js";

export const meta = {
  id: "fx-lab",
  z: 90, // 低于 00-smoke 的 100，区间又不重叠，纯粹为了不触发「同 z 重叠」提醒
  startMs: 3000,
  endMs: 15000,
  fade: { fadeInMs: 200, fadeOutMs: 400 },
  tags: ["debug", "fx-lab"],
};

const A = 3000;
const B = 4800;
const C = 6600;
const D = 8400;
const E = 10200;
const F = 12000;
const G = 13800;

export function draw(ctx, s) {
  ctx.save();
  ctx.globalAlpha = s.env;

  header(ctx, s);

  if (s.ms < B) easeBand(ctx, s, A, B);
  else if (s.ms < C) staggerBand(ctx, s, B, C);
  else if (s.ms < D) trailBand(ctx, s, C, D);
  else if (s.ms < E) echoBand(ctx, s, D, E);
  else if (s.ms < F) gradientBand(ctx, s, E, F);
  else if (s.ms < G) pathBand(ctx, s, F, G);
  else onsetBand(ctx, s, G, 15000);

  ctx.restore();
}

// ---------------------------------------------------------------- 公用

function header(ctx, s) {
  ctx.fillStyle = rgba(s.colors.fg, 0.5);
  ctx.font = s.mono(16);
  ctx.fillText(
    `fx-lab   f=${s.frame}  t=${s.t.toFixed(2)}s  beat=${s.beat.toFixed(2)}  ` +
      `hit=${s.hit(110, 900).toFixed(2)}  sec=${s.section ? s.section.name : "-"}`,
    80,
    60,
  );
}

function title(ctx, s, name, hint) {
  ctx.fillStyle = rgba(s.colors.accent, 0.9);
  ctx.font = s.mono(34, 700);
  ctx.fillText(name, 80, 130);
  ctx.fillStyle = rgba(s.colors.fg, 0.45);
  ctx.font = s.mono(17);
  ctx.fillText(hint, 80, 162);
}

function dot(ctx, x, y, r, hex, alpha) {
  ctx.fillStyle = rgba(hex, alpha * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(hex, alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- A 缓动

const EASE_ROWS = [
  ["linear", "linear   constant speed"],
  ["out", "out      slam then stop"],
  ["expo", "expo     hard brake"],
  ["inout", "inout    slow-fast-slow"],
  ["back", "back     overshoot & settle"],
];

function easeBand(ctx, s, from, to) {
  title(ctx, s, "A  EASING / KEYFRAMES", "same 1.8s travel, only the curve changes");
  const x0 = 360;
  const x1 = 1560;
  const y0 = 360;
  const dy = 120;
  const p = ((s.ms - from) % 1800) / 1800;

  for (let i = 0; i < EASE_ROWS.length; i++) {
    const [name, text] = EASE_ROWS[i];
    const y = y0 + i * dy;
    ctx.strokeStyle = rgba(s.colors.fg, 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = rgba(s.colors.fg, 0.4);
    ctx.font = s.mono(16);
    ctx.fillText(text, x1 + 40, y + 6);
    dot(ctx, lerp(x0, x1, easeFn(name)(p), y), y, 13, s.colors.accent, 0.95);
  }
}

// ---------------------------------------------------------------- B 错峰

function staggerBand(ctx, s, from, to) {
  title(ctx, s, "B  STAGGER (DELAY)", "each beat restarts the wave: tile i waits i x 1/8 beat");
  const lb = s.ms - from;
  const N = 12;
  const w = 86;
  const gap = 28;
  const totalW = N * w + (N - 1) * gap;
  const x0 = (s.W - totalW) / 2;
  const y = 560;
  const beatStart = Math.floor(lb / MS_PER_BEAT) * MS_PER_BEAT;

  for (let i = 0; i < N; i++) {
    const e = s.staggerEase(lb - beatStart, i, MS_PER_BEAT / 8, MS_PER_BEAT * 0.6, "out");
    const x = x0 + i * (w + gap);
    ctx.fillStyle = rgba(s.colors.accent, 0.06 + 0.9 * e);
    ctx.fillRect(x, y - 30 * e, w, w);
    ctx.fillStyle = rgba(s.colors.bg, 0.5 + 0.5 * e);
    ctx.font = s.mono(20);
    ctx.fillText(String(i + 1), x + w / 2 - 12, y - 30 * e + w / 2 + 7);
  }
}

// ---------------------------------------------------------------- C 拖尾

/** 位置只依赖状态里的时间 —— 所以 s.shift(dt) 能乖出「过去」的位置 */
function wander(st, cx, cy) {
  const a = st.noise(st.ms * 0.00055, 3) * Math.PI * 2;
  const r = 70 + 150 * st.noise(st.ms * 0.0009, 5);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8 };
}

function trailBand(ctx, s, from, to) {
  title(ctx, s, "C  TRAIL", "right: the past 10 positions redrawn - not an accumulation buffer");

  const p1 = wander(s, 560, 660);
  ctx.fillStyle = rgba(s.colors.fg, 0.35);
  ctx.font = s.mono(16);
  ctx.fillText("single dot", 470, 420);
  dot(ctx, p1.x, p1.y, 14, s.colors.fg, 0.8);

  const cx = 1400;
  const cy = 660;
  ctx.fillStyle = rgba(s.colors.fg, 0.35);
  ctx.fillText("trail x10", cx - 40, 420);
  for (const st of echoSteps({ count: 10, spacingMs: MS_PER_FRAME, decay: 0.82, shrink: 0.96 })) {
    const p = wander(s.shift(st.dt), cx, cy);
    dot(ctx, p.x + st.dx, p.y + st.dy, 14 * st.scale, s.colors.accent, st.alpha * 0.9);
  }
}

// ---------------------------------------------------------------- D 回声残影

function echoBand(ctx, s, from, to) {
  title(ctx, s, "D  ECHO / GHOSTING", "same shape delayed: dimmer, smaller, drifting, colour-shifted");
  const steps = echoSteps({
    count: 7,
    spacingMs: 3 * MS_PER_FRAME,
    decay: 0.72,
    shrink: 0.94,
    driftX: 18,
    driftY: -8,
  });
  for (const st of steps) {
    const sh = s.shift(st.dt);
    const col = mixColor(s.colors.accent, s.colors.warn, st.i / (steps.length - 1));
    ctx.save();
    ctx.translate(s.W / 2 + st.dx, 620 + st.dy);
    ctx.rotate(sh.t * 0.9);
    ctx.scale(st.scale, st.scale);
    ctx.globalAlpha = s.env * st.alpha;
    ctx.fillStyle = col.css;
    ctx.fillRect(-70, -70, 140, 140);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- E 渐变 / 擦除

function gradientBand(ctx, s, from, to) {
  title(ctx, s, "E  GRADIENT / WIPE", "linear + radial gradient, and text filled left to right");
  const lb = s.ms - from;

  ctx.fillStyle = radialGradient(ctx, s.W / 2, 620, 0, 560, [
    [0, s.colors.accent, 0.3],
    [0.55, s.colors.accent, 0.08],
    [1, s.colors.bg, 0],
  ]);
  ctx.fillRect(200, 300, s.W - 400, 620);

  ctx.fillStyle = linearGradient(ctx, 260, 380, 1660, 380, [
    [0, s.colors.bg, 1],
    [0.3, s.colors.accent, 1],
    [0.72, s.colors.warn, 1],
    [1, s.colors.fg, 1],
  ]);
  ctx.fillRect(260, 396, 1400, 74);

  const p = clamp01((lb % 2400) / 1700);
  ctx.font = s.mono(104, 800);
  ctx.fillStyle = rgba(s.colors.fg, 0.16);
  ctx.fillText("WIPE BY LIGHT", 260, 700);
  ctx.save();
  clipWipe(ctx, 260, 596, 1180, 124, p, "right");
  ctx.fillStyle = rgba(s.colors.fg, 0.95);
  ctx.fillText("WIPE BY LIGHT", 260, 700);
  ctx.restore();
  ctx.fillStyle = rgba(s.colors.accent, 0.9);
  ctx.fillRect(260 + 1180 * p - 2, 596, 4, 124);
}

// ---------------------------------------------------------------- F 路径

function pathBand(ctx, s, from, to) {
  title(ctx, s, "F  PATH", "a dot walking a polyline: it knows how far it got and which way it faces");
  const path = makePath([
    [180, 800],
    [480, 440],
    [820, 720],
    [1180, 380],
    [1520, 660],
    [1740, 430],
  ]);
  strokePath(ctx, path, {
    stops: [
      [0, s.colors.accent, 0.25],
      [1, s.colors.fg, 0.45],
    ],
    width: 3,
    dash: [12, 10],
  });

  const p = clamp01(((s.ms - from) % 3000) / 2500);
  const head = pointAtLength(path, path.total * p);
  const tail = pointAtLength(path, path.total * clamp01(p - 0.08));

  dot(ctx, tail.x, tail.y, 10, s.colors.fg, 0.5);
  dot(ctx, head.x, head.y, 15, s.colors.accent, 0.95);

  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(head.angle);
  ctx.fillStyle = rgba(s.colors.warn, 0.9);
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(14, 10);
  ctx.lineTo(14, -10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = rgba(s.colors.fg, 0.4);
  ctx.font = s.mono(16);
  ctx.fillText(`walked ${(p * path.total).toFixed(0)} / ${path.total.toFixed(0)} px`, 180, 880);
}

// ---------------------------------------------------------------- G 卡拍

function onsetBand(ctx, s, from, to) {
  title(ctx, s, "G  ONSETS: GRID vs REAL", "top row = 130 BPM grid ticks; bottom row = actual onsets (height = strength)");
  const slot = MS_PER_BEAT / 2;
  const slots = 20;
  const w = 64;
  const gap = 8;
  const x0 = 200;
  const base = Math.floor(s.ms / slot);

  for (let k = 0; k < slots; k++) {
    const msK = (base - (slots - 1 - k)) * slot;
    const x = x0 + k * (w + gap);

    const gA = 1 - clamp01((s.ms - msK) / (slot * 0.5));
    ctx.fillStyle = rgba(s.colors.fg, 0.1 + 0.3 * gA);
    ctx.fillRect(x, 480, w, 8);

    const list = s.onsetsIn(msK, msK + slot);
    let st = 0;
    for (const o of list) if (o.strength > st) st = o.strength;
    ctx.fillStyle = rgba(s.colors.accent, 0.12 + 0.85 * clamp01(st));
    ctx.fillRect(x, 516, w, 6 + 150 * clamp01(st));
  }

  const hit = clamp01(s.hit(110, 900));
  ctx.fillStyle = rgba(s.colors.warn, 0.08 + 0.3 * hit);
  ctx.beginPath();
  ctx.arc(1620, 620, 40 + 130 * hit, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(s.colors.warn, 0.9);
  ctx.font = s.mono(20);
  ctx.fillText(`s.hit() = ${hit.toFixed(2)}`, 1500, 820);
}
