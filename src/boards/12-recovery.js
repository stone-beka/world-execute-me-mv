/**
 * 12-recovery.js — SHOT-12 高潮：系统还原
 * 2:38.77 – 3:12.46
 *
 * 复刻参考片这一段：**`stable` 词块** + 巨型竖排 **`SYSTEM RECOVERY`** +
 * `⚙ Recent backup / Time: Unknown / Description: Uninstall simulator system /
 *  Execute System restore to "Unknown"? (Y/N)` + **跑步小人走网格条**。
 * 把"爱的代数式"做成一个求值面板：逐项长出来，最后 = NaN。
 */

import {
  clamp01,
  lerp,
  easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import {
  UI,
  desk,
  panel,
  chip,
  label,
  pun,
  runner,
  verticalText,
  wireHeart,
  bar,
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
//   startMs = final_verse 首句首词 start - 250ms
//   endMs   = final_verse 段尾（给 outro 留重叠）
const shot12Start = () => lyrics.get("Execution execution execution execution", 2).words[0].start - 250;
const shot12End = () => sectionByName("final_verse").endMs;

export const meta = {
  id: "shot-12",
  z: 161,
  startMs: shot12Start,
  endMs: shot12End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tCount = at("Ein Dos Trois Ne Fem Liu", 0);
  const tExec = at("If I can give them all the execution", 0);
  const tBack = at("If I can have you back", 0);
  const tStudy = at("I've studied how to properly", 0);
  const tAlg = at("I know the algebraic expression", 0);
  const tFree = at("Though you are free", 0);
  const tLove = at("Trapped in lo-o-ove", 0);
  const ms = s.ms;
  // 全片最后一个音（≈3:31.9）—— 尾声要一直撑到这里
  const tEnd = 211900;

  desk(ctx, s, { stripes: true });
  // B5 三撞点：tExec (执行开始) 中抖, tAlg (解方程) 重抖, tFree (自由) 中抖
  cameraShake(ctx, s, [10, 14, 10], [80, 100, 80], [tExec, tAlg, tFree]);
  // B3 + B4 在 tAlg 处从屏幕中心扩散（"解方程"是最大爆点）
  shockLight(ctx, s, s.W / 2, s.H / 2, tAlg, { maxR: 540, durMs: 800, color: UI.red, width: 3 });
  particleBurst(ctx, s, s.W / 2, s.H / 2, tAlg, { n: 20, speed: 460, size: 3, durMs: 600, color: UI.red, seedCh: 180 });

  // ============================================================
  // 层次结构（同 shot-04 的模子）：
  //   ① 焦点：正在唱的那句话，DISPLAY 档，唯一 PRIMARY
  //   ② 支撑：还原提示 / 代数式求值（HEAD~BODY 档）
  //   ③ 氛围：竖排 SYSTEM RECOVERY（GHOST，永远在水印层）
  // 原来 178–192s（"you are free / I am trapped / Trapped in love"）
  // 恰好落在所有动画跑完之后 —— 全曲最高点反而全片最静。现在焦点层
  // 接管整段尾声，代数式的 = NaN 一直挂到最后。
  // ============================================================

  // ---- ③ 氛围：竖排水印（整体缓慢漂移，永不静止）----
  const drift = (ms - tExec) * 0.004;
  ctx.save();
  ctx.globalAlpha = 0.5;
  verticalText(ctx, s, 90, 150 - (drift % 40), "SYSTEM", 64, { alpha: 0.14 });
  verticalText(ctx, s, 170, 150 - ((drift * 1.3) % 40), "RECOVERY", 64, { alpha: 0.14 });
  ctx.restore();

  // ---- 循环计数（Ein Dos Trois…）→ 镜头逐级拉远，摧毁半径翻倍 ----
  // 原来是 12 个静态 chip 逐个点亮。现在做成**视角后退**：
  // 每数一次，摧毁半径 ×1.6、镜头往后拉一档 —— 数到 6 时整个视野已经全是废墟。
  if (ms < tBack + 1500) {
    const cnt = Math.min(6, 1 + Math.floor(Math.max(0, ms - tCount) / 1400));
    const zoom = 1 / (1 + (cnt - 1) * 0.22); // 每数一次拉远 22%
    const ZX = 960;
    const ZY = 520;
    ctx.save();
    ctx.translate(ZX, ZY);
    ctx.scale(zoom, zoom);
    ctx.translate(-ZX, -ZY);

    // 废墟：半径随数数增长
    const R = 150 * Math.pow(1.6, cnt - 1);
    const shards = 46 * cnt;
    for (let i = 0; i < shards; i++) {
      const a = s.noise(i * 5.1, 91) * Math.PI * 2;
      const rr = 40 + s.noise(i * 3.7, 92) * R;
      const bx = 960 + Math.cos(a) * rr;
      const by = 520 + Math.sin(a) * rr * 0.62;
      const sz = 4 + s.noise(i * 2.3, 93) * 14;
      // 碎片缓慢自转（废墟不是一张静止的图）
      const rot = ms / 900 + i;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot * 0.35);
      ctx.strokeStyle = rgba(i % 4 === 0 ? UI.red : UI.dim, 0.28 + 0.25 * s.noise(i * 1.9, 94));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-sz, -sz * 0.6);
      ctx.lineTo(sz, -sz * 0.3);
      ctx.lineTo(sz * 0.4, sz * 0.8);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    // 冲击环：每数一次向外扩一圈
    const ringT = ((ms - tCount) / 1400) % 1;
    ctx.strokeStyle = rgba(UI.red, 0.5 * (1 - ringT));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(960, 520, 60 + ringT * R * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 计数读数（钉在屏幕上，不跟着缩放）
    const LANGS = ["Ein", "Dos", "Trois", "Ne", "Fem", "Liu"];
    label(ctx, s, 300, 180, LANGS[cnt - 1], UI.warn, TYPE.TITLE, INK.PRIMARY, 700);
    label(ctx, s, 300, 220, `i = ${cnt} / 6`, UI.blue, TYPE.BODY, INK.BODY);
    label(ctx, s, 300, 252, `radius ×${Math.pow(1.6, cnt - 1).toFixed(2)}   zoom ×${zoom.toFixed(2)}`,
      null, TYPE.CAPTION, INK.SUB);
    label(ctx, s, 300, 282, "// one step, one more thing gone", null, TYPE.CAPTION, INK.GHOST);
  }

  // ---- ② 支撑：系统还原提示 ----
  if (ms >= tExec + 1200 && ms < tFree + 800) {
    const p = easeOutCubic(clamp01((ms - tExec - 1200) / 900));
    const fadeOut = clamp01((tFree + 800 - ms) / 600);
    ctx.save();
    ctx.globalAlpha *= p * fadeOut;
    panel(ctx, s, 1220, 200, 620, 300, { light: true, noBar: true, elev: 1 });
    const cx = 1300;
    const cy = 280;
    ctx.strokeStyle = rgba(UI.red, 0.9);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0.4, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 30, cy - 9);
    ctx.lineTo(cx + 30, cy + 20);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fillStyle = rgba(UI.red, 0.9);
    ctx.fill();
    label(ctx, s, 1352, 278, "Recent backup", UI.panelInk, TYPE.BODY, INK.PRIMARY, 600);
    label(ctx, s, 1290, 320, "Time:        Unknown", UI.panelInk, TYPE.SUB, INK.BODY);
    label(ctx, s, 1290, 350, "Description: Uninstall simulator system", UI.panelInk, TYPE.SUB, INK.BODY);
    ctx.restore();
  }

  // ---- 跑步小人（进度条）----
  if (ms >= tBack && ms < tFree + 800) {
    const p = clamp01((ms - tBack) / 5200);
    panel(ctx, s, 1220, 540, 620, 110, { light: true, noBar: true, elev: 1 });
    ctx.save();
    ctx.strokeStyle = rgba(UI.panelInk, 0.18);
    ctx.lineWidth = 1;
    for (let x = 1240; x < 1820; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 560);
      ctx.lineTo(x, 630);
      ctx.stroke();
    }
    ctx.restore();
    runner(ctx, s, lerp(1280, 1780, p), 592, 1.1, ms);
    label(ctx, s, 1240, 670, `restore ${Math.round(p * 100)}%`, UI.panelInk, TYPE.CAPTION, INK.BODY);
  }

  // ---- ① 焦点层：正在唱的那句话 ----
  const FOCUS = [
    { t: tBack, text: "have you back", note: "// what I'm actually asking for" },
    { t: tStudy, text: "I've studied love", note: "// how to properly lo-o-ove" },
    { t: tAlg, text: "love = NaN", note: "// unresolved symbol: you", red: true },
    { t: tFree, text: "you are free", note: "// I am trapped", red: false },
  ];
  const f = [...FOCUS].reverse().find((x) => ms >= x.t - 400) ?? FOCUS[0];
  const fp = easeOutCubic(clamp01((ms - (f.t - 400)) / 700));
  const jitter = (s.noise(ms * 0.018, 41) - 0.5) * 3;
  // 焦点词在它自己的整段里持续呼吸：入场先冲一下，之后缓慢增减 6%。
  // 不然「进完场就停」—— 这正是 178–184s 还剩下 5.8s 静止的原因。
  const breathe = 1 + Math.sin((ms - f.t) / 900) * 0.06;
  const cx = 830;
  const cy = 880;

  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = fp;
  ctx.translate(cx + jitter, cy + (1 - fp) * 20);
  ctx.scale(breathe, breathe);
  ctx.font = s.mono(TYPE.TITLE, 700);
  const w = ctx.measureText(f.text).width;
  ctx.fillStyle = rgba(f.red ? UI.red : UI.text, INK.PRIMARY);
  ctx.fillText(f.text, 0, 0);
  ctx.strokeStyle = rgba(f.red ? UI.red : UI.text, 0.85);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 8, 20);
  ctx.bezierCurveTo(-w * 0.2, 24 + jitter, w * 0.2, 16 - jitter, w / 2 + 8, 21);
  ctx.stroke();
  ctx.restore();
  label(ctx, s, cx, cy + 54, f.note, UI.dim, TYPE.CAPTION, INK.SUB);

  // ---- 爱的代数式：撑到最后 ----
  if (ms >= tStudy - 600) {
    const rows = [
      ["love =", tStudy, UI.blue],
      ["Σ ( vibrations · completion )", at("Question me I can answer", 0), UI.text],
      ["÷ ( fragments + isolation )", tAlg, UI.text],
      ["+ you", tAlg + 600, UI.warn],
    ];
    panel(ctx, s, 180, 300, 640, 300, { title: "evaluate — love", dots: true, elev: 1 });
    let y = 390;
    for (const [text, tAt, hex] of rows) {
      const p = clamp01((ms - tAt) / 700);
      if (p > 0) label(ctx, s, 220, y, text, hex, TYPE.BODY, p * INK.BODY, 600);
      y += 46;
    }
    if (ms >= tAlg + 1400) {
      const p = clamp01((ms - tAlg - 1400) / 600);
      // 一点点持续的抖动：这个 NaN 永远不会「算完」
      const shake = Math.sin(ms / 90) * 2 * p;
      label(ctx, s, 220 + shake, y + 14, "=  NaN", UI.red, TYPE.HEAD, p, 700);
      label(ctx, s, 220, y + 48, "unresolved symbol: you", UI.red, TYPE.CAPTION, p * INK.SUB);
    }
  }

  // ---- 结尾：线框爱心 ----
  if (ms >= tFree) {
    const p = clamp01((ms - tFree) / 1400);
    wireHeart(ctx, s, 830, 700, 150 * (0.5 + p * 0.5), { alpha: (0.35 + 0.25 * s.noise(ms * 0.001, 44)) * p, mesh: true });
  }

  // ---- 尾声的第二个活物：「你在哪」的持续搜索 ----
  // 178–183s（have you back）原本只有一个大字在呼吸，静止判据过不去。
  // 这里加一个**永远在扫**的读数条：它在找一个不存在的对象，扫不到就是重点。
  if (ms >= tBack && ms < tFree) {
    const scan = ((ms - tBack) / 2600) % 1;
    const px = 1240;
    const py = 800;
    label(ctx, s, px, py, "searching for: you", UI.dim, TYPE.SUB, INK.BODY);
    // 扫掠条：一格格点亮过去，扫到头再从左边开始（永远扫不到）
    for (let i = 0; i < 32; i++) {
      const u = i / 32;
      const lit = Math.abs(u - scan) < 0.07;
      ctx.fillStyle = lit ? rgba(UI.red, 0.85) : rgba(UI.dim, 0.3);
      ctx.fillRect(px + i * 19, py + 18, 14, 26);
    }
    label(ctx, s, px, py + 82, `found: 0 results   ·   retry ${Math.floor((ms - tBack) / 2600) + 1}`,
      UI.red, TYPE.CAPTION, INK.SUB);
  }

  // 最后的进度：一直走到全片结束（原来 178s 就到头了）
  bar(ctx, s, 830 - 210, 966, 420, 8, clamp01((ms - tFree) / (tEnd - tFree)), UI.red);

  label(ctx, s, 80, 112, "recovery.exe", null, TYPE.SUB, INK.SUB);
}
