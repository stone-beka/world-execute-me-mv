/**
 * 01-power-on.js — SHOT-01 引子（机器刚通电）
 *
 * 对应 docs/策划书.md 的 SHOT-01（0:00 – 0:12.46）。导演给的动作流程：
 *   ① 出现插头和充电环                    ← Switch on the power line
 *   ② 充电环被框起来，变成盾牌样式          ← Remember to put on protection
 *   ③ 视角向下移动，出现一堆代码颜文字      ← Lay down your pieces
 *   ④ 颜文字逐个变成绿色                   ← And let's begin object creation
 *   ⑤ 出现一个红色颜文字，头顶长出被填满的爱心 ← Fill in my data parameters initialisation
 *   ⑥ 爱心扩大 → 转场，出现等待框           ← Setup our new world
 *   进出：替换和遮掩（不是淡出）
 *
 * 时间一律从歌词表取（s.lyrics），不写死秒；母题在 _motifs.js。
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutExpo, easeOutBack } from "../core/kernel.js";
import { MS_PER_BEAT, beatToMs } from "../core/timeline.js";
import {
  bg,
  lightPool,
  groundShadow,
  flashRing,
  plug,
  chargingRing,
  heart,
  waitBox,
  face,
  FACES,
} from "./_motifs.js";

export const meta = {
  id: "shot-01",
  z: 150,
  startMs: 0,
  endMs: 12460,
  // 退场是**硬切**（被 SHOT-02 的等待框遮住），不是忘了写信封
  fade: { fadeInMs: 500, fadeOutMs: 0 },
  tags: ["film", "shot"],
};

const COLS = 6;
const ROWS = 3;
const GRID_WORLD_Y = 1790;
const RED_INDEX = 8;

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, beat) => L.find(q)[0]?.start ?? beatToMs(beat);
  const t1 = at("Switch on the power line", 0);
  const t2 = at("Remember to put on protection", 4);
  const t3 = at("Lay down your pieces", 8);
  const t4 = at("And let's begin object creation", 12);
  const t5 = at("Fill in my data parameters", 16);
  const t6 = at("Setup our new world", 24);
  const ms = s.ms;

  // 视角下移（③）：1.2s 内把整个世界向上推 1080px
  const camY = -easeOutCubic(clamp01((ms - t3) / 1200)) * 1080;

  ctx.save();
  ctx.globalAlpha = s.env;

  bg(ctx, s, { camY, beams: false });
  if (ms < t1 + 200) cursor(ctx, s);

  plugAndRing(ctx, s, ms, t1, t2, camY);

  if (ms >= t3 - 100) {
    const gridIn = easeOutCubic(clamp01((ms - t3 - 250) / 900));
    faces(ctx, s, ms, t3, t4, t5, camY, gridIn);
  }
  if (ms >= t5) heartAndWait(ctx, s, ms, t5, t6);

  ctx.restore();
}

// ---------------------------------------------------------------- ① ② 插头 / 充电环 / 盾牌

function plugAndRing(ctx, s, ms, t1, t2, camY) {
  const cx = 960;
  const cy = 620 + camY;
  const ringP = clamp01((ms - t1) / (t2 - t1));
  const r = 250 + 8 * Math.pow(0.55, s.beatPhase); // 每拍轻弹一下

  groundShadow(ctx, s, cx, cy + r * 0.92, r * 1.15, r * 0.16, 1, s.colors.accent);
  lightPool(ctx, s, cx, cy, r, ringP, ms, { beams: 5 });

  // 电源线（边拉边亮）
  const lineP = clamp01((ms - t1) / 900);
  ctx.save();
  ctx.strokeStyle = rgba(s.colors.fg, 0.25);
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(200, cy);
  ctx.lineTo(200 + 760 * lineP, cy);
  ctx.stroke();
  ctx.restore();

  // 插头（接上之后一直插着）
  const plugP = easeOutCubic(clamp01((ms - t1 - 500) / 900));
  plug(ctx, lerp(240, cx - 320, plugP), cy, s.colors.fg);

  // 通电火花
  flashRing(ctx, s, cx, cy, r * 1.2, clamp01((ms - (t1 + 1400)) / 700), s.colors.accent, 3);

  chargingRing(ctx, s, cx, cy, r, ringP, ms);

  // ② 盾牌：角括号先到，盾牌轮廓再合上
  const shieldP = clamp01((ms - t2) / 800);
  if (shieldP > 0) shield(ctx, s, cx, cy, r + 90, shieldP);
}

function shield(ctx, s, cx, cy, r, p) {
  const e = easeOutBack(p);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(e, e);
  ctx.strokeStyle = rgba(s.colors.fg, 0.9);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.82);
  ctx.lineTo(r, -r * 0.82);
  ctx.lineTo(r * 0.72, r * 0.3);
  ctx.lineTo(0, r * 0.95);
  ctx.lineTo(-r * 0.72, r * 0.3);
  ctx.closePath();
  ctx.stroke();
  const b = r * 1.22;
  const arm = 46;
  ctx.strokeStyle = rgba(s.colors.accent, 0.9);
  ctx.lineWidth = 7;
  const corner = (x, y, sx, sy) => {
    ctx.beginPath();
    ctx.moveTo(x + sx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * arm);
    ctx.stroke();
  };
  corner(-b, -b, 1, 1);
  corner(b, -b, -1, 1);
  corner(-b, b, 1, -1);
  corner(b, b, -1, -1);
  ctx.restore();
}

// ---------------------------------------------------------------- ③ ④ ⑤ 颜文字网格

function faces(ctx, s, ms, t3, t4, t5, camY, gridIn) {
  const size = 52;
  const colGap = 268;
  const rowGap = 132;
  const x0 = 960 - ((COLS - 1) * colGap) / 2;
  const y0 = GRID_WORLD_Y + camY - ((ROWS - 1) * rowGap) / 2;
  const litCount = Math.floor((ms - t4) / (MS_PER_BEAT / 2)); // 1/8 拍一个个亮

  for (let i = 0; i < COLS * ROWS; i++) {
    const x = x0 + (i % COLS) * colGap;
    const y = y0 + Math.floor(i / COLS) * rowGap + (1 - gridIn) * 420;
    const isRed = i === RED_INDEX && ms >= t5;
    const text = faceText(i, ms, t5, isRed);
    const lit = ms >= t4 && i < litCount;

    face(ctx, s, x, y, size, text, s.colors.fg, 0.13 * gridIn);
    if (isRed) {
      face(ctx, s, x + 3 * Math.sin(ms / 26), y, size, text, s.colors.danger, 0.95);
    } else if (lit) {
      const since = (ms - t4 - i * (MS_PER_BEAT / 2)) / 180;
      const k = since < 1 ? 1 + 0.25 * (1 - easeOutCubic(clamp01(since))) : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      face(ctx, s, 0, 0, size, text, s.colors.accent, 0.95);
      ctx.restore();
    }
  }
}

function faceText(i, ms, t5, isRed) {
  if (isRed) {
    const p = clamp01((ms - t5) / 1600);
    return p < 0.45 ? FACES.busy[0] : p < 0.8 ? FACES.dead[1] : FACES.dead[0];
  }
  if (ms < t5) return Math.floor(i / COLS) % 2 ? FACES.busy[i % FACES.busy.length] : FACES.alive[i % FACES.alive.length];
  return FACES.alive[i % FACES.alive.length];
}

// ---------------------------------------------------------------- ⑤ ⑥ 爱心 → 等待框

function heartAndWait(ctx, s, ms, t5, t6) {
  const L = s.lyrics;
  const line5 = L.find("Fill in my data parameters")[0];

  const colGap = 268;
  const rowGap = 132;
  const fx = 960 - ((COLS - 1) * colGap) / 2 + (RED_INDEX % COLS) * colGap;
  const fy = GRID_WORLD_Y - 1080 - ((ROWS - 1) * rowGap) / 2 + Math.floor(RED_INDEX / COLS) * rowGap;

  const fillP = line5 ? L.wordProgress(line5.words[line5.words.length - 1], ms) : clamp01((ms - t5) / 3000);
  const growP = clamp01((ms - t5) / 500);

  const expP = easeOutExpo(clamp01((ms - t6) / 450));
  const boxP = clamp01((ms - t6 - 400) / 350);
  const shrinkP = clamp01((ms - t6 - 450) / 500);

  const scale = lerp(lerp(1, 9, expP), 0.55, shrinkP);
  const hx = lerp(fx, 960 - 190, easeOutCubic(shrinkP));
  const hy = lerp(fy - 120, 540 + 40, easeOutCubic(shrinkP));

  if (ms < t6 + 1450) heart(ctx, s, hx, hy, 76 * scale, fillP, clamp01(growP) * lerp(1, 0.9, shrinkP));
  if (boxP > 0) waitBox(ctx, s, 960, 540, boxP, ms, { heartSlot: true });
}

function cursor(ctx, s) {
  ctx.fillStyle = rgba(s.colors.accent, s.beatPhase < 0.5 ? 0.9 : 0.15);
  ctx.font = s.mono(40, 700);
  ctx.fillText("_", 940, 600);
}
