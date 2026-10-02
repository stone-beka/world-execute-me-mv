/**
 * 10-aftermath.js — SHOT-10 余波（器乐，无歌词）
 * 2:14.31 – 2:26.31
 *
 * 全片最静的一段。复刻参考片"空白面板"的语言：
 * 一块几乎空的浅灰面板 + 闪烁光标 + 偶尔一条 glitch 横条；
 * 左下角一行注释 `// cache still running`（立意里那句"缓存仍在运行"）。
 */

import {
  clamp01,
  lerp } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  panel,
  label,
  pun,
  rgba,
  logConsole,
  TYPE,
  INK,
  popIn,
} from "./_ui.js";

import { sections } from "../core/timeline.js";

// 试点 (2026-09-29):interlude 段无歌词覆盖，混合锚定——
//   startMs = interlude 段起点
//   endMs   = interlude 段终点
const sectionByName = (name) => sections.find((s) => s.name === name);
const shot10Start = () => sectionByName("interlude").startMs;
const shot10End = () => sectionByName("interlude").endMs;

export const meta = {
  id: "shot-10",
  z: 159,
  startMs: shot10Start,
  endMs: shot10End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

/**
 * 这一段是 12 秒无歌词间奏，也是全片最容易「空转」的地方。
 * 原来只有一个小光标在闪 —— 12 秒里几乎什么都看不见。
 * 但它的立意是「cache still running」：**内容没了，进程还在跑**。
 * 所以这里补的不是"更多的装饰"，而是「机器独自运转的证据」：
 *   ① 一行行滚上去的空转日志（落在真实拍上，每 2 拍一条）
 *   ② 一个内存规模的图上写入 / 删除 / 空转读数
 *   ③ 清理进度环一直转 —— 永远转不完（0 objects，但还在清）
 * 全部是 (seed, ms) 的纯函数。
 */
export function draw(ctx, s) {
  const ms = s.ms;
  const t0 = 134306;
  const t1 = 146306;
  const p = clamp01((ms - t0) / (t1 - t0));

  desk(ctx, s, { stripes: true });
  // B1 主面板（"all objects deleted"那块）pop-in：间奏开始时弹出
  const flashT0 = t0 + 100;

  // 一块几乎空的面板
  panel(ctx, s, 460, 300, 1000, 480, { light: true, noBar: true,
    scale: popIn(s, t0, 600, 0.92, 1.7) });
  label(ctx, s, 520, 400, "all objects deleted.", UI.panelInk, 34, 0.8, 600);
  label(ctx, s, 520, 452, "0 / 0", UI.panelInk, 26, 0.45);

  // 清理进度环：永远转不完（0 个对象，但它还在清）—— 全段每帧都在动
  const ring = ms / 620;
  ctx.save();
  ctx.strokeStyle = rgba(UI.panelInk, 0.28);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(1320, 400, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(UI.blue, 0.8);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(1320, 400, 26, ring % (Math.PI * 2), (ring % (Math.PI * 2)) + 1.5);
  ctx.stroke();
  ctx.restore();

  // 闪烁光标（机器还在等）
  if (Math.floor(ms / 300) % 2 === 0) {
    ctx.save();
    ctx.fillStyle = rgba(UI.panelInk, 0.85);
    ctx.fillRect(520, 500, 16, 30);
    ctx.restore();
  }

  // 空转日志：每 2 拍一条，落在真实拍上（大约 0.92s 一条，覆盖整段）
  const tLog = beatToMs(280); // ≈ 2:14.4
  const LOG = [
    "> cache flush ......... no objects",
    "> scanning ... 0 matches",
    "> heartbeat ok",
    "> waiting for input",
    "> cache still running",
    "> nothing to collect",
    "> gc idle",
    "> re-listen on channel me",
    "> no response",
  ];
  logConsole(ctx, s, 520, 560, 880, {
    size: 19,
    maxLines: 6,
    lines: LOG.map((t, i) => [t, tLog + i * (2 * 461.538)]),
  });

  // ---- 象征符号闪帧：间奏不是「空等」，是机器在翻自己的记忆 ----
  // 每 1.2s 闪一次，每次 3 帧。不具象（和全片的代码/UI 语言一致），
  // 但每个都指着「你已经不在了」这件事。
  const FLASH = [
    { kind: "addr", txt: "0x0000_YOU" },
    { kind: "void", txt: "null" },
    { kind: "photo", txt: "last seen" },
    { kind: "bar", txt: "[          ]" },
    { kind: "addr", txt: "0xDEAD_ME" },
    { kind: "void", txt: "undefined" },
  ];
  const fi = Math.floor((ms - t0) / 1300);
  const fphase = ((ms - t0) % 1300) / 1300;
  if (fi < FLASH.length && fphase < 0.12) {
    const f = FLASH[fi];
    const a = 1 - fphase / 0.12;
    // B1 闪帧面板也 pop-in 一下（很轻,160ms 持续,从 0.95 弹到 1.0）
    const flashScale = popIn(s, t0 + fi * 1300, 160, 0.95, 1.6);
    ctx.save();
    ctx.translate(2040, 430);
    ctx.scale(flashScale, flashScale);
    ctx.translate(-2040, -430);
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = "rgba(10,10,12,0.72)";
    ctx.fillRect(1780, 300, 520, 260);
    ctx.strokeStyle = rgba(UI.red, 0.8);
    ctx.lineWidth = 2;
    ctx.strokeRect(1780, 300, 520, 260);
    if (f.kind === "photo") {
      // 一个空的照片框：内容用噪点填 → 「记不清了」
      ctx.fillStyle = rgba(UI.dim, 0.5);
      ctx.fillRect(1810, 330, 200, 180);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = rgba(UI.text, 0.06 + 0.1 * s.noise(i * 3.1 + fi * 17, 95));
        ctx.fillRect(1810 + s.noise(i * 2.7, 96) * 195, 330 + s.noise(i * 4.3, 97) * 175, 5, 5);
      }
      label(ctx, s, 2030, 420, "no image", UI.red, TYPE.SUB, INK.BODY);
      label(ctx, s, 2030, 452, f.txt, null, TYPE.CAPTION, INK.SUB);
    } else if (f.kind === "bar") {
      label(ctx, s, 1810, 420, f.txt, UI.warn, TYPE.HEAD, INK.PRIMARY, 700);
      // 逐格填满又清空
      const fill = Math.floor(((ms - t0) / 90) % 11);
      label(ctx, s, 1810, 460, "filling…", null, TYPE.CAPTION, INK.SUB);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i < fill ? rgba(UI.warn, 0.85) : rgba(UI.dim, 0.25);
        ctx.fillRect(1812 + i * 18, 476, 13, 18);
      }
    } else {
      label(ctx, s, 1810, 420, f.txt, f.kind === "void" ? UI.red : UI.blue, TYPE.HEAD, INK.PRIMARY, 700);
      label(ctx, s, 1810, 460, f.kind === "void" ? "value missing" : "address empty",
        null, TYPE.CAPTION, INK.SUB);
    }
    ctx.restore();
  }

  // 偶尔一条 glitch 横条（位置只跟 ms 有关，确定性）
  const band = Math.floor(ms / 900);
  const bv = s.noise(band * 2.7, 3);
  if (bv > 0.62) {
    const y = 120 + s.noise(band * 5.1, 4) * 840;
    const h = 6 + s.noise(band * 7.3, 5) * 22;
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = bv > 0.85 ? rgba(UI.red, 0.5) : rgba(UI.blue, 0.35);
    ctx.fillRect(0, y, s.W, h);
    // 错位的一小段
    const x = 200 + s.noise(band * 3.3, 6) * 1200;
    ctx.fillStyle = rgba(UI.text, 0.25);
    ctx.fillRect(x, y, 90, h);
    ctx.restore();
  }

  // 每个采样时刻都在读的内存图：0 个对象，但地址空间还在被扫（读数一直变）
  const scan = (ms * 0.0009) % 1;
  panel(ctx, s, 460, 812, 1000, 128, { noBar: true });
  label(ctx, s, 500, 858, "memory map", UI.dim, 18, 0.7);
  for (let i = 0; i < 46; i++) {
    const u = i / 46;
    const on = Math.abs(u - scan) < 0.09 || s.noise(i * 3.1 + Math.floor(ms / 220), 9) > 0.93;
    ctx.fillStyle = on ? rgba(UI.blue, 0.8) : rgba(UI.dim, 0.22);
    ctx.fillRect(700 + i * 16, 846, 10, 52 * (0.4 + 0.6 * s.noise(i * 1.7, 8)));
  }
  label(ctx, s, 500, 916, `scan ${(scan * 100).toFixed(0)}%   ·   0 objects   ·   cache ${(1.9 + 0.1 * Math.sin(ms / 700)).toFixed(2)} MB`, null, 18, 0.5);

  // 抬头 + 底部
  label(ctx, s, 80, 112, "aftermath   t+?s", null, TYPE.SUB, INK.SUB);
  label(ctx, s, 80, 144, `objects: 0`, null, TYPE.SUB, INK.GHOST);
  label(ctx, s, 80, 124, `uptime: ${((ms - t0) / 1000).toFixed(1)}s`, null, TYPE.SUB, INK.GHOST);
  pun(ctx, s, 80, 1030, "cache still running", 18, 0.5);

  void p;
}
