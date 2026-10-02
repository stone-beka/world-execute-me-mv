/**
 * _motifs.js — 全片共享母题（文件名以 _ 开头，所以**不会**被注册成画板）
 *
 * 策划书第 1 节写的贯穿母题：**心跳曲线 + 拖线 + 颜文字变化**。
 * 这里把母题和反复出现的东西（背景、光池、插头/充电环、终端窗口、颜文字、
 * 破裂、性别符号…）做成一份，保证 14 块是同一部片子，而不是 14 个 demo。
 *
 * 规则（和画板一样）：纯函数、不用 Math.random、字体一律 s.mono()、
 * 辉光一律"叠几层"而不是 shadowBlur（@napi-rs/canvas 会把描边阴影画成填充盘）。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutBack } from "../core/kernel.js";
import {
  radialGradient,
  makePath,
  pointAtLength,
  echoSteps,
} from "../core/motion.js";
import { MS_PER_BEAT } from "../core/timeline.js";

// ---------------------------------------------------------------- 颜文字（全 ASCII）

export const FACES = {
  alive: ["^_^", "o_o", "u_u", "-_-", "^o^", "o_o", "<o.o>", ">_<"],
  busy: ["[^_^]", "(o_o)", "{o_o}", "<o.o>", "[u_u]", "(o_o)", "{^_^}", "[*_*]"],
  dead: ["x_x", "T_T", ";_;", "u_u", "o_x"],
  love: ["<3", "^3^", "*-*", "^_^"],
};

// ---------------------------------------------------------------- 背景

const GLYPHS = "01{}[]();<>=+-*/#".split("");

/**
 * 四层背景：径向暗角 / 透视地板 / 扫描线 / 漂浮字符。
 * opt.camY 跟着镜头走；grid/scan/glyphs 可以单独关。
 */
export function bg(ctx, s, opt = {}) {
  const { camY = 0, grid = true, scan = true, glyphs = true, beams = false, tint = null } = opt;
  const W = s.W;
  const H = s.H;

  const c0 = tint ? rgba(tint, 1) : "rgba(9,30,26,1)";
  const g = ctx.createRadialGradient(W / 2, H * 0.46, 120, W / 2, H * 0.55, H * 1.1);
  g.addColorStop(0, c0);
  g.addColorStop(0.5, "rgba(5,14,14,1)");
  g.addColorStop(1, "rgba(2,4,6,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (grid) {
    const horizon = H * 0.70 + camY * 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, W, H - horizon);
    ctx.clip();
    ctx.strokeStyle = rgba(s.colors.accent, 0.09);
    ctx.lineWidth = 1.5;
    const scroll = (s.ms * 0.00022 + camY * 0.0004) % 1;
    for (let i = 0; i < 24; i++) {
      const z = (i + (scroll + 1)) % 1;
      const y = horizon + Math.pow(z, 2.4) * (H - horizon) * 1.6;
      if (y > H + 4) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let k = -16; k <= 16; k++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + k * 24, horizon);
      ctx.lineTo(W / 2 + k * 210, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (beams) {
    // 远景光束：给背景一点"光从上面打下来"的感觉
    for (let i = 0; i < 4; i++) {
      const a = (-0.55 + i * 0.36 + 0.05 * Math.sin(s.ms / 2600 + i)) * Math.PI;
      ctx.save();
      ctx.translate(W / 2, -H * 0.15);
      ctx.rotate(a);
      const gg = ctx.createLinearGradient(0, 0, 0, H * 1.3);
      gg.addColorStop(0, rgba(s.colors.accent, 0.05));
      gg.addColorStop(1, rgba(s.colors.accent, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-120, H * 1.3);
      ctx.lineTo(120, H * 1.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  if (scan) {
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }

  if (glyphs) {
    ctx.font = s.mono(18);
    for (let i = 0; i < 40; i++) {
      const rx = s.rnd(11 + i);
      const ry = s.rnd(21 + i);
      const ra = s.rnd(31 + i);
      const y = (ry * (H + 200) + s.ms * (0.004 + ra * 0.01) + camY * 0.5) % (H + 200) - 100;
      ctx.fillStyle = rgba(s.colors.accent, 0.04 + 0.06 * ra);
      ctx.fillText(GLYPHS[s.int(0, GLYPHS.length - 1, 41 + i)], rx * W, y);
    }
  }
}

// ---------------------------------------------------------------- 光

/** 光池 + 旋转光束 */
export function lightPool(ctx, s, cx, cy, r, intensity, ms, opt = {}) {
  const { beams = 5, hex = s.colors.accent } = opt;
  ctx.fillStyle = radialGradient(ctx, cx, cy, 0, r * 3.2, [
    [0, hex, 0.18 * intensity],
    [0.4, hex, 0.06 * intensity],
    [1, s.colors.bg, 0],
  ]);
  ctx.fillRect(cx - r * 3.4, cy - r * 3.4, r * 6.8, r * 6.8);

  for (let i = 0; i < beams; i++) {
    const a = (ms * 0.00018 + i / beams) * Math.PI * 2;
    const rr = r * (2.6 + 0.4 * s.noise(i * 3.1, 7));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    const gg = ctx.createLinearGradient(0, 0, 0, -rr);
    gg.addColorStop(0, rgba(hex, 0.09 * intensity));
    gg.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-58, -rr);
    ctx.lineTo(58, -rr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** 地面投影（有影才有光） */
export function groundShadow(ctx, s, cx, cy, rx, ry, intensity, hex = null) {
  ctx.save();
  ctx.fillStyle = rgba("#000000", 0.55 * intensity);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (hex) {
    ctx.strokeStyle = rgba(hex, 0.16 * intensity);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 扩散一圈（通电、破裂、每拍的重音都能用） */
export function flashRing(ctx, s, cx, cy, r, p, hex, width = 3) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.strokeStyle = rgba(hex, (1 - p) * 0.5);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, r * (0.4 + 1.8 * easeOutCubic(p)), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 母题：心跳曲线

/** 一个心跳周期（PQRST）的归一化形状，-0.2 .. 1 */
function beatShape(ph) {
  if (ph < 0.06) return Math.sin((ph / 0.06) * Math.PI) * 0.12;
  if (ph < 0.10) return 0;
  if (ph < 0.14) return (-0.18 * (ph - 0.1)) / 0.04;
  if (ph < 0.18) return -0.18 + (1.18 * (ph - 0.14)) / 0.04;
  if (ph < 0.22) return 1.0 - (1.25 * (ph - 0.18)) / 0.04;
  if (ph < 0.34) return 0;
  if (ph < 0.46) return Math.sin(((ph - 0.34) / 0.12) * Math.PI) * 0.22;
  return 0;
}

/**
 * 心跳曲线（母题）。横向就是时间轴，所以它一直在往左流。
 * opt: x0 x1 y amp hex width speed(px/ms 的时间流速) periodBeats flat(0..1 拉平)
 */
export function ecg(ctx, s, opt = {}) {
  const {
    x0 = 120,
    x1 = 1800,
    y = 540,
    amp = 70,
    hex = null,
    width = 2.5,
    speed = 0.35,
    periodBeats = 2,
    flat = 0,
  } = opt;
  const c = hex ?? s.colors.accent;
  const period = MS_PER_BEAT * periodBeats;
  const step = 3;

  const at = (x) => {
    const t = (s.ms * speed + (x - x0) * 2.6) % period;
    const v = beatShape(t / period);
    return y - v * amp * (1 - clamp01(flat));
  };

  ctx.save();
  ctx.lineCap = "round";
  for (const [wMul, a] of [
    [4, 0.08],
    [2, 0.2],
    [1, 1],
  ]) {
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = width * wMul;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) {
      if (x === x0) ctx.moveTo(x, at(x));
      else ctx.lineTo(x, at(x));
    }
    ctx.stroke();
  }
  ctx.restore();
  return at;
}

// ---------------------------------------------------------------- 母题：拖线

/**
 * 带尾巴的点：沿路径走，后面拖一串渐渐淡掉、变小的历史位置。
 * 尾巴是"把过去几个时刻的位置各画一遍"，不是攒画布 —— 所以还是纯函数。
 */
export function trailDot(ctx, s, path, headLen, opt = {}) {
  const {
    hex = null,
    n = 10,
    spacingMs = 16.7,
    decay = 0.82,
    r = 12,
    width = 3,
  } = opt;
  const c = hex ?? s.colors.accent;

  ctx.save();
  ctx.lineCap = "round";
  const pts = [];
  for (const st of echoSteps({ count: n, spacingMs, decay, shrink: 0.96 })) {
    const sh = s.shift(st.dt);
    const len = typeof headLen === "function" ? headLen(sh) : headLen;
    const p = pointAtLength(path, len);
    pts.push({ x: p.x, y: p.y, a: st.alpha * 0.9, w: width * st.scale });
  }
  ctx.strokeStyle = rgba(c, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  for (const p of pts) {
    ctx.fillStyle = rgba(c, p.a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (r * p.w) / width, 0, Math.PI * 2);
    ctx.fill();
  }
  // 头：亮一点、带辉光
  ctx.strokeStyle = rgba(c, 0.18);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, r * 1.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(c, 1);
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 折线工具：给画板少写几行 */
export function polyline(ctx, s, pairs, opt = {}) {
  const { hex = null, width = 2, alpha = 0.6, dash = null, glow = false } = opt;
  if (!pairs.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(hex ?? s.colors.fg, alpha);
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  if (glow) {
    ctx.strokeStyle = rgba(hex ?? s.colors.accent, alpha * 0.2);
    ctx.lineWidth = width * 4.5;
    ctx.beginPath();
    ctx.moveTo(pairs[0][0], pairs[0][1]);
    for (const [x, y] of pairs) ctx.lineTo(x, y);
    ctx.stroke();
    ctx.strokeStyle = rgba(hex ?? s.colors.fg, alpha);
    ctx.lineWidth = width;
  }
  ctx.beginPath();
  ctx.moveTo(pairs[0][0], pairs[0][1]);
  for (const [x, y] of pairs) ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 颜文字

/** 画一个居中于 (x,y) 的 ASCII 颜文字 */
export function face(ctx, s, x, y, size, text, hex, alpha = 1) {
  ctx.save();
  ctx.font = s.mono(size, 700);
  const w = ctx.measureText(text).width;
  ctx.fillStyle = rgba(hex, alpha);
  ctx.fillText(text, x - w / 2, y);
  ctx.restore();
}

// ---------------------------------------------------------------- 插头 / 充电环

export function plug(ctx, x, y, hex, size = 1) {
  ctx.save();
  ctx.fillStyle = rgba(hex, 0.9);
  ctx.fillRect(x - 46 * size, y - 26 * size, 92 * size, 52 * size);
  ctx.fillRect(x + 46 * size, y - 14 * size, 26 * size, 10 * size);
  ctx.fillRect(x + 46 * size, y + 4 * size, 26 * size, 10 * size);
  ctx.fillStyle = rgba(hex, 0.4);
  ctx.fillRect(x - 100 * size, y - 8 * size, 54 * size, 16 * size);
  ctx.restore();
}

/**
 * 充电环：顶部留缺口的环 + 按 p 扫过去的弧 + 中心百分比。
 * 辉光是三层描边叠加。
 */
export function chargingRing(ctx, s, cx, cy, r, p, ms, opt = {}) {
  const { hex = null, showPct = true, width = 7, gap = 0.18 } = opt;
  const c = hex ?? s.colors.accent;
  const a0 = -Math.PI / 2 + (gap * Math.PI) / 2;
  const sweep = 2 * Math.PI - gap * Math.PI;

  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(s.colors.fg, 0.18);
  ctx.lineWidth = width - 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a0 + sweep);
  ctx.stroke();
  for (const [wMul, a] of [
    [4.5, 0.1],
    [2.2, 0.22],
    [1, 1],
  ]) {
    ctx.strokeStyle = rgba(c, a * 0.9);
    ctx.lineWidth = width * wMul;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a0 + sweep * clamp01(p));
    ctx.stroke();
  }
  ctx.restore();
  if (showPct) {
    ctx.save();
    ctx.fillStyle = rgba(c, 0.85);
    ctx.font = s.mono(Math.max(18, r * 0.18), 700);
    ctx.fillText(`${Math.round(clamp01(p) * 100)}%`, cx - r * 0.25, cy + r * 0.06);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 终端窗口

/**
 * 一个终端窗口（构建/删除指令都在它里面发生）。
 * opt.lines: [[文本, 出现时刻ms, 颜色?], ...] —— 打字机式出现
 * 返回窗口内的"下一行 y"
 */
export function terminal(ctx, s, x, y, w, h, opt = {}) {
  const { title = "sh", lines = [], hex = null, typing = 26 } = opt;
  ctx.save();
  ctx.fillStyle = rgba(s.colors.bg, 0.9);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(s.colors.fg, 0.5);
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = rgba(s.colors.fg, 0.12);
  ctx.fillRect(x, y, w, 44);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgba(s.colors.fg, 0.5);
    ctx.beginPath();
    ctx.arc(x + w - 26 - i * 26, y + 22, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(s.colors.fg, 0.8);
  ctx.font = s.mono(20, 600);
  ctx.fillText(title, x + 16, y + 29);

  ctx.font = s.mono(24);
  let ly = y + 84;
  for (const [text, atMs, col] of lines) {
    const typed = clamp01((s.ms - atMs) / typing);
    if (typed <= 0) {
      ly += 36;
      continue;
    }
    ctx.fillStyle = rgba(col ?? hex ?? s.colors.accent, 0.9);
    ctx.fillText(text.slice(0, Math.ceil(text.length * typed)), x + 24, ly);
    ly += 36;
  }
  // 光标
  if (s.beatPhase < 0.5) {
    ctx.fillStyle = rgba(s.colors.accent, 0.9);
    ctx.fillRect(x + 24, ly - 20, 12, 24);
  }
  ctx.restore();
  return ly;
}

/** 等待框（SHOT-01 的结尾 → SHOT-02 的起点） */
export function waitBox(ctx, s, cx, cy, p, ms, opt = {}) {
  const { title = "executing", line = "world.execute(me);", heartSlot = false } = opt;
  const e = easeOutBack(p);
  const w = 560;
  const h = 260;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(e, e);
  ctx.globalAlpha *= clamp01(p * 1.4);
  ctx.fillStyle = rgba(s.colors.bg, 0.92);
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = rgba(s.colors.fg, 0.55);
  ctx.lineWidth = 3;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = rgba(s.colors.fg, 0.12);
  ctx.fillRect(-w / 2, -h / 2, w, 44);
  ctx.fillStyle = rgba(s.colors.fg, 0.7);
  ctx.font = s.mono(20, 600);
  ctx.fillText(title, -w / 2 + 18, -h / 2 + 30);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(w / 2 - 30 - i * 30, -h / 2 + 22, 6, 0, Math.PI * 2);
    ctx.fillStyle = rgba(s.colors.fg, 0.5);
    ctx.fill();
  }
  if (heartSlot) heart(ctx, s, -190, 40, 42, 0, 0.35);
  const sweep = Math.sin(ms / 420) * 0.5 + 0.5;
  ctx.fillStyle = rgba(s.colors.fg, 0.14);
  ctx.fillRect(-w / 2 + 40, h / 2 - 70, w - 80, 12);
  ctx.fillStyle = rgba(s.colors.accent, 0.9);
  ctx.fillRect(-w / 2 + 40 + (w - 80 - 200) * sweep, h / 2 - 70, 200, 12);
  ctx.fillStyle = rgba(s.colors.fg, 0.75);
  ctx.font = s.mono(26, 600);
  ctx.fillText(line, -w / 2 + 40, h / 2 - 24);
  ctx.restore();
}

// ---------------------------------------------------------------- 爱心

export function heart(ctx, s, cx, cy, size, fillP, alpha = 1, hex = null) {
  const c = hex ?? s.colors.danger;
  const k = size / 100;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, 34 * k);
    ctx.bezierCurveTo(-70 * k, -10 * k, -38 * k, -72 * k, 0, -34 * k);
    ctx.bezierCurveTo(38 * k, -72 * k, 70 * k, -10 * k, 0, 34 * k);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha *= alpha;
  path();
  ctx.strokeStyle = rgba(c, 0.9);
  ctx.lineWidth = Math.max(2, 5 * k);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-90 * k, -90 * k + 180 * k * (1 - clamp01(fillP)), 180 * k, 180 * k * clamp01(fillP));
  ctx.clip();
  path();
  ctx.fillStyle = rgba(c, 0.85);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------- 点云 / 破裂 / 符号

/**
 * 点云：n 个点在立方体里，随时间旋转并投影。
 * morph 0 = 全部压平在平面上（二维），1 = 立起来（三维）。
 */
export function pointCloud(ctx, s, cx, cy, opt = {}) {
  const {
    n = 260,
    size = 2.6,
    spread = 420,
    depth = 260,
    rot = 0.00035,
    morph = 1,
    hex = null,
    alpha = 0.8,
  } = opt;
  const c = hex ?? s.colors.accent;
  const a = s.ms * rot;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const F = 900;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const px = (s.rnd(500 + i) * 2 - 1) * spread;
    const py = (s.rnd(600 + i) * 2 - 1) * spread * 0.62;
    const pz = (s.rnd(700 + i) * 2 - 1) * depth * morph;
    // 绕 Y 轴转
    const x1 = px * ca - pz * sa;
    const z1 = px * sa + pz * ca;
    const zz = z1 + 900;
    if (zz < 60) continue;
    const k = F / zz;
    const X = cx + x1 * k;
    const Y = cy + py * k * 0.9;
    const r = Math.max(0.5, size * k * 1.6);
    const depthA = clamp01(1.25 - zz / 1400);
    ctx.fillStyle = rgba(c, alpha * (0.25 + 0.75 * depthA));
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 破裂：从中心炸出一堆碎片（线段 + 小块），p 0..1 */
export function shatter(ctx, s, cx, cy, r, p, hex, opt = {}) {
  const { n = 26 } = opt;
  const q = clamp01(p);
  if (q <= 0) return;
  const e = easeOutCubic(q);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + s.rnd(900 + i) * 0.6;
    const dist = r * (0.4 + e * (1.6 + s.rnd(950 + i) * 1.4));
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist;
    const a = (1 - q) * 0.9;
    const len = r * 0.22 * (1 - q * 0.6);
    ctx.strokeStyle = rgba(hex, a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  flashRing(ctx, s, cx, cy, r, q, hex, 4);
  ctx.restore();
}

/** 性别符号：用基本图形画，不依赖字体里有没有 ♂ ♀ */
export function genderSymbol(ctx, s, x, y, size, rot, kind) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = rgba(s.colors.fg, 0.92);
  ctx.lineWidth = Math.max(3, size * 0.09);
  const r = size * 0.34;
  ctx.beginPath();
  ctx.arc(0, size * 0.12, r, 0, Math.PI * 2);
  ctx.stroke();
  if (kind === "male") {
    // 右上箭头
    const d = size * 0.34;
    ctx.beginPath();
    ctx.moveTo(r * 0.7, size * 0.12 - r * 0.7);
    ctx.lineTo(r + d, size * 0.12 - r - d);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r + d, size * 0.12 - r - d);
    ctx.lineTo(r + d - size * 0.16, size * 0.12 - r - d);
    ctx.lineTo(r + d, size * 0.12 - r - d + size * 0.16);
    ctx.stroke();
  } else {
    // 下方十字
    const y0 = size * 0.12 + r;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(0, y0 + size * 0.24);
    ctx.moveTo(-size * 0.11, y0 + size * 0.15);
    ctx.lineTo(size * 0.11, y0 + size * 0.15);
    ctx.stroke();
  }
  ctx.restore();
}

/** 极简图标（不画写实的蔬菜/动物，用几何图形代表） */
export function icon(ctx, s, x, y, size, kind, hex = null) {
  const c = hex ?? s.colors.fg;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = rgba(c, 0.9);
  ctx.fillStyle = rgba(c, 0.18);
  ctx.lineWidth = Math.max(2, size * 0.06);
  const r = size * 0.5;
  if (kind === "eggplant") {
    ctx.beginPath();
    ctx.ellipse(0, size * 0.08, r * 0.52, r * 0.82, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.18, -r * 0.72);
    ctx.lineTo(r * 0.22, -r * 0.98);
    ctx.stroke();
  } else if (kind === "tomato") {
    ctx.beginPath();
    ctx.arc(0, size * 0.08, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.08 - r * 0.66);
      ctx.lineTo(Math.cos(a) * r * 0.3, size * 0.08 - r * 0.66 - Math.sin(a) * r * 0.3);
      ctx.stroke();
    }
  } else if (kind === "cat") {
    ctx.beginPath();
    ctx.arc(0, size * 0.1, r * 0.66, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.2, -r * 0.34);
      ctx.lineTo(sx * r * 0.62, -r * 0.86);
      ctx.lineTo(sx * r * 0.66, -r * 0.3);
      ctx.stroke();
    }
  } else if (kind === "god") {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
      ctx.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96);
      ctx.stroke();
    }
  } else if (kind === "hand") {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.4 + i * r * 0.26, r * 0.2);
      ctx.lineTo(-r * 0.4 + i * r * 0.26, -r * 0.6);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, r * 0.5, r * 0.42, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "box") {
    ctx.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 文字与条

export function label(ctx, s, x, y, text, hex, size = 18, alpha = 0.7, weight = 400) {
  ctx.save();
  ctx.font = s.mono(size, weight);
  ctx.fillStyle = rgba(hex, alpha);
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function progressBar(ctx, s, x, y, w, h, p, hex = null) {
  ctx.save();
  ctx.fillStyle = rgba(s.colors.fg, 0.16);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = rgba(hex ?? s.colors.accent, 0.9);
  ctx.fillRect(x, y, w * clamp01(p), h);
  ctx.restore();
}

/**
 * 双关注释（全片装置）：在画面上用**代码注释**点出这个词的第二层意思。
 * 例：大字 EXECUTION 下面一行 `// run, or kill`
 * 规划见 docs/策划书.md 附「歌词双关对照表」。
 */
export function pun(ctx, s, x, y, text, size = 20, alpha = 0.55) {
  ctx.save();
  ctx.font = s.mono(size, 400);
  ctx.fillStyle = rgba(s.colors.warn, alpha);
  ctx.fillText(`// ${text}`, x, y);
  ctx.restore();
}

/** 数学记号（等宽，双关要用的 lim / Σ / 2πr 之类） */
export function mathNote(ctx, s, x, y, text, size = 22, hex = null, alpha = 0.8) {
  ctx.save();
  ctx.font = s.mono(size, 700);
  ctx.fillStyle = rgba(hex ?? s.colors.fg, alpha);
  ctx.fillText(text, x, y);
  ctx.restore();
}
