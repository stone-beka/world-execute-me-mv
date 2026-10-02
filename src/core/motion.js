/**
 * motion.js — 动效原语
 *
 * 这一层只做一件事：把导演能叫出名字的效果——「冲出去急停」「撞一下弹回来」
 * 「错峰依次亮」「拖尾」「回声」「沿路径走」「擦除」——变成确定性的函数。
 *
 * 铁律：这里所有东西都是 (时间, seed) 的纯函数，不许留任何状态。
 *   · 拖尾不是「攒一块画布」，而是「把过去 N 个时刻的形状各重画一遍」。
 *     所以同一帧永远同一像素，才能只重渲那 3 秒、才能切片并行。
 *   · 想沿拖尾变化，用 s.ms 当噪声坐标（s.noise(s.ms * x)），不要用 s.frame。
 *     因为 s.shift() 只挪时间，s.rnd() 仍绑在当前帧上（整条尾巴一致，更干净）。
 *
 * 用法（在画板里）：
 *   import { keys, echoSteps, pointAtLength, clipWipe } from "../core/motion.js";
 * 高频的那几个已经挂在 s 上（见 registry.js）：s.keys s.echo s.stagger s.decay
 * s.pulse s.shift s.snap s.crossed s.onsets s.hit s.onsetsIn
 */

import {
  clamp,
  clamp01,
  lerp,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeOutQuint,
  easeOutExpo,
  easeOutBack,
} from "./kernel.js";
import { rgba } from "./fade.js";
import { MS_PER_FRAME, MS_PER_BEAT, frameState } from "./timeline.js";

// ---------------------------------------------------------------- 缓动 / 关键帧

/** 名字 → 缓动函数。写关键帧、错峰时用名字，读起来就是人话。 */
export const EASES = {
  linear: (t) => t,
  in: easeInCubic,
  out: easeOutCubic,
  inout: easeInOutCubic,
  quint: easeOutQuint,
  expo: easeOutExpo,
  back: easeOutBack,
};

export function easeFn(name) {
  if (typeof name === "function") return name;
  return EASES[name] ?? easeOutCubic;
}

/**
 * 关键帧：按你说的时刻摆一串值。
 *   keys(s.ms, [[3000, 0, "out"], [3600, 1], [4200, 0.4, "inout"]])
 * 第 3 个元素是「进入这个点」用的缓动（不写就沿用默认）。
 * points 必须按时间升序；范围外取首/尾值（不循环，循环自己取模）。
 */
export function keys(ms, points, ease = "inout") {
  if (!points || points.length === 0) return 0;
  if (ms <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (ms >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [am, av] = points[i];
    const [bm, bv, be] = points[i + 1];
    if (ms <= bm) {
      const f = easeFn(be ?? points[i][2] ?? ease);
      const t = bm === am ? 1 : (ms - am) / (bm - am);
      return lerp(av, bv, f(t));
    }
  }
  return last[1];
}

// ---------------------------------------------------------------- 错峰（延迟）

/**
 * 第 i 个元素的延迟。stepMs 默认 1/4 拍。
 * 一排东西「像多米诺依次亮过去」就靠它。
 */
export function staggerMs(i, stepMs = MS_PER_BEAT / 4) {
  return i * stepMs;
}

/**
 * 错峰进度 0..1：elapsedMs 是这一轮开始到现在，第 i 个元素延后 i*stepMs 才动，
 * 用 durMs 走完一趟。适合「每拍重新来一轮」的写法：
 *   const t0 = Math.floor(lb / MS_PER_BEAT) * MS_PER_BEAT;
 *   const p = staggerEase(lb - t0, i, MS_PER_BEAT / 8, MS_PER_BEAT * 0.6, "out");
 */
export function staggerEase(elapsedMs, i, stepMs, durMs, ease = "out") {
  return easeFn(ease)(clamp01((elapsedMs - staggerMs(i, stepMs)) / Math.max(1e-3, durMs)));
}

// ---------------------------------------------------------------- 拖尾 / 回声

/**
 * 拖尾 / 回声的「步进表」：每一步告诉你「回看多少毫秒、画多淡、缩多少、偏多少」。
 * 画板自己拿 s.shift(step.dt) 去算那个时刻的形状，再按 step.alpha 叠上去。
 *
 *   for (const st of echoSteps({ count: 10, decay: 0.8 })) {
 *     const sh = s.shift(st.dt);
 *     ctx.globalAlpha = s.env * st.alpha;
 *     drawDot(ctx, sh, st.scale, st.dx, st.dy);
 *   }
 *
 * spacingMs 默认 1 帧（60fps 下 = 16.7ms）；spread>0 时越往后间隔越大（尾巴越拉越散）。
 */
export function echoSteps(opt = {}) {
  const {
    count = 6,
    spacingMs = MS_PER_FRAME,
    decay = 0.78,
    shrink = 1,
    driftX = 0,
    driftY = 0,
    spread = 0,
  } = opt;

  const out = [];
  let dt = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      dt += spacingMs * (1 + spread * (i - 1));
      dx += driftX;
      dy += driftY;
    }
    out.push({ i, dt, alpha: Math.pow(decay, i), scale: Math.pow(shrink, i), dx, dy });
  }
  return out;
}

/** 拖尾的常用默认值（等间隔、只变淡）。 */
export function trail(opt = {}) {
  return echoSteps({ count: 8, spacingMs: MS_PER_FRAME, decay: 0.8, ...opt });
}

/**
 * 把一个状态挪到 dtMs 毫秒之前。
 * frame / ms / t / beat / beatPhase / bar / barPhase 都跟着挪，
 * env 和 localMs（画板自己的进度）保持不变——整条尾巴一起淡。
 * rnd/noise 是绑在原状态上的：尾巴上随机一致；要沿尾巴变化就用 s.noise(s.ms * x)。
 */
export function shiftState(s, dtMs) {
  if (!dtMs) return s;
  const frame = s.frame - Math.round(dtMs / MS_PER_FRAME);
  const time = frameState(frame, s.ms - dtMs);
  return { ...s, ...time };
}

// ---------------------------------------------------------------- 路径 / 沿线取点

/** 折线预处理：累积弧长。画板里别每帧重算大路径，写进 meta.data 缓存。 */
export function makePath(points) {
  const cum = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    cum.push(total);
  }
  return { points, cum, total };
}

/** 沿路径走 len 像素后的位置 / 切线角（弧度）。让点沿路径爬、让文字沿线摆都靠它。 */
export function pointAtLength(path, len) {
  const { points, cum, total } = path;
  if (points.length === 0) return { x: 0, y: 0, angle: 0, t: 0 };
  if (points.length === 1) return { x: points[0][0], y: points[0][1], angle: 0, t: 0 };
  const d = clamp(len, 0, total);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = points[i - 1];
  const b = points[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  return {
    x: lerp(a[0], b[0], t),
    y: lerp(a[1], b[1], t),
    angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
    t,
  };
}

/** 均匀取 n 个点（含首尾），用来把文字/小标记沿线摆成一串。 */
export function samplePath(path, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(pointAtLength(path, (path.total * i) / Math.max(1, n - 1)));
  }
  return out;
}

/** 把路径描出来。stops 给了就按长度方向做渐变。 */
export function strokePath(ctx, path, opt = {}) {
  const { color = "#ffffff", width = 2, stops = null, dash = null } = opt;
  if (path.points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(path.points[0][0], path.points[0][1]);
  for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i][0], path.points[i][1]);
  if (dash) ctx.setLineDash(dash);
  ctx.lineWidth = width;
  if (stops) {
    const [x0, y0] = path.points[0];
    const [x1, y1] = path.points[path.points.length - 1];
    ctx.strokeStyle = linearGradient(ctx, x0, y0, x1, y1, stops);
  } else {
    ctx.strokeStyle = color;
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- 渐变 / 擦除

/** stops = [[位置0..1, 颜色, 透明度], ...]（透明度可省）。 */
export function linearGradient(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [p, hex, a = 1] of stops) g.addColorStop(clamp01(p), rgba(hex, a));
  return g;
}

export function radialGradient(ctx, cx, cy, r0, r1, stops) {
  const g = ctx.createRadialGradient(cx, cy, Math.max(0, r0), cx, cy, Math.max(r0 + 1e-3, r1));
  for (const [p, hex, a = 1] of stops) g.addColorStop(clamp01(p), rgba(hex, a));
  return g;
}

/**
 * 擦除：把 ctx 裁到一个比例 p 的矩形里，之后画的东西只在里面出现。
 * dir: right | left | down | up | hout（从中间向两边）
 * 记得自己 ctx.save() / ctx.restore()。
 */
export function clipWipe(ctx, x, y, w, h, p, dir = "right") {
  const q = clamp01(p);
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;
  if (dir === "right") rw = w * q;
  else if (dir === "left") {
    rw = w * q;
    rx = x + w - rw;
  } else if (dir === "down") rh = h * q;
  else if (dir === "up") {
    rh = h * q;
    ry = y + h - rh;
  } else if (dir === "hout") {
    rw = w * q;
    rx = x + (w - rw) / 2;
  } else if (dir === "vout") {
    rh = h * q;
    ry = y + (h - rh) / 2;
  }
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
}

// ---------------------------------------------------------------- 卡拍脉冲（onset）

/** 距事件 dtMs 后的衰减值（半衰期 halfLifeMs 后剩一半）。 */
export function decay(dtMs, halfLifeMs = 110) {
  return Math.pow(0.5, Math.max(0, dtMs) / Math.max(1e-3, halfLifeMs));
}

/**
 * 一组事件（升序）在 ms 时刻的「余晖」：取最近若干次里最强的一个衰减值。
 * events 可以是 [ms, ms, ...] 或 [{ ms, strength }]，0..1+。
 * 用 s.hit() 就够日常；要分乐器自己传列表。
 */
export function pulses(events, ms, halfLifeMs = 110, lookbackMs = 1200) {
  let v = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const em = typeof e === "number" ? e : e.ms;
    const dt = ms - em;
    if (dt < 0) continue;
    if (dt > lookbackMs) break; // 升序表，再往前更旧
    const s = typeof e === "number" ? 1 : (e.strength ?? 1);
    const d = s * decay(dt, halfLifeMs);
    if (d > v) v = d;
  }
  return v;
}

/**
 * 卡拍闪光兜底：整拍后才衰减到 decayPerBeat（s.beatPhase=0 → 1）。
 * 有 onset 数据时优先用 s.hit()，那才是真的「鼓一响」。
 */
export function beatPulse(s, decayPerBeat = 0.6) {
  return Math.pow(decayPerBeat, s.beatPhase);
}
