/**
 * 03-dimension.js — SHOT-03 一堆点散开，从二维平面变成三维空间
 * 0:30.00 – 0:58.61（段落表第 3 块）
 *
 * 这一块是"AI 展示自己的一切"：同一团点云，**随每一句歌词变成不同的形状**。
 *   set of points → 散点      dimension → 平面挤出成体
 *   circle → 圆环             circumference → 半径线转一圈
 *   sine wave → 正弦          tangents → 切线
 *   approach infinity → 拉成一条线   limitations → 四壁收拢
 *   switch my current / AC to DC → 波形从交流变直流
 *   blind my vision / dizzy → 白闪 + 高速旋转
 *   travel / A.D to B.C → 时间轴来回滑
 *   unite / deeply → 两团合成一团
 *
 * 点的随机属性用 s.noise(i)（**不含帧号**），所以点云不会每帧乱抖。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeInOutCubic, easeOutCubic, easeOutExpo } from "../core/kernel.js";
import { MS_PER_BEAT, beatToMs } from "../core/timeline.js";
import { bg, ecg, lightPool, label, polyline, flashRing, mathNote, pun } from "./_motifs.js";

export const meta = {
  id: "shot-03",
  z: 152,
  startMs: 29998,
  endMs: 58864,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot"],
};

const CX = 960;
const CY = 500;
const N = 320;
const SPREAD = 430;

/** 每句歌词对应的形状 */
const SHAPES = [
  ["If I'm a set of points", "plane"],
  ["Then I will give you my dimension", "cube"],
  ["If I'm a circle", "ring"],
  ["Then I will give you my circumference", "ring"],
  ["If I'm a sine wave", "sine"],
  ["Then you can sit on all my tangents", "sine"],
  ["If I approach infinity", "line"],
  ["Then you can be my limitations", "box"],
  ["Switch my current", "sine"],
  ["To AC to DC", "dc"],
  ["And then blind my vision", "scatter"],
  ["So dizzy so dizzy", "spin"],
  ["Oh we can travel", "axis"],
  ["To A.D to B.C", "axis"],
  ["And we can unite", "unite"],
  ["So deeply so deeply", "unite"],
];

export function draw(ctx, s) {
  const L = s.lyrics;
  const ms = s.ms;
  // 当前句 + 下一句，用来做形状过渡
  const idx = SHAPES.findIndex(([q]) => q === (findLine(L, ms)?.text ?? ""));
  const cur = idx >= 0 ? idx : Math.max(0, SHAPES.findIndex(([q]) => (L.find(q)[0]?.start ?? 0) > ms) - 1);
  const next = Math.min(SHAPES.length - 1, cur + 1);
  const curStart = L.find(SHAPES[cur][0])[0]?.start ?? beatToMs(cur * 4);
  const nextStart = L.find(SHAPES[next][0])[0]?.start ?? curStart + 1900;
  // 在下一句到来前 500ms 就开始变形
  const morph = easeInOutCubic(clamp01((ms - (nextStart - 500)) / 500));

  const modeA = SHAPES[cur][1];
  const modeB = SHAPES[next][1];

  bg(ctx, s, { camY: 0, beams: true });
  lightPool(ctx, s, CX, CY, 260, 0.7, ms, { beams: 4 });

  const spin = modeA === "spin" || modeB === "spin" ? 0.0022 : 0.00035;
  const a = ms * spin;

  for (let i = 0; i < N; i++) {
    const pa = spot(modeA, i, s, ms);
    const pb = spot(modeB, i, s, ms);
    const x = lerp(pa[0], pb[0], morph);
    const y = lerp(pa[1], pb[1], morph);
    const z = lerp(pa[2], pb[2], morph);

    // 绕 Y 轴旋转 + 透视
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x1 = x * ca - z * sa;
    const z1 = x * sa + z * ca;
    const zz = z1 + 1000;
    if (zz < 60) continue;
    const k = 900 / zz;
    const X = CX + x1 * k * SPREAD * 0.5;
    const Y = CY + y * k * SPREAD * 0.5;
    const size = Math.max(0.6, 2.6 * k * 1.5);
    const depth = clamp01(1.3 - zz / 1500);
    ctx.fillStyle = rgba(s.colors.accent, 0.25 + 0.7 * depth);
    ctx.beginPath();
    ctx.arc(X, Y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  overlays(ctx, s, ms, modeA, modeB, morph);

  // 母题：心跳曲线压在下方
  ecg(ctx, s, { x0: 80, x1: 1840, y: 940, amp: 40, width: 2, speed: 0.3 });
  // 当前句子（点云的"字幕"）
  const line = findLine(L, ms);
  if (line) label(ctx, s, 80, 60, `${line.text}`, s.colors.fg, 22, 0.55);
}

/** 形状：返回归一化坐标 [-1,1] 的三元组 */
function spot(mode, i, s, ms) {
  const r1 = s.noise(i * 31.7, 1) * 2 - 1;
  const r2 = s.noise(i * 57.3, 2) * 2 - 1;
  const r3 = s.noise(i * 91.1, 3) * 2 - 1;
  const ph = s.noise(i * 13.3, 4) * Math.PI * 2;

  switch (mode) {
    case "scatter":
      return [r1, r2 * 0.7, r3];
    case "plane":
      return grid(i, 0);
    case "cube":
      return grid(i, 1);
    case "ring": {
      const aa = ph + i * 0.0196;
      return [Math.cos(aa), Math.sin(aa) * 0.72, r3 * 0.12];
    }
    case "sine": {
      const x = r1;
      return [x, Math.sin(x * 3.4 + ms * 0.0012) * 0.45, r3 * 0.15];
    }
    case "line":
      return [r1, r2 * 0.05, r3 * 0.05];
    case "box": {
      // 贴在一个盒子的壁上
      const face = Math.floor(s.noise(i * 7.7, 5) * 6);
      const u = r1;
      const v = r2;
      const d = 0.85;
      const f = [
        [u, v, d],
        [u, v, -d],
        [d, u, v],
        [-d, u, v],
        [u, d, v],
        [u, -d, v],
      ][face % 6];
      return f;
    }
    case "dc": {
      // 直流：只在 y=0 附近，像一条平线
      return [r1, s.noise(i * 3.1, 6) * 0.06, r3 * 0.1];
    }
    case "spin": {
      const aa = ph + i * 0.0196;
      return [Math.cos(aa) * (0.5 + 0.5 * Math.abs(r3)), Math.sin(aa) * 0.8, r3];
    }
    case "axis": {
      // 时间轴：一条横线上的刻度
      const u = (i / N) * 2 - 1;
      return [u, r2 * 0.05, r3 * 0.05];
    }
    case "unite": {
      // 两团（左/右）合成一团
      const half = i < N / 2 ? -0.7 : 0.7;
      const cluster = s.noise(i * 23.9, 7) > 0.5 ? half : -half;
      return [cluster + r1 * 0.35, r2 * 0.5, r3 * 0.6];
    }
    default:
      return [r1, r2, r3];
  }
}

/** 平面(0) / 立方体(1) 的格点 */
function grid(i, depth) {
  if (depth) {
    // 7×7×7 的立体点阵（320 个点正好铺满几层）
    const side = 7;
    const n = side - 1;
    const x = i % side;
    const y = Math.floor(i / side) % side;
    const z = Math.floor(i / (side * side));
    return [((x / n) * 2 - 1) * 0.8, -((y / n) * 2 - 1) * 0.8, ((z / n) * 2 - 1) * 0.8];
  }
  const side = Math.ceil(Math.sqrt(N));
  const n = side - 1;
  const x = i % side;
  const y = Math.floor(i / side);
  return [((x / n) * 2 - 1) * 0.95, -((y / n) * 2 - 1) * 0.6, 0];
}

function overlays(ctx, s, ms, modeA, modeB, morph) {
  const L = s.lyrics;
  // circumference：半径线扫一圈
  const circ = lineAt(L, ms, "Then I will give you my circumference");
  if (circ) {
    const ang = (clamp01(circ) * Math.PI * 2 - Math.PI / 2);
    polyline(ctx, s, [
      [CX, CY],
      [CX + Math.cos(ang) * 200, CY + Math.sin(ang) * 144],
    ], { hex: s.colors.warn, width: 3, alpha: 0.9 });
    label(ctx, s, CX + 16, CY + 30, `r = 0.08`, s.colors.warn, 20, 0.8);
  }
  // tangents：正弦上的切线
  const tan = lineAt(L, ms, "Then you can sit on all my tangents");
  if (tan) {
    for (let k = -2; k <= 2; k++) {
      const x = k * 150;
      const slope = Math.cos(x / 150) * 1.1;
      polyline(ctx, s, [
        [CX + x - 90, CY - slope * 0.6 * (90 / 60) * 0.6],
        [CX + x + 90, CY + slope * 0.6 * (90 / 60) * 0.6],
      ], { hex: s.colors.warn, width: 2, alpha: 0.5 + 0.4 * tan });
    }
  }
  // dimension：把"维度"直接标出来
  if (lineAt(L, ms, "Then I will give you my dimension")) {
    mathNote(ctx, s, CX + 250, CY - 250, "dim = 3", 26, s.colors.warn, 0.85);
    pun(ctx, s, CX + 250, CY - 220, "your dimension", 18, 0.5);
  }
  // limitations：双关 —— 既是"限制"，也是数学里的 limit
  const lim = lineAt(L, ms, "Then you can be my limitations");
  if (lim) {
    const p = easeOutExpo(lim);
    const w = lerp(760, 380, p);
    const h = lerp(460, 260, p);
    ctx.save();
    ctx.strokeStyle = rgba(s.colors.fg, 0.5 + 0.4 * lim);
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(CX - w / 2, CY - h / 2, w, h);
    ctx.restore();
    mathNote(ctx, s, CX - w / 2, CY - h / 2 - 40, "lim", 34, s.colors.warn, 0.9);
    mathNote(ctx, s, CX - w / 2 + 56, CY - h / 2 - 6, "x→∞", 22, s.colors.warn, 0.85);
    pun(ctx, s, CX - w / 2, CY + h / 2 + 34, "limit, and the fence", 18, 0.6);
  }
  // AC → DC：底部一条波形带
  const ac = lineAt(L, ms, "Switch my current");
  const dc = lineAt(L, ms, "To AC to DC");
  if (ac || dc) {
    const flat = dc ?? 0;
    const pts = [];
    for (let x = 0; x <= 1200; x += 12) {
      const v = Math.sin(x / 60 + ms * 0.004) * (1 - flat);
      pts.push([300 + x, 820 - v * 60]);
    }
    polyline(ctx, s, pts, { hex: flat > 0.5 ? s.colors.accent : s.colors.warn, width: 3, alpha: 0.9, glow: true });
    label(ctx, s, 300, 880, flat > 0.5 ? "DC — current" : "AC ~ current", s.colors.fg, 20, 0.6);
  }
  // blind my vision：白闪
  const blind = lineAt(L, ms, "And then blind my vision");
  if (blind) {
    ctx.save();
    ctx.fillStyle = rgba("#ffffff", 0.55 * (1 - Math.abs(blind - 0.35) / 0.35));
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
  }
  // dizzy：旋转的准星 + 重影
  const dizzy = lineAt(L, ms, "So dizzy so dizzy");
  if (dizzy) {
    for (let k = 0; k < 3; k++) {
      const a = ms * 0.004 + k * 2.1;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(a);
      ctx.strokeStyle = rgba(s.colors.fg, 0.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-300, 0);
      ctx.lineTo(300, 0);
      ctx.stroke();
      ctx.restore();
    }
    label(ctx, s, CX - 90, CY - 300, "dizzy…", s.colors.fg, 26, 0.6);
  }
  // travel / A.D to B.C：时间轴
  const travel = lineAt(L, ms, "Oh we can travel") ?? lineAt(L, ms, "To A.D to B.C");
  if (travel) {
    const dir = lineAt(L, ms, "To A.D to B.C") ? -1 : 1;
    polyline(ctx, s, [
      [200, 700],
      [1720, 700],
    ], { hex: s.colors.fg, width: 2, alpha: 0.5 });
    for (let k = -6; k <= 6; k++) {
      const x = CX + k * 130 + ((ms * 0.12 * dir) % 130);
      ctx.fillStyle = rgba(s.colors.accent, 0.8);
      ctx.fillRect(x, 692, 2, 16);
      label(ctx, s, x - 18, 736, String(k * 1000), s.colors.fg, 16, 0.5);
    }
    label(ctx, s, 200, 660, dir > 0 ? "→ A.D" : "← B.C", s.colors.warn, 22, 0.8);
  }
  // unite：中缝里两团向中间收
  const unite = lineAt(L, ms, "And we can unite") ?? lineAt(L, ms, "So deeply so deeply");
  if (unite) {
    flashRing(ctx, s, CX, CY, 180, clamp01(unite * 0.9), s.colors.accent, 3);
  }
}

/** 某句正在唱到哪（0..1，不在唱就是 null） */
function lineAt(L, ms, q) {
  const l = L.find(q)[0];
  if (!l) return null;
  if (ms < l.start || ms >= l.singEnd) return null;
  return clamp01((ms - l.start) / Math.max(1, l.singEnd - l.start));
}

function findLine(L, ms) {
  return L.lineAt(ms) ?? L.lastLine(ms);
}
