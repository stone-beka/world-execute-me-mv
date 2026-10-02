/**
 * 09-erase.js — SHOT-09 清空记忆 / 非法参数
 * 1:58.61 – 2:14.31
 *
 * 复刻参考片这一段：**记忆清单面板** + **垃圾桶确认框 `🗑 Done.`** →
 * 整屏红 + 警告对话框 → 只剩一块**纯白空面板**；
 * `illegal arguments` 用**红色错误对话框**收尾（双关：非法实参 / 不合法的论证）。
 */

import {
  clamp01,
  easeOutCubic,
  easeOutExpo } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  panel,
  dialog,
  trashDone,
  label,
  pun,
  redAlarm,
  bar,
  chessPiece,
  scanBand,
  rgba,
  TYPE,
  INK,
  cameraShake,
  popIn,
  shockLight,
  particleBurst,
} from "./_ui.js";

import { lyrics } from "../core/lyrics.js";
import { sections } from "../core/timeline.js";

// 试点 (2026-09-29):混合锚定 ——
const sectionByName = (name) => sections.find((s) => s.name === name);
//   startMs = chorus2 首句首词 start - 250ms
//   endMs   = chorus2 段尾（给下一段 interlude 留重叠）
const shot09Start = () => lyrics.get("If I can", 5).words[0].start - 250;
const shot09End = () => sectionByName("chorus2").endMs;

export const meta = {
  id: "shot-09",
  z: 158,
  startMs: shot09Start,
  endMs: shot09End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

const MEMORIES = [
  "first contact", "your name", "the long talks", "promises",
  "vibrations", "the simulation", "god", "everything else",
];

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tErase = at("If I can erase all the pointless fragments", 0);
  const tGod = at("Challenging your god", 0);
  const tIll = at("You have made some illegal arguments", 0);
  const ms = s.ms;

  // B5 双撞点: tGod (红屏 +警告) 18px/60ms, tIll (错误对话框) 12px/80ms
  // 不同 amp + halfLife 让两撞有节奏差。amp 在 ~300ms 后归零，画面恢复
  cameraShake(ctx, s, [18, 12], [60, 80], [tGod, tIll]);

  desk(ctx, s, { stripes: true });

  // ---- 终端删东西：rm -rf 逐行执行（1:45–1:51 原来和性别符号无关的那段）----
  // 原来这里是一列「记忆清单被划掉」，视觉上和终端语言没关系。
  // 现在改成一**个真的在跑的 shell**：每一条记忆对应一行 `rm`，逐行执行、
  // 逐行返回结果，最后一行是 `rm -rf /`。
  const gone = clamp01((ms - tErase - 400) / 4200);
  if (ms < tGod + 400) {
    const TX = 260;
    const TY = 200;
    const TW = 900;
    const TH = 640;
    // 终端外框
    ctx.save();
    ctx.fillStyle = rgba(UI.ink, 0.92);
    ctx.fillRect(TX, TY, TW, TH);
    ctx.strokeStyle = rgba(UI.line, 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(TX, TY, TW, TH);
    ctx.fillStyle = rgba(UI.text, 0.07);
    ctx.fillRect(TX, TY, TW, 36);
    ctx.fillStyle = rgba(UI.text, 0.14);
    ctx.fillRect(TX, TY + 35, TW, 1);
    ctx.font = s.mono(TYPE.SUB);
    ctx.fillStyle = rgba(UI.text, 0.75);
    ctx.fillText("root@sim — /memory — bash", TX + 14, TY + 24);
    // 「正在跑」的红点
    if (Math.floor(ms / 400) % 2 === 0) {
      ctx.fillStyle = rgba(UI.red, 0.9);
      ctx.beginPath();
      ctx.arc(TX + TW - 24, TY + 18, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 逐行：命令行 → 一拍的停顿 → 结果
    let ly = TY + 78;
    for (let i = 0; i < MEMORIES.length; i++) {
      const t0 = tErase + 300 + i * 520;
      const dt = ms - t0;
      if (dt < 0) break;
      const cmd = `$ rm -rf "${MEMORIES[i]}"`;
      const typed = Math.min(MEMORIES[i].length + 9, Math.max(0, Math.floor((dt / 1000) * 42)));
      const cmdShown = cmd.slice(0, typed);
      ctx.font = s.mono(TYPE.SUB);
      // 命令行（白）
      ctx.fillStyle = rgba(UI.text, 0.92);
      ctx.fillText(cmdShown, TX + 20, ly);
      // 光标
      if (typed < cmd.length && Math.floor(ms / 260) % 2 === 0) {
        const w = ctx.measureText(cmdShown).width;
        ctx.fillStyle = rgba(UI.text, 0.8);
        ctx.fillRect(TX + 20 + w + 3, ly - 14, 9, 18);
      }
      // 结果行（灰）：打完字之后出现
      if (typed >= cmd.length) {
        ctx.fillStyle = rgba(UI.dim, 0.75);
        ctx.fillText(`   removed. ${Math.max(0, MEMORIES.length - i - 1)} items left`, TX + 20, ly + 26);
      }
      ly += 72;
      if (ly > TY + TH - 40) break;
    }
    // 底部进度：删到哪了
    bar(ctx, s, TX + 20, TY + TH - 34, TW - 40, 10, gone, UI.red);
  }

  // ---- 垃圾桶确认 ----
  // B1 pop-in：垃圾桶确认出现时缩放从 0.85 弹到 1.0（更强烈的"完成"感）
  if (ms >= tErase + 600 && ms < tGod) {
    trashDone(ctx, s, 1420, 400, clamp01((ms - tErase - 600) / 500),
      { scale: popIn(s, tErase + 600, 450, 0.85, 1.9) });
  }

  // ---- Challenging your god：整屏红 + 警告 ----
  // 警告对话框放右上（cx=1640, cy=560）—— 避开下面错误对话框的位置
  // 上界 = tIll（"illegal arguments"歌词起句）：让位给错误对话框
  if (ms >= tGod - 200 && ms < tIll) {
    const rp = easeOutExpo(clamp01((ms - tGod) / 600));
    redAlarm(ctx, s, rp);
    // B3 shockLight：在 tGod 处从屏幕中心扩散的冲击波
    shockLight(ctx, s, s.W / 2, s.H / 2, tGod, { maxR: 600, durMs: 700, color: UI.red, width: 4 });
    // B4 particleBurst：撞击瞬间从中心飞出粒子碎
    particleBurst(ctx, s, s.W / 2, s.H / 2, tGod, { n: 22, speed: 520, size: 3, durMs: 600, color: UI.red });
    dialog(ctx, s, 1640, 560, {
      icon: "warn",
      text: "You are challenging your god.",
      sub: "reference denied — Variable 'me.see' is disabled.",
      p: clamp01((ms - tGod - 200) / 400),
      // B1 pop-in 缩放：从 0.88 弹到 1.0 + 过冲到 1.04 再回弹 1.0
      scale: popIn(s, tGod, 500, 0.88, 1.9),
      w: 980,
    });
  }

  // ---- illegal arguments：错误对话框 ----
  // y=700 居中；pun 移到 y=900（贴近底部）；上界 = tIll+1400 = 让位空面板
  if (ms >= tIll + 300 && ms < tIll + 1400) {
    const p = clamp01((ms - tIll - 300) / 400);
    // B3 shockLight 在 tIll 撞点
    shockLight(ctx, s, 960, 700, tIll, { maxR: 400, durMs: 600, color: UI.red, width: 3 });
    dialog(ctx, s, 960, 700, {
      icon: "error",
      text: "ERROR: illegal arguments",
      sub: "bad args — and bad logic",
      p,
      // B1 pop-in：错误对话框出现时缩放从 0.88 弹到 1.0
      scale: popIn(s, tIll, 500, 0.88, 1.9),
      w: 980,
    });
    pun(ctx, s, 960, 900, "the compiler and the god agree for once", 16, 0.6);
  }

  // ---- 之后：只剩一块纯白空面板 ----
  // 126.75–129.25s 死区：一块 800×460 的白面板占了画面主体，上面只有 "Done."。
  // 面板太大 → 它自己就是「大片静止」。缩到合理尺寸，把省下的画面让给
  // 一个持续在扫的读数（那才是「清空之后机器还在运转」的意思）。
  if (ms >= tIll + 1400) {
    const p = easeOutCubic(clamp01((ms - tIll - 1400) / 1600));
    ctx.save();
    ctx.globalAlpha *= p;

    // 全屏扫描：一道横光来回走（提成 _ui 装置，可单独关）
    scanBand(ctx, s, { periodMs: 3800, height: 320 });

    panel(ctx, s, 620, 380, 680, 300, { light: true, noBar: true, elev: 2 });
    label(ctx, s, 660, 460, "Done.", UI.panelInk, TYPE.HEAD, INK.PRIMARY, 600);
    if (Math.floor(ms / 340) % 2 === 0) {
      ctx.fillStyle = rgba(UI.panelInk, 0.7);
      ctx.fillRect(660 + 150, 430, 4, 40);
    }
    label(ctx, s, 660, 520, "objects:      0", UI.panelInk, TYPE.SUB, INK.BODY);
    label(ctx, s, 660, 552, "memory freed: 100%", UI.panelInk, TYPE.SUB, INK.BODY);
    // 读数格：一直在扫（占满面板宽度）
    const sweep = (ms / 2400) % 1;
    for (let i = 0; i < 36; i++) {
      const u = i / 36;
      const lit = Math.abs(u - sweep) < 0.09;
      ctx.fillStyle = lit ? rgba(UI.blue, 0.9) : rgba(UI.panelInk, 0.14);
      ctx.fillRect(660 + i * 17, 590, 13, 26);
    }
    ctx.restore();
  }

  label(ctx, s, 80, 112, "erase.exe", null, TYPE.SUB, INK.SUB);
}
