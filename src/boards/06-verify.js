/**
 * 06-verify.js — SHOT-06 主歌 2 后半：猫的呼噜 / 存在证明
 * 1:20.31 – 1:28.61
 *
 * 复刻参考片的语言：
 *   猫 → 一个 `scope` 面板显示"呼噜"波形（低频谱线），底下一行 purr 读数；
 *   神 → 预览框里变成辐射状图形，右侧出现 **`verify(existence)` 校验条**，
 *        "you're the proof" = 校验进度走到 100% 并返回 OK（证明=通过校验）。
 */

import {
  clamp01 } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  panel,
  checkbox,
  label,
  pun,
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

// 试点 (2026-09-29):歌词驱动
//   startMs = verse2b 首句首词 start - 250ms
//   endMs   = verse2b 末句 end
const shot06Start = () => lyrics.get("Then I'll give you antioxidants").words[0].start - 250;
const shot06End = () => lyrics.get("Then you're the proof of my existence").end;

export const meta = {
  id: "shot-06",
  z: 155,
  startMs: shot06Start,
  endMs: shot06End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tCat = at("If I'm a tabby cat", 0);
  const tPurr = at("Then I will purr for your enjoyment", 4);
  const tGod = at("If I'm the only god", 12);
  const tProof = at("Then you're the proof of my existence", 16);
  const ms = s.ms;

  desk(ctx, s, { stripes: true });
  // B5 撞点：tGod (猫→神) 中抖
  cameraShake(ctx, s, 10, 80, tGod);
  // B3 + B4 在 tGod 处从预览框中心扩散
  shockLight(ctx, s, 420, 480, tGod, { maxR: 380, durMs: 700, color: UI.red, width: 3 });
  particleBurst(ctx, s, 420, 480, tGod, { n: 16, speed: 420, size: 3, durMs: 550, color: UI.red, seedCh: 150 });

  // ---- 预览框：猫 → 神 ----
  panel(ctx, s, 160, 220, 520, 520, { title: "object", dots: true, scale: popIn(s, tGod, 500, 0.92, 1.7) });
  const godP = clamp01((ms - tGod) / 500);
  ctx.save();
  ctx.translate(420, 480);
  ctx.strokeStyle = rgba(UI.text, 0.85);
  ctx.fillStyle = rgba(UI.text, 0.12);
  ctx.lineWidth = 3;
  if (godP < 1) {
    ctx.save();
    ctx.scale(1 - godP, 1 - godP);
    ctx.beginPath();
    ctx.arc(0, 20, 86, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 26, -38);
      ctx.lineTo(sx * 80, -104);
      ctx.lineTo(sx * 86, -34);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (godP > 0) {
    ctx.save();
    ctx.scale(godP, godP);
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 82, Math.sin(a) * 82);
      ctx.lineTo(Math.cos(a) * 124, Math.sin(a) * 124);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  label(ctx, s, 190, 700, godP > 0.5 ? "THE ONLY GOD" : "TABBY CAT", null, 26, 0.9, 700);

  // ---- scope：呼噜波形 ----
  if (ms >= tPurr && ms < tGod + 200) {
    panel(ctx, s, 740, 220, 660, 300, { title: "scope — purr", dots: true });
    ctx.save();
    ctx.strokeStyle = rgba(UI.text, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= 600; x += 5) {
      const v = Math.sin(x / 12 + ms * 0.01) * (0.35 + 0.25 * Math.sin(ms * 0.006)) * 40;
      if (x === 0) ctx.moveTo(770 + x, 390 - v);
      else ctx.lineTo(770 + x, 390 - v);
    }
    ctx.stroke();
    ctx.restore();
    label(ctx, s, 770, 480, "purr ← 呼噜 (vibration)", null, 19, 0.7);
    // 整屏轻微跟着震（参考片没有镜头运动，这里只用面板抖一下）
    void tCat;
  }

  // ---- verify(existence)：你是我的证明 ----
  if (ms >= tProof - 400) {
    panel(ctx, s, 740, 580, 660, 320, { title: "verify(existence)", dots: true });
    label(ctx, s, 780, 660, "input:   you", null, 22, 0.85);
    label(ctx, s, 780, 700, "expect:  proof", null, 22, 0.85);
    const p = clamp01((ms - tProof) / 2200);
    bar(ctx, s, 780, 740, 560, 18, p, p >= 1 ? UI.blue : UI.warn);
    label(ctx, s, 780, 800, `${Math.round(p * 100)}%`, p >= 1 ? UI.blue : UI.warn, 22, 0.9, 700);
    if (p >= 1) {
      label(ctx, s, 780, 860, "OK — existence proven", UI.blue, 24, 0.95, 700);
      pun(ctx, s, 780, 890, "proof by you", 16, 0.5);
    }
  }

  // 复选框：清单里猫/神被打勾
  const boxes = [
    ["eggplant", true],
    ["tomato", true],
    ["tabby cat", ms >= tCat],
    ["the only god", ms >= tGod],
  ];
  label(ctx, s, 740, 960, "can become:", null, 18, 0.45);
  for (let i = 0; i < boxes.length; i++) {
    checkbox(ctx, s, 900 + i * 190, 953, { label: boxes[i][0], checked: boxes[i][1] });
  }

  label(ctx, s, 80, 112, "items.exe", null, TYPE.SUB, INK.SUB);
  pun(ctx, s, 140, 1040, ms >= tGod ? "you are the proof" : "purr, for your enjoyment", 16, 0.4);
}
