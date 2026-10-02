/**
 * 07-settings.js — SHOT-07 预副歌：设置面板
 * 1:28.61 – 1:36.46
 *
 * 复刻参考片的"开关"语言：一块设置面板，三行开关：
 *   gender [F|M]   time [AM|PM]   role [S|M]
 * 每唱一句翻一个（开关滑动 + 咔哒）；右侧一行等宽配置读数跟着变；
 * "enter the trance" 时三个开关一起狂翻，面板本身开始轻微旋转。
 */

import {
  clamp01 } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  panel,
  toggle,
  label,
  pun,
  rgba,
  TYPE,
  INK,
  cameraShake,
  popIn,
  shockLight,
} from "./_ui.js";

import { lyrics } from "../core/lyrics.js";

// 试点 (2026-09-29):歌词驱动
//   startMs = prechorus_a 首句首词 start - 250ms
//   endMs   = prechorus_a 末句 end
const shot07Start = () => lyrics.get("Then you're the proof of my existence").words[0].start - 250;
const shot07End = () => lyrics.get("Oh switch my role").end;

export const meta = {
  id: "shot-07",
  z: 156,
  startMs: shot07Start,
  endMs: shot07End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tF = at("To F to M", 0);
  const tAM = at("From AM to PM", 8);
  const tS = at("To S to M", 16);
  const tTrance = at("So we can enter", 24);
  const ms = s.ms;

  desk(ctx, s, { stripes: true });
  // B5 trance 进入瞬间重抖（"进入恍惚"）
  cameraShake(ctx, s, 14, 100, tTrance);
  // B3 冲击波从屏幕中心扩散
  shockLight(ctx, s, s.W / 2, s.H / 2, tTrance, { maxR: 540, durMs: 800, color: UI.warn, width: 3 });

  const trance = clamp01((ms - tTrance) / 700);
  ctx.save();
  ctx.translate(960, 520);
  ctx.rotate(0.02 * Math.sin(ms / 130) * trance);
  ctx.translate(-960, -520);

  panel(ctx, s, 300, 220, 900, 520, { title: "settings — me", dots: true, scale: popIn(s, tF, 600, 0.9, 1.8) });

  const rows = [
    ["gender", "F", "M", tF, "female ⇄ male"],
    ["time", "AM", "PM", tAM, "morning ⇄ afternoon"],
    ["role", "S", "M", tS, "the other kind of switch"],
  ];
  // 机器在轮询自己的设置：每 2 拍把「选中行」往下挪一格。
  // 原来只有歌词到点时开关才动，中间 3 秒画面完全静止 —— 现在空档里它在闪。
  const focus = ((Math.floor(s.beat / 2) % 3) + 3) % 3;
  for (let i = 0; i < rows.length; i++) {
    const [name, a, b, tAt, note] = rows[i];
    const y = 350 + i * 130;
    if (i === focus) {
      ctx.strokeStyle = rgba(UI.blue, 0.5);
      ctx.lineWidth = 2;
      ctx.strokeRect(330, y - 44, 840, 92);
    }
    const auto = trance > 0 ? (Math.sin((ms - tTrance) * 0.02 + i) > 0 ? 1 : 0) : 0;
    const on = trance > 0 ? auto : ms >= tAt ? 1 : 0;
    const p = clamp01((ms - tAt) / 300);

    label(ctx, s, 350, y + 8, name, null, 28, 0.9, 600);
    label(ctx, s, 640, y + 8, a, on ? UI.dim : UI.text, 26, on ? 0.35 : 0.95, 700);
    toggle(ctx, s, 760, y, { on: on === 1, p });
    label(ctx, s, 900, y + 8, b, on ? UI.text : UI.dim, 26, on ? 0.95 : 0.35, 700);
    pun(ctx, s, 350, y + 42, note, 16, 0.4);

    // 咔哒：翻的那一下在开关旁闪一个方块
    if (p > 0 && p < 1) {
      ctx.fillStyle = rgba(UI.blue, (1 - p) * 0.5);
      ctx.fillRect(760 - 10, y - 40, 106, 80);
    }
  }

  // 右侧：配置读数（等宽，机器在念自己的配置）
  const cfg = [
    `gender = ${ms >= tF || trance > 0 ? '"M"' : '"F"'}`,
    `time   = ${ms >= tAM || trance > 0 ? '"PM"' : '"AM"'}`,
    `role   = ${ms >= tS || trance > 0 ? '"M"' : '"S"'}`,
  ];
  panel(ctx, s, 1240, 220, 520, 300, { title: "config", noBar: true });
  for (let i = 0; i < cfg.length; i++) label(ctx, s, 1280, 300 + i * 44, cfg[i], UI.blue, 22, 0.85);
  // 活读数：影片时钟（秒）。数字是真的，而且每帧都在变 ——
  // 它在"等下一句歌词"的那几秒里保证画面不是死的。
  label(ctx, s, 1280, 300 + cfg.length * 44, `t = ${(ms / 1000).toFixed(3)} s`, null, 18, 0.45);
  if (Math.floor(ms / 300) % 2 === 0) {
    ctx.fillStyle = rgba(UI.blue, 0.85);
    ctx.fillRect(1420, 300 + cfg.length * 44 - 14, 12, 18);
  }
  ctx.restore();

  // trance：面板外一圈抖动的文字
  if (trance > 0) {
    for (let k = 0; k < 8; k++) {
      const a = ms * 0.003 + k * 0.79;
      label(
        ctx,
        s,
        960 + Math.cos(a) * 700,
        520 + Math.sin(a) * 380,
        k % 2 ? "S/M" : "F/M",
        UI.blue,
        22,
        0.35 * trance,
        700,
      );
    }
    label(ctx, s, 960 - 150, 140, "… trance …", UI.warn, 34, 0.9 * trance, 700);
  }

  label(ctx, s, 80, 112, "settings.exe", null, TYPE.SUB, INK.SUB);
}
