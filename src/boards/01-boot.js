/**
 * 01-boot.js — SHOT-01 引子：开机
 * 0:00 – 0:12.46
 *
 * 复刻参考片的开场语言：**一颗电源按钮 + 打字机字幕 + 点阵进度条**。
 * 参考片这一段几乎是空的 —— 黑底、竖条纹、一颗 ⏻、歌词逐字打出来，
 * 下面一条点阵进度条跟着填。最后 `[Press any key to start simulation]` 闪动。
 */

import {
  clamp01,
  lerp } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  powerButton,
  typewriter,
  dottedBar,
  label,
  pun,
  rgba,
  shadow,
  chessPiece,
  chessFloor,
  TYPE,
  INK,
  cameraShake,
  popIn,
  shockLight,
  particleBurst,
} from "./_ui.js";

import { lyrics } from "../core/lyrics.js";

// 试点 (2026-09-29):歌词驱动
//   startMs = intro 段首句首词 start - 250ms
//   endMs   = intro 段末句 end
const shot01Start = () => lyrics.get("Switch on the power line").words[0].start - 250;
const shot01End = () => lyrics.get("Setup our new world").end;

export const meta = {
  id: "shot-01",
  z: 150,
  startMs: shot01Start,
  endMs: shot01End,
  fade: { fadeInMs: 600, fadeOutMs: 200 },
  tags: ["film", "shot", "ui"],
};

/**
 * 线框棋子（等轴测）。同一个造型复用 → 「实例化」的视觉依据。
 * kind: 'pawn' | 'rook' | 'bishop'  —— 只用轮廓，不写实。
 */

export function draw(ctx, s) {
  const L = s.lyrics;
  const ms = s.ms;
  const tFill = L.find("Fill in my data parameters initialisation")[0]?.start ?? beatToMs(16);
  const tWorld = L.find("Setup our new world")[0]?.start ?? beatToMs(24);
  // B5 开机瞬间撞一下（200ms）：轻抖 + 撞击波 + 粒子
  cameraShake(ctx, s, 8, 50, 200);
  desk(ctx, s, { stripes: true });
  // `Setup our new world`：底下的黑白棋盘渐渐显形。
  // （棋盘是跨画板的共享装置，shot-02 的对弈用的是同一个 —— 边界不会错位）
  chessFloor(ctx, s, { reveal: clamp01((ms - tWorld) / 1600) });

  // 电源按钮：正中偏左，按下时亮起
  const pbX = 700;
  const pbY = 520;
  const on = clamp01((ms - 200) / 900);
  // B3 撞击波 + B4 粒子碎 在开机瞬间从按钮位置扩散
  shockLight(ctx, s, pbX, pbY, 200, { maxR: 280, durMs: 600, color: UI.red, width: 2 });
  particleBurst(ctx, s, pbX, pbY, 200, { n: 14, speed: 360, size: 2.5, durMs: 500, color: UI.red, seedCh: 110 });
  // B1 电源按钮 pop-in：按下时弹出
  powerButton(ctx, s, pbX, pbY, 70, {
    on: true,
    glow: on * 0.9,
    scale: popIn(s, 200, 500, 0.85, 1.8),
  });

  // ---- 盾牌：`Remember to put on protection` ----
  // 【改 2026-09】原来是一枚 240×325 的大盾牌杵在画面右侧 —— 太大、形状也不好看。
  // 现在换成**防伪水印式的地板**：小盾牌沿斜向密排、错位重叠，半透明。
  //
  // 【改 2026-09-29】用户要求：**先是一堆数字 → 不断闪烁 → 变换成蓝色的护盾背景**，
  // 并且护盾要比原来显眼。所以这一块现在是三幕：
  //   ① tProt..+900      数字铺开（每个格子一个会变的数字）
  //   ② +900..+1400      闪烁加剧（故障感），护盾从数字里「长」出来
  //   ③ +1400..+2300     数字退成底噪，蓝盾水印升到主角，之后回落成常驻水印
  const tProt = L.find("Remember to put on protection")[0]?.start ?? beatToMs(4);
  const SH_FLICK = tProt + 900; // 闪烁加剧
  const SH_RESOLVE = tProt + 1400; // 开始变成护盾
  const SH_FULL = tProt + 2300; // 护盾到位
  const digitA = clamp01((ms - tProt) / 380) * (1 - clamp01((ms - SH_RESOLVE) / 900));
  const shieldIn = clamp01((ms - SH_RESOLVE) / 900);

  /** 一枚小盾牌（水印单元）。尺寸 w，中心在 (x,y)。 */
  const shieldStamp = (x, y, w, alpha, rot = 0) => {
    const h = w * 1.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.42);
    ctx.lineTo(w / 2, -h * 0.42);
    ctx.lineTo(w / 2, h * 0.06);
    ctx.bezierCurveTo(w / 2, h * 0.34, w * 0.25, h * 0.46, 0, h * 0.5);
    ctx.bezierCurveTo(-w * 0.25, h * 0.46, -w / 2, h * 0.34, -w / 2, h * 0.06);
    ctx.closePath();
    ctx.strokeStyle = rgba(UI.blue, 1);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 内部一个锁孔：让「保护」的意象读得出来
    ctx.beginPath();
    ctx.arc(0, h * 0.06, w * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h * 0.06 + w * 0.1);
    ctx.lineTo(0, h * 0.2);
    ctx.stroke();
    ctx.restore();
  };

  // ① 数字场：铺满画面的一层会变的数字。闪烁期更躁，护盾一显形就退成底噪。
  if (digitA > 0.002) {
    const tick = Math.floor(ms / 96); // 数字换批
    const ftick = Math.floor(ms / 44); // 闪烁通道（更快）
    const CELL = 46;
    const cols = Math.ceil(s.W / CELL) + 1;
    const rowN = Math.ceil(s.H / CELL) + 1;
    ctx.save();
    ctx.font = s.mono(20);
    for (let r = 0; r < rowN; r++) {
      for (let c = 0; c < cols; c++) {
        const k = c * 7.31 + r * 13.7;
        if (s.noise(k, 91) < 0.44) continue; // 稀一点，别糊成一片
        const d = Math.floor(s.noise(k + tick * 1.7, 92) * 10) % 10;
        const fl = 0.5 + 0.5 * s.noise(k + ftick * 2.3, 93); // 故障感的闪烁
        const hot = s.noise(k + ftick * 0.9, 94); // 偶尔一格高亮
        ctx.fillStyle = hot > 0.88
          ? rgba(UI.text, digitA * 0.8)
          : rgba(UI.blue, digitA * 0.62 * fl);
        ctx.fillText(String(d), c * CELL + 6, r * CELL + 26);
      }
    }
    ctx.restore();
  }

  // ② 地板：斜向密排 + 错位（奇偶行错开半格）。始终在，只是明暗随歌词走。
  {
    // 那句最亮，邻句渐暗；之后退回极淡的水印
    let glow = 0;
    if (ms >= tProt - 300) glow = clamp01((ms - tProt) / 700);
    const rest = ms < tProt + 3200 ? glow : Math.max(0.18, glow * (1 - clamp01((ms - tProt - 3200) / 2600)));
    // 护盾从数字里长出来时给一段更亮的峰值（用户要求「显眼一些」）
    const peak = shieldIn * (1 - clamp01((ms - SH_FULL - 900) / 2200));
    const lit = Math.min(1.3, rest + 0.55 * peak);
    const W = 96;
    const stepX = W * 1.5;
    const stepY = W * 1.9;
    const tilt = -0.42; // 斜向
    for (let row = -1; row * stepY < s.H + 200; row++) {
      const yy = row * stepY - 60 + Math.sin(ms / 2600 + row) * 6; // 整片缓慢起伏
      for (let col = -1; col * stepX < s.W + 200; col++) {
        const off = (row & 1) * (stepX / 2); // 奇偶行错位 → 重叠感
        const xx = col * stepX + off - 40;
        // 每个水印自己的呼吸（错开相位，整片像在流动）
        const ph = s.noise(col * 3.1 + row * 7.7, 71);
        const a = (0.06 + 0.46 * lit) * (0.6 + 0.4 * ph) * (0.7 + 0.3 * Math.sin(ms / 1400 + ph * 6));
        shieldStamp(xx, yy, W, a, tilt);
      }
    }
  }
  label(ctx, s, 1420, 300, "protection", UI.blue, TYPE.SUB, auroraInk(ms, tProt), 600);
  label(ctx, s, 1420, 328, "// a shell, not a soul", null, TYPE.CAPTION, INK.GHOST);
  /** 那句最亮时读数才出现，之后淡掉 */
  function auroraInk(t, tAt) {
    const p = clamp01((t - tAt) / 600);
    return p * (t < tAt + 3400 ? 1 : Math.max(0.3, 1 - (t - tAt - 3400) / 2600));
  }

  // ---- 棋子从头顶掉落（实例化）----
  // `Lay down your pieces`：**同一个造型**反复落下，只是时刻/横向位置不同。
  // 镜头是俯视的 —— 所以它们从画面上方掉进来，落进看不见的棋盘。
  const tPieces = L.find("Lay down your pieces")[0]?.start ?? beatToMs(8);
  if (ms >= tPieces - 500) {
    const BOARD_Y = 880;
    const N = 11;
    const KINDS = ["pawn", "pawn", "rook", "pawn", "bishop", "pawn", "rook", "pawn", "bishop", "pawn", "rook"];
    for (let i = 0; i < N; i++) {
      const t0 = tPieces + i * 210;
      const dt = ms - t0;
      if (dt < 0) continue;
      const fall = clamp01(dt / 620);
      const e = fall < 1 ? fall * fall : 1; // 加速下落
      const x = 200 + ((i * 271) % 1500);
      // 落地后轻微弹一下
      const bounce = dt > 620 ? Math.max(0, Math.sin((dt - 620) / 90)) * (1 - clamp01((dt - 620) / 500)) * 16 : 0;
      const y = lerp(-160, BOARD_Y, e) - bounce;
      const settled = clamp01((dt - 700) / 400);
      chessPiece(ctx, s, x, y, 92, KINDS[i], 0.35 + 0.55 * settled);
      // 落点标记（落地时一圈扩散）
      if (dt >= 600 && dt < 1400) {
        const rp = (dt - 600) / 800;
        ctx.strokeStyle = rgba(UI.text, 0.35 * (1 - rp));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, BOARD_Y + 4, (20 + rp * 70), (8 + rp * 26), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ---- `Fill in my data parameters`：字符从画面四边涌出，向底部那排棋子逼近 ----
  // 用户要求（2026-09-29）：不是从天上掉东西，而是**从边缘往里涌**、朝着棋子聚过去。
  // 所以每个字符有一条「从画面外的某条边 → 棋子附近」的路径，错峰循环，
  // 一直有新的补上来（不是一次性播完）。`Setup our new world` 一到就撤。
  const PIECE_Y = 880;
  const swarmA = clamp01((ms - tFill - 150) / 600) * (1 - clamp01((ms - tWorld) / 700));
  if (swarmA > 0.002) {
    const NCH = 150;
    ctx.save();
    ctx.font = s.mono(22);
    for (let i = 0; i < NCH; i++) {
      const edge = Math.floor(s.noise(i * 1.7, 81) * 4) % 4; // 从哪条边进来
      const u = s.noise(i * 2.9 + 0.5, 82);
      const v = s.noise(i * 4.3 + 0.9, 83);
      // 目标：**钉在棋子们身上**（棋子 x = 200 + (i*271)%1500），左右略散开
      const pi = i % 11;
      const px = 200 + ((pi * 271) % 1500);
      const tx = px + (u - 0.5) * 90;
      const ty = PIECE_Y - 16 - v * 150;
      let sx;
      let sy;
      if (edge === 0) { sx = -90; sy = v * s.H; }
      else if (edge === 1) { sx = s.W + 90; sy = v * s.H; }
      else if (edge === 2) { sx = u * s.W; sy = -70; }
      else { sx = u * s.W; sy = s.H + 70; }
      // 错峰 + 循环：每个字符有自己的周期，所以是一直在涌，不是播一轮就完
      const cycle = 2100 + (i % 7) * 190;
      const ph = ((((ms - tFill - i * 47) % cycle) + cycle) % cycle) / cycle;
      const e = clamp01(ph / 0.72);
      const k = e * e * (3 - 2 * e); // smoothstep：接近时减速
      const x = lerp(sx, tx, k);
      const y = lerp(sy, ty, k);
      const a = swarmA * (0.22 + 0.6 * s.noise(i * 5.1, 84)) * (1 - clamp01((ph - 0.86) / 0.14));
      // 字符自己也在跳（每 220ms 换一个）
      const ch = "0123456789{}[]<>/#*+=".charAt(
        Math.floor(s.noise(i * 3.3 + Math.floor(ms / 220) * 1.1, 85) * 20) % 20,
      );
      ctx.fillStyle = rgba(UI.blue, a);
      ctx.fillText(ch, x, y);
    }
    ctx.restore();
  }

  // 歌词：一句一句打字机（时间来自歌词表）
  const lines = [
    ["Switch on the power line", 0],
    ["Remember to put on protection", 4],
    ["Lay down your pieces", 8],
    ["And let's begin object creation", 12],
    ["Fill in my data parameters initialisation", 16],
    ["Setup our new world", 24],
  ];
  let ty = pbY - 60;
  for (const [text, beat] of lines) {
    const t0 = L.find(text)[0]?.start ?? beatToMs(beat);
    if (ms < t0 - 400) continue;
    const n = typewriter(ctx, s, pbX + 120, ty, text, t0, { cps: 16, size: 28 });
    // 打完的那一句：底下点阵进度条跟着这句的唱完程度走
    if (n >= text.length) {
      const l = L.find(text)[0];
      const p = l ? L.wordProgress(l.words[l.words.length - 1], ms) : 1;
      dottedBar(ctx, s, pbX + 120, ty + 16, 420, 12, p);
    }
    ty += 62;
    if (ty > 900) break;
  }

  // 底部：按任意键开始（参考片的提示语，用我们自己的说法）
  const anyKey = ms > 10500;
  if (anyKey && Math.floor(ms / 520) % 2 === 0) {
    label(ctx, s, 700, 960, "[Press any key to start simulation]", null, 26, 0.75);
  }

  // 左上角：开机日志（机器的自白）
  label(ctx, s, 80, 112, "SYSTEM BOOT", null, TYPE.SUB, INK.SUB);
  label(ctx, s, 80, 140, `t+${(ms / 1000).toFixed(2)}s`, null, 16, 0.25);
  pun(ctx, s, 80, 1030, "switch on the power line", 16, 0.35);
}
