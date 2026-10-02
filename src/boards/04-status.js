/**
 * 04-status.js — SHOT-04 副歌 1：状态查询
 * 0:58.61 – 1:12.46
 *
 * 复刻参考片这一段：**`showStatus(me);` 表单** + **▶▶▶ 快进箭头** +
 * **Feeling Index 情绪数值面板**。
 *
 * 【构图重排 · 2026-09】原来这里是「左右两块 640px 大面板，里面全是
 * 等权重的读数行」—— 结果是没有焦点：观众不知道该看哪。
 * 重排后按**视觉层级**组织，而不是按「信息罗列」：
 *   ① 焦点：正在唱的**那一个词**，`TYPE.DISPLAY`，画面正中偏上，唯一 PRIMARY
 *   ② 支撑：一行「机器读数」贴在两角，`TYPE.SUB` + INK.SUB
 *   ③ 氛围：Feeling Index 降为背景纹理（INK.GHOST），它本来是 16 行等权列表
 * 三层一起用：尺度（96 vs 18）、明度（1.0 vs 0.55 vs 0.3）、深度（面板投影）。
 */

import { clamp01, lerp, easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import {
  UI,
  desk,
  panel,
  fieldRow,
  barcode,
  feelingIndex,
  bar,
  label,
  pun,
  rgba,
  TYPE,
  INK,
  cameraShake,
  popIn,
  shockLight,
  particleBurst,
} from "./_ui.js";

export const meta = {
  id: "shot-04",
  z: 153,
  startMs: 58614,
  endMs: 72710,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

const FEELINGS = [
  ["Delighted", 0], ["Glad", 0], ["Calm", 0], ["Peaceful", 0],
  ["Thrilled", 0], ["Loving", 0], ["Brave", 0], ["Happy", 0],
  ["Curious", 0], ["Excited", 0], ["Depressed", 0], ["Hateful", 0],
  ["Confused", 0], ["Fearful", 0], ["Empty", 0], ["Pain", 0],
];

/** 这一段的「焦点词」：跟随正在唱的词，没词时给一个默认 */
const FOCUS = [
  { at: "all the stimulations", word: "stimulations", note: "// what I can give you" },
  { at: "be your only satisfaction", word: "satisfaction", note: "// what you get back" },
  { at: "I will run the execution", word: "EXECUTION", note: "// run, or kill" },
  { at: "trapped", word: "trapped", note: "// both of us" },
  { at: "strange strange", word: "simulation", note: "// where we are stuck" },
];

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const t1 = at("If I can give you all the stimulations", 0);
  const t2 = at("Then I can be your only satisfaction", 8);
  const t3 = at("I will run the execution", 16);
  const t4 = at("Though we are trapped", 20);
  const t5 = at("In this strange strange simulation", 22);
  const ms = s.ms;

  desk(ctx, s, { stripes: true });
  // B5 双撞点：t1 (帐本开始) 轻抖, t3 (执行开始) 中抖
  cameraShake(ctx, s, [6, 12], [70, 90], [t1, t3]);
  // B3 + B4 在 t3 处从屏幕中心扩散（"执行"这一刻的爆点）
  shockLight(ctx, s, s.W / 2, s.H / 2, t3, { maxR: 480, durMs: 700, color: UI.red, width: 3 });
  particleBurst(ctx, s, s.W / 2, s.H / 2, t3, { n: 18, speed: 460, size: 3, durMs: 550, color: UI.red, seedCh: 140 });

  // ---------- ① 右侧：控制台回放（用户 2026-09-29 要求）----------
  // 命令逐字敲出 → 输出逐行滚出。一条踩 2 拍，读起来像「机器在一条条回应你」。
  // 内容先按用户选定的草稿，之后改字只需动 CONS 数组。
  {
    const CONS = [
      { cmd: "showStatus(me)" },
      { out: "scanning…" },
      { out: "vibrations   : 0.000" },
      { out: "completion   : false" },
      { out: "errors       : 1   (unfinded: you)" },
      { cmd: "patch --with love" },
      { out: "cannot write to read-only heart" },
      { cmd: "exit" },
      { out: "exit 0" },
    ];
    const BEAT2 = 2 * (beatToMs(1) - beatToMs(0)); // 2 拍（不写死 BPM）
    const tC0 = t1 - 400;
    if (ms >= tC0) {
      const CX0 = 1080;
      const CY0 = 180;
      const CW = 760;
      const CH = 440;
      ctx.save();
      ctx.fillStyle = rgba(UI.ink, 0.92);
      ctx.fillRect(CX0, CY0, CW, CH);
      ctx.strokeStyle = rgba(UI.line, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(CX0, CY0, CW, CH);
      ctx.fillStyle = rgba(UI.text, 0.08);
      ctx.fillRect(CX0, CY0, CW, 34);
      ctx.font = s.mono(TYPE.SUB);
      ctx.fillStyle = rgba(UI.text, 0.72);
      ctx.fillText("root@sim — status — bash", CX0 + 14, CY0 + 23);
      if (Math.floor(ms / 400) % 2 === 0) {
        ctx.fillStyle = rgba(UI.red, 0.9);
        ctx.beginPath();
        ctx.arc(CX0 + CW - 22, CY0 + 17, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.font = s.mono(TYPE.SUB);
      let y = CY0 + 70;
      for (let i = 0; i < CONS.length; i++) {
        const li = CONS[i];
        const t = tC0 + i * BEAT2;
        if (ms < t) break;
        if (li.cmd) {
          const shown = li.cmd.slice(0, Math.max(0, Math.floor(((ms - t) / 900) * li.cmd.length)));
          ctx.fillStyle = rgba(UI.warn, 0.9);
          ctx.fillText("$", CX0 + 18, y);
          ctx.fillStyle = rgba(UI.text, 0.92);
          ctx.fillText(shown, CX0 + 42, y);
          if (shown.length < li.cmd.length && Math.floor(ms / 260) % 2 === 0) {
            const w = ctx.measureText(shown).width;
            ctx.fillStyle = rgba(UI.text, 0.85);
            ctx.fillRect(CX0 + 42 + w + 2, y - 13, 9, 17);
          }
        } else {
          ctx.fillStyle = rgba(UI.text, 0.5);
          ctx.fillText(">", CX0 + 18, y);
          ctx.fillStyle = rgba(UI.blue, 0.85);
          ctx.fillText(li.out, CX0 + 42, y);
        }
        y += 30;
      }
      // 跑完之后：末尾一个一直闪的提示符（保证这里不是死面）
      if (ms >= tC0 + CONS.length * BEAT2 && Math.floor(ms / 520) % 2 === 0) {
        ctx.fillStyle = rgba(UI.warn, 0.9);
        ctx.fillText("$", CX0 + 18, y);
        ctx.fillStyle = rgba(UI.text, 0.85);
        ctx.fillRect(CX0 + 42, y - 13, 10, 17);
      }
      ctx.restore();
    }
  }

  // ---------- ③ 氛围层：Feeling Index 降为背景纹理（GHOST）----------
  // 原来是主角之一、占右半屏；现在它退到最后，只作为「机器在后台读数」的质感。
  if (ms >= t2 - 200) {
    ctx.save();
    ctx.globalAlpha *= 0.5;
    const items = FEELINGS.map(([n], i) => {
      const t = t2 + 300 + i * 260;
      const v = ms >= t ? (n === "Confused" || n === "Empty" ? 1 : 0) : 0;
      return [n, v];
    });
    let mark = "Happy";
    if (ms >= t5) mark = "Empty";
    else if (ms >= t4) mark = "Confused";
    feelingIndex(ctx, s, 1080, 700, 760, { items, mark, quiet: true });
    ctx.restore();
  }

  // ---------- ② 支撑层：**交易台账**（1:00–1:10 的 `If I can…Then I can…`）----------
  // 原来是贴左上角几行静态读数。现在做成一本**实时结算的账**：
  // 「If I can」记一栏付出，「Then I can」记一栏得到，逐条累加，最后结算。
  // 这首歌的结构就是一笔交易 —— 让画面把「交易」这件事说出来。
  const LEDGER = [
    { give: "all the stimulations", get: "your only satisfaction", t: t1, t2 },
    { give: "make you happy", get: "run the execution", t: 0, t: 0 },
  ];
  {
    const LX = 120;
    const LY = 180;
    const LW = 620;
    const LH = 300;
    ctx.save();
    ctx.fillStyle = rgba(UI.ink2, 0.9);
    ctx.fillRect(LX, LY, LW, LH);
    ctx.strokeStyle = rgba(UI.line, 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(LX, LY, LW, LH);
    ctx.fillStyle = rgba(UI.text, 0.07);
    ctx.fillRect(LX, LY, LW, 32);
    ctx.font = s.mono(TYPE.SUB);
    ctx.fillStyle = rgba(UI.text, 0.75);
    ctx.fillText("transaction — me ⇄ you", LX + 12, LY + 22);
    // 两栏表头
    label(ctx, s, LX + 20, LY + 66, "I GIVE", UI.red, TYPE.CAPTION, INK.BODY, 700);
    label(ctx, s, LX + 330, LY + 66, "I GET", UI.blue, TYPE.CAPTION, INK.BODY, 700);
    ctx.strokeStyle = rgba(UI.line, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LX + 20, LY + 78);
    ctx.lineTo(LX + LW - 20, LY + 78);
    ctx.stroke();
    // 逐条写入（踩歌词）
    const items = [
      { give: "stimulations", get: null, t: t1 + 400 },
      { give: null, get: "satisfaction", t: t2 + 400 },
      { give: "the execution", get: null, t: t3 + 200 },
      { give: null, get: "? trapped", t: t4 + 200 },
    ];
    let row = 0;
    for (const it of items) {
      const dt = ms - it.t;
      if (dt < 0) continue;
      const a = clamp01(dt / 400);
      const y = LY + 112 + row * 38;
      if (it.give) label(ctx, s, LX + 20, y, `- ${it.give}`, UI.red, TYPE.SUB, a * INK.BODY);
      if (it.get) label(ctx, s, LX + 330, y, `+ ${it.get}`, UI.blue, TYPE.SUB, a * INK.BODY);
      // 写入时的光标
      if (a < 1 && Math.floor(ms / 240) % 2 === 0) {
        ctx.fillStyle = rgba(UI.text, 0.7);
        ctx.fillRect(LX + (it.give ? 20 : 330) + 150, y - 14, 8, 18);
      }
      row++;
    }
    // 结算行：`you have left` 之后归零
    if (ms >= t4 + 800) {
      const a = clamp01((ms - t4 - 800) / 800);
      ctx.strokeStyle = rgba(UI.line, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LX + 20, LY + LH - 56);
      ctx.lineTo(LX + LW - 20, LY + LH - 56);
      ctx.stroke();
      label(ctx, s, LX + 20, LY + LH - 26, "balance = 0", UI.warn, TYPE.BODY, a * INK.PRIMARY, 700);
      label(ctx, s, LX + 300, LY + LH - 26, "// you left", null, TYPE.CAPTION, a * INK.GHOST);
    }
    ctx.restore();
  }
  label(ctx, s, 120, 148, "showStatus(me);", null, TYPE.CAPTION, INK.GHOST);

  // ---------- ① 焦点层：正在唱的那个词 ----------
  const f = [...FOCUS].reverse().find((x) => ms >= at(x.at, 0)) ?? FOCUS[0];
  const tF = at(f.at, 0);
  const fp = easeOutCubic(clamp01((ms - tF) / 520));
  // 手写感：轻微的抖动 + 歪下划线（机器第一次「说人话」的地方）
  const jitter = (s.noise(ms * 0.02, 31) - 0.5) * 3;
  const cx = 960;
  const cy = 470;

  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = fp;
  ctx.translate(cx + jitter, cy + (1 - fp) * 18);

  // 词本身：全片最大的字
  ctx.font = s.mono(TYPE.DISPLAY, 700);
  const w = ctx.measureText(f.word).width;
  ctx.fillStyle = rgba(UI.text, INK.PRIMARY);
  ctx.fillText(f.word, 0, 0);

  // 歪掉的下划线（手绘感的起点）
  ctx.strokeStyle = rgba(UI.text, 0.85);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 10, 26);
  ctx.bezierCurveTo(-w * 0.2, 30 + jitter, w * 0.2, 22 - jitter, w / 2 + 10, 27);
  ctx.stroke();

  // 尺寸标注：把「一个大词」变成「一个被测量过的东西」
  ctx.strokeStyle = rgba(UI.dim, INK.SUB);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -78);
  ctx.lineTo(-w / 2, 40);
  ctx.moveTo(w / 2, -78);
  ctx.lineTo(w / 2, 40);
  ctx.stroke();
  ctx.restore();

  label(ctx, s, cx, cy + 78, f.note, UI.dim, TYPE.CAPTION, INK.SUB);
  label(ctx, s, cx, cy - 96, "// the only variable that matters", UI.dim, TYPE.CAPTION, INK.GHOST);

  // satisfaction 进度条：贴在焦点词下方，作为它的「仪表」（而不是独立的一行）
  if (ms >= t2) {
    const sat = L.wordProgress(L.find("Then I can be your only satisfaction")[0]?.words.at(-1), ms);
    label(ctx, s, cx - 300, cy + 150, "satisfaction", UI.warn, TYPE.SUB, INK.BODY, 600);
    bar(ctx, s, cx - 120, cy + 134, 420, 16, sat, sat > 0.99 ? UI.blue : UI.warn);
    label(ctx, s, cx + 320, cy + 150, `${Math.round(sat * 100)}%`, UI.warn, TYPE.SUB, INK.BODY);
  }

  // 表单字段：降为左下角的小注脚（保留「逐行填满」的动作，但不再抢戏）
  const rows = ["if I can", "give you all", "the stimulations", "then I can"];
  const fillStart = t1 + 600;
  for (let i = 0; i < rows.length; i++) {
    const y = 880 + i * 40;
    const p = clamp01((ms - fillStart - i * 700) / 500);
    label(ctx, s, 180, y, rows[i], null, TYPE.CAPTION, INK.GHOST);
    ctx.save();
    ctx.beginPath();
    ctx.rect(400, y - 14, 300 * p, 16);
    ctx.clip();
    barcode(ctx, s, 400, y - 14, 300, 16, i, UI.dim);
    ctx.restore();
  }

  // ---------- ▶▶▶ 快进 ----------
  if (ms >= t3 - 300) {
    const p = easeOutCubic(clamp01((ms - t3) / 900));
    for (let i = 0; i < 3; i++) {
      const x = lerp(300, 900, p) + i * 120;
      ctx.save();
      ctx.globalAlpha *= clamp01(p * 1.2 - i * 0.12) * 0.7;
      ctx.fillStyle = rgba(UI.panel, 0.92);
      ctx.beginPath();
      ctx.moveTo(x, 880);
      ctx.lineTo(x + 86, 930);
      ctx.lineTo(x, 980);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- trapped：一圈框 ----------
  if (ms >= t4) {
    const p = easeOutCubic(clamp01((ms - t4) / 1500));
    const w = lerp(2000, 1560, p);
    const h = lerp(1300, 900, p);
    ctx.save();
    ctx.strokeStyle = rgba(UI.red, 0.75);
    ctx.lineWidth = 4;
    ctx.setLineDash([22, 12]);
    ctx.strokeRect(960 - w / 2, 500 - h / 2, w, h);
    ctx.restore();
    label(ctx, s, 960 - w / 2 + 12, 500 + h / 2 - 16, "simulation", UI.red, TYPE.BODY, INK.BODY, 600);
  }

  label(ctx, s, 80, 112, "showStatus.exe", null, TYPE.SUB, INK.SUB);
  void t5;
}
