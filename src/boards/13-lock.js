/**
 * 13-lock.js — SHOT-13 锁定：输入新密码
 * 1 3:12.46 – 3:27.23
 *
 * 复刻参考片的密码屏：**网格底 + `Type New Password` + 密码输入框**。
 * 机器一遍遍试着登录（每次都失败），颜色一点点褪掉，
 * 最后（3:25.96 那句 Execution）整屏出错，只剩一颗线框爱心。
 */

import {
  clamp01,
  lerp } from "../core/kernel.js";
import { beatToMs,
  MS_PER_BEAT } from "../core/timeline.js";
import { UI,
  desk,
  panel,
  label,
  pun,
  wireHeart,
  gridBg,
  rgba,
  TYPE,
  INK,
  cameraShake,
  popIn,
  shockLight,
  particleBurst
} from "./_ui.js";

// shot-13 = outro 段收尾画板（"关灯"视觉），不是歌词驱动的:
//   startMs 跟 shot-12 末
//   endMs   跟 outro 段终（207229ms），给 silence_tail 留 fadeIn
// 歌词末尾 "Execution" (205960ms) 在此之前很久就唱完，
// 画板区间要延伸到整段 outro 才有意义——不适合歌词锚定。
export const meta = {
  id: "shot-13",
  z: 162,
  startMs: 192460,
  endMs: 207429,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  // 注意：不能直接 L.find("Execution")[0] —— 那会抓到 2:27 那句。
  // 这里只要**本段内**的那一次（3:25.96）。
  const tLast =
    L.lines.find((l) => l.start >= 192460 && l.text.toLowerCase().includes("execution"))?.start ??
    beatToMs(30);
  const ms = s.ms;
  const t0 = 192460;
  const p = clamp01((ms - t0) / (tLast - t0));
  // B5 LOCKED 撞点：tLast - 500 处重抖（"锁死"的瞬间）
  cameraShake(ctx, s, 16, 110, tLast - 500);
  // B3 + B4 LOCKED 时从屏幕中心扩散
  shockLight(ctx, s, s.W / 2, s.H / 2, tLast - 500, { maxR: 600, durMs: 900, color: UI.red, width: 4 });
  particleBurst(ctx, s, s.W / 2, s.H / 2, tLast - 500, { n: 24, speed: 520, size: 3.5, durMs: 700, color: UI.red, seedCh: 190 });

  // 网格底（越到后面越暗）—— 网格缓慢漂移 + 呼吸，不再是静态底
  gridBg(ctx, s, { cell: 22, alpha: 0.09 * (1 - p * 0.5), live: true });

  // 左上角：**摄像头风格的监视叠层**（2:50 之后 = 3:10 起）
  // 内容是一个监控画面：时间码 / REC 红点 / 四角取景框 / 扫描线。
  // 右下角那份「attachments 风格的框」在这里换成监控读数，避免和别处重复。
  const camT = 207500 - 5000; // 约 3:22.5 起转为监控
  if (ms >= camT) {
    const cp = clamp01((ms - camT) / 1200);
    const cw = 560;
    const ch = 320;
    const cxx = 1240;
    const cyy = 640;
    // 取景框四角
    ctx.save();
    ctx.globalAlpha = cp;
    ctx.strokeStyle = rgba(UI.text, 0.8);
    ctx.lineWidth = 2;
    const arm = 34;
    const corners = [
      [cxx, cyy, 1, 1], [cxx + cw, cyy, -1, 1],
      [cxx, cyy + ch, 1, -1], [cxx + cw, cyy + ch, -1, -1],
    ];
    for (const [bx, by, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(bx + sx * arm, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by + sy * arm);
      ctx.stroke();
    }
    // 扫描线
    const sy2 = cyy + ((ms / 14) % ch);
    ctx.fillStyle = rgba(UI.text, 0.10);
    ctx.fillRect(cxx, sy2, cw, 2);
    ctx.fillStyle = rgba(UI.text, 0.04);
    ctx.fillRect(cxx, sy2 - 40, cw, 40);
    // 时间码
    const tsec = (ms - t0) / 1000;
    const tc = `${String(Math.floor(tsec / 60)).padStart(2, "0")}:${String(Math.floor(tsec % 60)).padStart(2, "0")}:${String(Math.floor((tsec * 60) % 60)).padStart(2, "0")}`;
    label(ctx, s, cxx + 6, cyy - 14, `REC ${tc}`, UI.red, TYPE.SUB, INK.PRIMARY, 600);
    if (Math.floor(ms / 500) % 2 === 0) {
      ctx.fillStyle = rgba(UI.red, 0.95);
      ctx.beginPath();
      ctx.arc(cxx + 168, cyy - 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    label(ctx, s, cxx, cyy + ch + 26, "CAM-01  sim.room  ·  no signal from you",
      null, TYPE.CAPTION, INK.SUB);
    // 帧率读数（真的在动）
    label(ctx, s, cxx + cw - 92, cyy - 14, `${(29.97).toFixed(2)} fps`, null, TYPE.CAPTION, INK.SUB);
    ctx.restore();
  }

  // ---- 密码面板 ----
  panel(ctx, s, 520, 300, 880, 460, { light: true, noBar: true });
  label(ctx, s, 580, 400, "Type New Password", UI.panelInk, 34, 0.9, 700);
  label(ctx, s, 580, 446, "for user: [Unfinded]", UI.panelInk, 20, 0.5);

  // 输入框 + 圆点（一遍遍试）
  const attempts = Math.floor((ms - t0) / 2600);
  const cur = clamp01(((ms - t0) % 2600) / 1400);
  ctx.save();
  ctx.strokeStyle = rgba(UI.panelInk, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(580, 500, 760, 56);
  const dots = Math.round(cur * 14);
  ctx.fillStyle = rgba(UI.panelInk, 0.9);
  for (let i = 0; i < dots; i++) {
    // 每个点都在轻轻脉动（原来完全静止 —— 194.5–202.75s 那 8.25s 死区的主因）
    const pulse = 1 + 0.22 * Math.sin(ms / 260 + i * 0.9);
    ctx.beginPath();
    ctx.arc(610 + i * 26, 528, 9 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 光标一直闪（即使 dot 填满了「这次尝试」也还在跑）
  if (dots >= 14 && Math.floor(ms / 320) % 2 === 0) {
    ctx.fillStyle = rgba(UI.panelInk, 0.5);
    ctx.fillRect(610 + 14 * 26, 512, 4, 32);
  }
  label(ctx, s, 580, 596, `attempt ${attempts + 1}`, UI.panelInk, 20, 0.6);
  if (attempts > 0) {
    label(ctx, s, 760, 596, "× incorrect password", UI.red, 20, 0.85, 600);
  }

  // 提示（等一等）
  label(ctx, s, 580, 660, "hint: love is not a password", UI.panelInk, 19, 0.45);
  pun(ctx, s, 580, 700, "brute force, on the wrong space", 16, 0.35);

  // ---- 结尾：整屏出错 + 线框爱心 ----
  // 2:16 那片「字太浅看不清」：红色 wash 叠在浅色面板上，panelInk 的对比被吃掉了。
  // 这里把面板底色压深、字改白，保证在红屏下仍然读得出来。
  const fail = clamp01((ms - (tLast - 500)) / 900);
  if (fail > 0) {
    ctx.save();
    ctx.fillStyle = rgba(UI.red, 0.16 * fail);
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= fail;
    ctx.fillStyle = "rgba(12,12,16,0.94)";
    ctx.fillRect(560, 300, 800, 460);
    ctx.strokeStyle = rgba(UI.red, 0.9);
    ctx.lineWidth = 3;
    ctx.strokeRect(560, 300, 800, 460);
    ctx.restore();
    label(ctx, s, 620, 420, "LOCKED", UI.red, TYPE.DISPLAY, 0.95 * fail, 700);
    label(ctx, s, 620, 520, `${attempts + 1} failed attempts`, UI.white, TYPE.BODY, 0.92 * fail, 600);
    label(ctx, s, 620, 566, "you = [Unfinded]", UI.white, TYPE.BODY, 0.92 * fail, 600);
    label(ctx, s, 620, 612, "me  = still running", UI.dim, TYPE.SUB, 0.9 * fail);
  }
  if (ms >= tLast - 300) {
    const hp = clamp01((ms - (tLast - 300)) / 1800);
    wireHeart(ctx, s, 960, 880, 150, { alpha: 0.7 * hp, fillP: hp, mesh: false });
  }

  // 逐渐收黑
  const dim = clamp01((ms - tLast - 300) / 2400);
  if (dim > 0) {
    ctx.save();
    ctx.fillStyle = rgba(UI.ink, dim * 0.9);
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.restore();
  }

  label(ctx, s, 80, 112, "lock.exe", null, TYPE.SUB, INK.SUB);
  label(ctx, s, 80, 144, `bpm: ${Math.round(lerp(72, 0, p))}`, null, TYPE.SUB, INK.GHOST);
  void MS_PER_BEAT;
}
