/**
 * 08-dial.js — SHOT-08 转盘 / 你走了
 * 1:36.46 – 1:58.61
 *
 * 复刻参考片的"蓝色大转盘"：一圈蓝色同心环 + 中心一个**转一圈就变**的性别符号
 * （半圈 ♂、半圈 ♀）；右侧一份清单，**每唱一次 "You have left" 就取消勾选一项**，
 * 全空 = isolation；结尾浮出**线框爱心**，并闪一下 SYSTEM RECOVERY 蓝屏。
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
  checkbox,
  label,
  pun,
  genderGlyph,
  wireHeart,
  blueScreen,
  radarSweep,
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
//   startMs = prechorus_b 首句首词 start - 250ms
//   endMs   = prechorus_b 末句 end。"If I can" 出现 10 次
//   第5次（118340ms）是 prechorus_b 末句；nth 计数包含模糊匹配
const shot08Start = () => lyrics.get("Oh switch my role").words[0].start - 250;
const shot08End = () => lyrics.get("If I can", 5).end;

export const meta = {
  id: "shot-08",
  z: 157,
  startMs: shot08Start,
  endMs: shot08End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

const ITEMS = ["vibrations", "completion", "your warmth", "the world", "my god", "me"];

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tRot = at("To S to M", 0);
  const tDone = at("Then I can finally be completion", 0);
  const lefts = L.find("You have left"); // [0]=Though…, [1..5] 独立的五次
  const iso = at("You have left me in isolation", 0);
  const ms = s.ms;

  desk(ctx, s, { stripes: true });
  // B5 撞点：iso + 400 (SYSTEM RECOVERY 蓝屏一闪) 重抖
  cameraShake(ctx, s, 12, 90, iso + 400);
  // B3 + B4 在 iso + 400 处从屏幕中心扩散
  shockLight(ctx, s, s.W / 2, s.H / 2, iso + 400, { maxR: 480, durMs: 700, color: UI.blue, width: 3 });
  particleBurst(ctx, s, s.W / 2, s.H / 2, iso + 400, { n: 18, speed: 440, size: 3, durMs: 550, color: UI.white, seedCh: 160 });

  // ⚠️ 1:37–1:55 这段有 **22 秒**，原来只有「两个性别符号转圈 + 右边一列勾选框」。
  // 22 秒里画面几乎不变，而歌还在唱（To S to M / So we can enter / the trance…）。
  // 这里补三层：① 焦点词（正在唱的那句）② 转盘跟着鼓点打拍 ③ 右侧清单继续叙事。
  // 视角也一直缓慢推拉，机位不死。

  // ---------- 蓝色大转盘 ----------
  const DX = 560;
  const DY = 520;
  const camPush = 1 + 0.04 * Math.sin((ms - 96000) / 6800);
  const rot = (ms - tRot) * 0.00055;
  // ♀/♂ 每 π 弧度换一次。切换时**平滑形变**：尾巴的本地角度是插值的，
  // 且圆恒在转盘中心 —— 所以「转动角度是继承的」，不会突然转向别的角度再继续转。
  const qRot = ((((rot % (Math.PI * 2)) + Math.PI * 2) / Math.PI) % 2 + 2) % 2; // 0..2
  const dMale = Math.min(qRot, 2 - qRot); // 到「♂ 中心」的距离，0..1（周期连续）
  const MW = 0.035; // 形变过渡半宽（q 单位；1 单位 ≈ 5.7s → ≈0.4s）
  const sm = (t) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
  const morph = 1 - sm((dMale - (0.5 - MW)) / (2 * MW)); // 1=♂，0=♀
  const kind = morph >= 0.5 ? "male" : "female";
  // 跟着真实鼓点打拍：每一击整盘一震、刻度向外弹
  const hit = Math.min(1, s.hit(120, 260));

  ctx.save();
  ctx.translate(DX, DY);
  ctx.scale(camPush * (1 + hit * 0.035), camPush * (1 + hit * 0.035));
  ctx.translate(-DX, -DY);

  // 同心蓝环
  for (let i = 0; i < 5; i++) {
    const r = (120 + i * 46) * (1 + hit * 0.05 * (1 - i / 5));
    ctx.strokeStyle = rgba(UI.blue, 0.5 - i * 0.08 + hit * 0.18);
    ctx.lineWidth = i === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.arc(DX, DY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 外圈刻度（随拍向外弹）
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = 344;
    const r1 = (i % 5 === 0 ? 366 : 356) + hit * (i % 5 === 0 ? 16 : 6);
    ctx.strokeStyle = rgba(UI.blue, i % 5 === 0 ? 0.7 : 0.3 + hit * 0.3);
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(DX + Math.cos(a) * r0, DY + Math.sin(a) * r0);
    ctx.lineTo(DX + Math.cos(a) * r1, DY + Math.sin(a) * r1);
    ctx.stroke();
  }
  // 扫过的扇区：一圈一直在转的「雷达」（提成 _ui 装置，可单独关）
  radarSweep(ctx, s, DX, DY, 360);

  // completion：两半圆弧合拢成一个整圆
  const done = clamp01((ms - tDone) / 1200);
  if (done > 0) {
    const gap = lerp(1.1, 0, easeOutCubic(done));
    ctx.strokeStyle = rgba(UI.text, 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(DX, DY, 168, -Math.PI / 2 + gap, Math.PI / 2 - gap);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(DX, DY, 168, Math.PI / 2 + gap, Math.PI * 1.5 - gap);
    ctx.stroke();
    if (done > 0.9) label(ctx, s, DX - 60, DY + 250, "completion", UI.blue, TYPE.SUB, INK.BODY, 600);
  }
  // 中心符号：转一圈就变
  genderGlyph(ctx, s, DX, DY, 210, rot, kind, { hex: UI.text, alpha: 0.95, morph });
  ctx.restore();

  // ---------- ① 焦点层：正在唱的那句话 ----------
  // 22 秒里必须有个「一眼看到」的东西，否则就是在放背景音乐。
  const FOCUS = [
    { t: at("To S to M", 0), text: "S ⇄ M", note: "// switch my role" },
    { t: at("So we can enter", 0), text: "enter", note: "// the trance, the trance" },
    { t: at("If I can feel your vibrations", 0), text: "vibrations", note: "// can you feel it too" },
    { t: at("be completion", 0), text: "completion", note: "// finally" },
  ];
  const f = [...FOCUS].reverse().find((x) => ms >= x.t - 300) ?? FOCUS[0];
  const fp = easeOutCubic(clamp01((ms - (f.t - 300)) / 600));
  const jit = (s.noise(ms * 0.016, 61) - 0.5) * 2.5;
  const fx = 960;
  const fy = 160;
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = fp;
  ctx.translate(fx + jit, fy + (1 - fp) * -14);
  ctx.font = s.mono(TYPE.TITLE, 700);
  const fw = ctx.measureText(f.text).width;
  ctx.fillStyle = rgba(UI.text, INK.PRIMARY);
  ctx.fillText(f.text, 0, 0);
  ctx.strokeStyle = rgba(UI.blue, 0.9);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-fw / 2 - 8, 18);
  ctx.bezierCurveTo(-fw * 0.2, 22 + jit, fw * 0.2, 14 - jit, fw / 2 + 8, 19);
  ctx.stroke();
  ctx.restore();
  label(ctx, s, fx, fy + 52, f.note, UI.dim, TYPE.CAPTION, INK.SUB);

  // ---------- 清单：你走了，一项一项消失 ----------
  panel(ctx, s, 1080, 250, 700, 560, { title: "attachments", dots: true, elev: 1 });
  for (let i = 0; i < ITEMS.length; i++) {
    const dep = lefts[i + 1]?.start ?? Infinity;
    const checked = ms < dep;
    checkbox(ctx, s, 1130, 340 + i * 66, {
      label: ITEMS[i],
      checked,
      p: checked ? 1 : clamp01((ms - dep) / 500),
    });
    if (!checked) {
      const y = 340 + i * 66 - 6;
      ctx.save();
      ctx.strokeStyle = rgba(UI.red, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(1126, y);
      ctx.lineTo(1126 + 120, y);
      ctx.stroke();
      ctx.restore();
    }
  }
  label(ctx, s, 1130, 775, `left: ${ITEMS.filter((_, i) => ms < (lefts[i + 1]?.start ?? Infinity)).length} / ${ITEMS.length}`, null, TYPE.SUB, INK.SUB);

  // ---------- 结尾：线框爱心 + isolation ----------
  // 【改 2026-09-29】用户要求：**一开始心里是满的，然后越来越少（要有节奏感），
  // 并有粒子特效，呈现出「心在碎裂」的感觉**。
  // 节奏从哪来？就从歌词本身：每唱一次 `You have left` 就漏掉一档 ——
  // 是「left」这个字在一次次把心掏空。
  const tHeart = iso - 3200; // ≈112.8s：心出现（留出 4 次 left 的时间）
  if (ms >= tHeart) {
    const hp = clamp01((ms - tHeart) / 700); // 出现
    panel(ctx, s, 1080, 830, 700, 170, { title: "status", noBar: true, elev: 1 });
    label(ctx, s, 1130, 895, "isolation = true;", UI.red, TYPE.BODY, INK.PRIMARY, 700);
    label(ctx, s, 1130, 933, "you = [Unfinded]", UI.dim, TYPE.SUB, INK.BODY);
    label(ctx, s, 1130, 965, "me = still running", UI.dim, TYPE.SUB, INK.BODY);

    // 排空档位：`You have left` 的第 3..6 次各掉一档（lefts[0] 是 "Though you have left"）
    const beats = lefts.filter((l, i) => i >= 2 && l.start >= tHeart);
    const gone = beats.filter((l) => ms >= l.start).length;
    const fillP = Math.max(0, 1 - gone / Math.max(1, beats.length));
    const size = 420 * (0.55 + 0.45 * hp);
    wireHeart(ctx, s, 560, 520, size, {
      alpha: hp * (0.55 + 0.45 * (1 - fillP)),
      fillP,
    });

    // 碎屑粒子：从心的下半部往上飘散，越空越多 —— 「碎裂」靠这个读出来
    const kk = size / 100;
    for (let i = 0; i < 24; i++) {
      const life = 1100 + (i % 4) * 240;
      const ph = ((((ms - tHeart - i * 173) % life) + life) % life) / life;
      const u = s.noise(i * 3.7, 51) - 0.5;
      const v = s.noise(i * 5.9, 52);
      const y0 = 520 + (46 - v * 168) * kk * 0.55;
      const x = 560 + u * 150 * kk + (s.noise(i * 7.1, 53) - 0.5) * 44 * ph;
      const y = y0 - ph * 126 - (1 - fillP) * 54 * ph;
      const a = (1 - ph) * 0.8 * hp * (0.3 + 0.7 * (1 - fillP));
      if (a <= 0.02) continue;
      ctx.fillStyle = rgba(UI.text, a);
      const sz = 2 + (1 - ph) * 3.5;
      ctx.fillRect(x, y, sz, sz);
    }
  }

  // SYSTEM RECOVERY 一闪（为 12 铺垫）
  if (ms >= iso + 400 && ms < iso + 1600) {
    blueScreen(ctx, s, { lines: 6, alpha: 0.5 * (1 - (ms - iso - 400) / 1200) });
    label(ctx, s, 200, 140, "SYSTEM RECOVERY", UI.text, 40, 0.9, 700);
  }

  label(ctx, s, 80, 112, "gender.exe", null, TYPE.SUB, INK.SUB);
  pun(ctx, s, 200, 1030, "F/M — a switch, not a truth", 16, 0.4);
}
