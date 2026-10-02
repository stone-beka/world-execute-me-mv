/**
 * 05-inspect.js — SHOT-05 主歌 2 前半：检视我变成的东西
 * 1:12.46 – 1:20.31
 *
 * 复刻参考片的"检视/属性面板"语言：一个浅色属性面板 + 一个物件预览框 +
 * 复选框列表。每唱一句，物件换一个（茄子 → 番茄），属性行跟着改：
 *   type / offers / risk，并盖上一个 `setting world v6.12 exe` 式的白底徽章。
 */

import {
  clamp01,
  lerp,
  easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  panel,
  checkbox,
  label,
  labelDecode,
  pun,
  bar,
  rgba,
  TYPE,
  INK,
  cameraShake,
  popIn,
} from "./_ui.js";

import { lyrics } from "../core/lyrics.js";

// 试点 (2026-09-29):歌词驱动
//   startMs = verse2a 首句首词 start - 250ms
//   endMs   = verse2a 末句 end
const shot05Start = () => lyrics.get("In this strange strange simulation").words[0].start - 250;
const shot05End = () => lyrics.get("Then I'll give you antioxidants").end;

export const meta = {
  id: "shot-05",
  z: 154,
  startMs: shot05Start,
  endMs: shot05End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

const ITEMS = [
  ["If I'm an eggplant", "EGGPLANT", "vegetable", "nutrients", "innuendo"],
  ["Then I will give you my nutrients", "EGGPLANT", "vegetable", "nutrients", "none"],
  ["If I'm a tomato", "TOMATO", "vegetable", "antioxidants", "mild"],
  ["Then I'll give you antioxidants", "TOMATO", "vegetable", "antioxidants", "none"],
];

export function draw(ctx, s) {
  const L = s.lyrics;
  const ms = s.ms;
  let idx = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    const t = L.find(ITEMS[i][0])[0]?.start ?? beatToMs(i * 4);
    if (ms >= t) idx = i;
  }
  const it = ITEMS[idx];
  const t0 = L.find(it[0])[0]?.start ?? beatToMs(idx * 4);
  const swap = easeOutCubic(clamp01((ms - t0) / 320));

  desk(ctx, s, { stripes: true });
  // B5 物件切换瞬间轻抖
  cameraShake(ctx, s, 5, 60, t0);

  // ---- 物件预览框（几何图形代表，不画写实蔬菜）----
  panel(ctx, s, 160, 220, 520, 520, { title: "object", dots: true, scale: popIn(s, t0, 500, 0.92, 1.7) });
  ctx.save();
  ctx.translate(420, 480);
  ctx.scale(swap, swap);
  ctx.strokeStyle = rgba(UI.text, 0.85);
  ctx.fillStyle = rgba(UI.text, 0.12);
  ctx.lineWidth = 3;
  const r = 130;
  if (it[1] === "EGGPLANT") {
    ctx.beginPath();
    ctx.ellipse(0, 20, r * 0.5, r * 0.85, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, -r * 0.76);
    ctx.lineTo(24, -r * 1.0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 24, r * 0.74, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 24 - r * 0.7);
      ctx.lineTo(Math.cos(a) * r * 0.3, 24 - r * 0.7 - Math.sin(a) * r * 0.3);
      ctx.stroke();
    }
  }
  ctx.restore();
  label(ctx, s, 190, 700, it[1], null, 26, 0.9, 700);

  // ---- 属性面板（浅色，参考片那种白底黑字）----
  // 【改 2026-09-29】用户要求：里面的字出现时要有**动态字效**（像加载动画）。
  // 用 labelDecode：先一串乱码，再逐字「解」成真字；每行错峰 130ms。
  panel(ctx, s, 740, 220, 660, 520, { light: true, title: null, noBar: true });
  const dec = (i) => clamp01((ms - t0 - 220 - i * 130) / 460);
  labelDecode(ctx, s, 780, 300, `type:    ${it[2]}`, dec(0), { hex: UI.panelInk, size: TYPE.BODY, alpha: 0.9, weight: 600, seed: 11 });
  labelDecode(ctx, s, 780, 356, `offers:  ${it[3]}`, dec(1), { hex: UI.panelInk, size: TYPE.BODY, alpha: 0.9, weight: 600, seed: 23 });
  labelDecode(ctx, s, 780, 412, `risk:    ${it[4]}`, dec(2), { hex: UI.panelInk, size: TYPE.BODY, alpha: 0.9, weight: 600, seed: 37 });
  bar(ctx, s, 780, 460, 520, 14, clamp01((ms - t0) / 1800), UI.blue);
  labelDecode(ctx, s, 780, 500, "offering…", dec(3), { hex: UI.panelInk, size: TYPE.SUB, alpha: 0.6, seed: 41 });

  // ---- 复选框列表：它"能成为"的清单 ----
  const boxes = [
    ["eggplant", idx >= 0],
    ["tomato", idx >= 2],
    ["tabby cat", false],
    ["the only god", false],
  ];
  labelDecode(ctx, s, 780, 580, "can become:", dec(4), { hex: UI.panelInk, size: TYPE.SUB, alpha: 0.55, seed: 53 });
  for (let i = 0; i < boxes.length; i++) {
    checkbox(ctx, s, 800, 626 + i * 40, { label: boxes[i][0], checked: boxes[i][1], light: true });
  }

  // ---- 白底徽章：**跟着歌词变**（用户 2026-09-29；原来写死 `v6.12`，一直不动）----
  // 第一行 = 正在唱的那个词（“世界”的名字一直在变）；
  // 第二行 = 当前属性 + 这句唱到几成 —— 所以它每一句都在动。
  const bd = clamp01((ms - t0 - 400) / 800);
  if (bd > 0.002) {
    ctx.save();
    ctx.globalAlpha *= bd;
    ctx.fillStyle = rgba(UI.panel, 0.96);
    ctx.fillRect(1180, 780, 560, 110);
    const word = s.word?.w ?? s.line?.text ?? it[1];
    const lp = s.line ? s.lyrics.lineCharProgress(s.line, ms) : 0;
    label(ctx, s, 1210, 830, `setting world  "${word}"`, UI.panelInk, TYPE.BODY, INK.PRIMARY, 700);
    label(ctx, s, 1210, 866, `exe — ${it[3]}   ·   ${Math.round(lp * 100)}%`, UI.panelInk, TYPE.SUB, INK.SUB);
    ctx.restore();
  }

  label(ctx, s, 80, 112, "items.exe", null, TYPE.SUB, INK.SUB);
  pun(ctx, s, 140, 1000, it[4] === "innuendo" ? "the innuendo is the point" : "offered, not asked", 16, 0.4);
}
