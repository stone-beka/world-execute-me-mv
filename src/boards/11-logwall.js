/**
 * 11-logwall.js — SHOT-11 一个一个执行
 * 2:26.31 – 2:38.77
 *
 * 复刻参考片这一段：**日志控制台**。
 *   开场：`> Run EmergencyProtocol / > date:2017-01-01 / > user:[Unfinded]`
 *   然后：`execution` / `> succeed in executing world` 成对刷屏，
 *         间隔越来越短（加速），最后糊成**一堵密集的彩色 glitch 墙**。
 * 中间留一个线框立方体当"世界"的图标。
 */

import { clamp01 } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI, desk, panel, wireCube, label, pun, glitchWall, bar, rgba,
  cameraShake, popIn, shockLight, particleBurst } from "./_ui.js";

import { lyrics } from "../core/lyrics.js";
import { sections } from "../core/timeline.js";

// 试点 (2026-09-29):混合锚定 ——
const sectionByName = (name) => sections.find((s) => s.name === name);
//   startMs = execution_storm 段起点（保证接缝上 interlude）
//   endMs   = execution_storm 末歌词句 end
const shot11Start = () => sectionByName("execution_storm").startMs;
const shot11End = () => lyrics.get("Execution execution execution execution", 1).end;

export const meta = {
  id: "shot-11",
  z: 160,
  startMs: shot11Start,
  endMs: shot11End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  const ex = L.find("Execution execution execution execution");
  const t0 = ex[0]?.start ?? beatToMs(0);
  const ms = s.ms;

  desk(ctx, s, { stripes: true });
  // B5 双撞点：t0 (执行开始) + t0+5200 (glitch 墙堆起)
  cameraShake(ctx, s, [8, 16], [70, 100], [t0, t0 + 5200]);
  // B3 + B4 在 glitch 墙堆起时（最猛的撞击点）
  shockLight(ctx, s, s.W / 2, s.H / 2, t0 + 5200, { maxR: 600, durMs: 1000, color: UI.red, width: 4 });
  particleBurst(ctx, s, s.W / 2, s.H / 2, t0 + 5200, { n: 28, speed: 540, size: 3, durMs: 800, color: UI.red, seedCh: 170 });

  // ---- 控制台：先三条引导行，再加速刷 execution ----
  panel(ctx, s, 120, 180, 1080, 720, { title: "console — emergency", dots: true, scale: popIn(s, t0 - 1400, 500, 0.9, 1.8) });
  const lines = [
    ["> Run EmergencyProtocol", t0 - 1400, UI.warn],
    ["> date:2017-01-01", t0 - 1000],
    ["> user:[Unfinded]", t0 - 600],
  ];
  // 成对出现，间隔按 k² 收缩（越刷越快）
  let k = 0;
  for (let kk = 0; kk < 60; kk++) {
    const at = t0 + 200 + kk * kk * 26;
    if (at > 158700) break;
    lines.push(["execution", at, UI.text]);
    lines.push(["> succeed in executing world", at + 90, UI.blue]);
    k++;
  }
  const alive = lines.filter((l) => ms >= l[1]).slice(-18);
  ctx.save();
  ctx.font = s.mono(21);
  for (let i = 0; i < alive.length; i++) {
    const [text, , hex] = alive[i];
    ctx.fillStyle = rgba(hex ?? UI.text, 0.85);
    ctx.fillText(text, 170, 260 + i * 32);
  }
  ctx.restore();

  // 计数器（已处决多少个"世界"）—— 先算出来，绘制放到 glitch 墙之上（见下）
  const killed = lines.filter((l) => l[0] === "execution" && ms >= l[1]).length;

  // 世界图标
  wireCube(ctx, s, 1400, 520, 190, 0, UI.text);
  label(ctx, s, 1340, 660, "world", null, 20, 0.5);

  // ---- 结尾：糊成 glitch 墙 ----
  const wall = clamp01((ms - t0 - 5200) / 3600);
  if (wall > 0) {
    ctx.save();
    ctx.globalAlpha *= wall;
    glitchWall(ctx, s, 0, 0, s.W, s.H, { density: 0.25 + 0.4 * wall, seed: Math.floor(ms / 90) });
    ctx.restore();
    label(ctx, s, 700, 1000, "stack overflow", UI.red, 30, wall, 700);
  }

  // 主体要压得住背景：处决计数放在 glitch 墙之上，并垫一层暗底，
  // 保证风暴里这个读数还读得出来。（world 图标故意留在墙下 ——
  // 「世界被风暴吞掉」正是这一段的意思。）
  if (wall > 0) {
    ctx.fillStyle = rgba(UI.ink, 0.55 * wall);
    ctx.fillRect(1280, 220, 560, 96);
  }
  label(ctx, s, 1300, 260, `executed: ${killed} worlds`, UI.red, 24, 0.9, 700);
  bar(ctx, s, 1300, 286, 520, 14, clamp01(killed / 60), UI.red);

  pun(ctx, s, 170, 960, "each line, one more world", 16, 0.4);
}
