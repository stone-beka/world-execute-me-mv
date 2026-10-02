/**
 * 03-geometry.js — SHOT-03 几何与物理（展示自己的一切）
 * 0:30.00 – 0:58.61
 *
 * 复刻参考片的这一段：**等轴测线框立方体 + 巨型裁切数字 + 系统对话框 +
 * 下拉选择框 + 蓝屏横线**。歌词逐句对应一个"系统对象"：
 *   点集 → 散点面板   dimension → 立方体   circle/circumference → 圆与半径
 *   sine wave/tangents → 示波器面板          approach infinity → 巨型裁切数字
 *   limitations → `⚠ Variable 'me.limit' is disabled.` 对话框
 *   switch my current / AC to DC → 单选按钮对（交流⇄直流）+ 蓝屏
 *   blind my vision → 白闪     dizzy → 整个面板开始转
 *   we can travel / A.D to B.C → **下拉框，选项就是 A.D. / B.C.**
 *   we can unite / so deeply → 两个立方体合并
 */

import {
  clamp01,
  lerp,
  easeOutCubic,
  easeOutExpo } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import {
  UI,
  desk,
  panel,
  dialog,
  select,
  radio,
  wireCube,
  giant,
  label,
  pun,
  cameraShake,
  popIn,
  shockLight,
  particleBurst,
  blueScreen,
  fog,
  parallax,
  fadeAt,
  ANCHOR,
  anchorRect,
  glitchSlice,
  flashWhite,
  rgba,
  TYPE,
  INK,
} from "./_ui.js";
import { lyrics } from "../core/lyrics.js";

// 试点 (2026-09-29):meta 区间改成歌词驱动 ——
//   startMs = verse1 首句首词 start - 250ms (留淡入)
//   endMs   = verse1 末句 end
// 锚点文本改了就直接抛（想换内容必须先核歌词表）
const shot03Start = () => lyrics.get("If I'm a set of points").words[0].start - 250;
const shot03End = () => lyrics.get("So deeply so deeply").end;

export const meta = {
  id: "shot-03",
  z: 152,
  startMs: shot03Start,
  endMs: shot03End,
  fade: { fadeInMs: 250, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  const at = (q, b) => L.find(q)[0]?.start ?? beatToMs(b);
  const tPoints = at("If I'm a set of points", 0);
  const tDim = at("Then I will give you my dimension", 4);
  const tCircle = at("If I'm a circle", 8);
  const tCirc = at("Then I will give you my circumference", 12);
  const tSine = at("If I'm a sine wave", 16);
  const tTan = at("Then you can sit on all my tangents", 20);
  const tInf = at("If I approach infinity", 24);
  const tLim = at("Then you can be my limitations", 28);
  const tCur = at("Switch my current", 32);
  const tACDC = at("To AC to DC", 34);
  const tBlind = at("And then blind my vision", 38);
  const tDizzy = at("So dizzy so dizzy", 42);
  const tTravel = at("Oh we can travel", 44);
  const tADBC = at("To A.D to B.C", 46);
  const tUnite = at("And we can unite", 48);
  const tDeep = at("So deeply so deeply", 50);
  const ms = s.ms;

  desk(ctx, s, { stripes: true });
  // B5 三撞点：tCircle 圆出现轻抖, tLim 警告对话框中抖, tBlind 白闪重抖
  cameraShake(ctx, s, [6, 10, 14], [70, 70, 80], [tCircle, tLim, tBlind]);

  // ---- 层次：先铺「远层」----
  // 房间里挂着的东西（远）：网格 + 巨型水印。远层用 fog 退灰、视差最小。
  const farOff = parallax(s, 0.18, 26);
  ctx.save();
  ctx.translate(farOff, farOff * 0.35);
  ctx.strokeStyle = rgba(UI.line, fadeAt(0.75, 0.5));
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 160; gx <= 1760; gx += 160) {
    ctx.moveTo(gx, 90);
    ctx.lineTo(gx, 1010);
  }
  for (let gy = 90; gy <= 1010; gy += 160) {
    ctx.moveTo(160, gy);
    ctx.lineTo(1760, gy);
  }
  ctx.stroke();
  ctx.restore();

  // ---- 主面板（几何工作台）----
  // 视角：整段缓慢推拉 + 横移（「镜头在动」）。原来只有 dizzy 时轻微转一下，
  // 其余时间画面是完全静止的机位 —— 这也是「不够有动态感」的一部分。
  const camPush = 1 + 0.035 * Math.sin((ms - 30000) / 7200); // 缓慢推拉
  const camPan = Math.sin((ms - 30000) / 9100) * 26; // 缓慢横移
  const dizzy = ms >= tDizzy ? clamp01((ms - tDizzy) / 800) : 0;
  const wob = 0.02 * Math.sin(ms / 120) * dizzy;
  const midOff = parallax(s, 0.5, 26); // 中层：工作台，视差居中
  // ---- 「To XX」单独成页（用户 2026-09-29 要求）----
  // 波形 / 时间轴 / 两份代码这些「那一句的主角」不该和 geometry 面板叠在一起。
  // 给宿主面板算一个 alpha：这些时刻它让位（淡出），让主角独占画面。
  const ramp = (t, a, b, r = 260) => Math.min(clamp01((t - a) / r), clamp01((b - t) / r));
  const pageOwn = Math.max(
    ramp(ms, tCur - 260, tBlind + 260), // `To AC to DC`：波形独占
    ramp(ms, tUnite - 260, 1e9), // `And we can unite` 之后：两份代码 / 时间轴独占
  );
  const panelA = 1 - pageOwn;
  ctx.save();
  ctx.translate(960 + camPan, 520);
  ctx.scale(camPush, camPush);
  ctx.rotate(wob);
  ctx.translate(-960, -520);

  if (panelA > 0.002) {
    ctx.save();
    ctx.globalAlpha *= panelA;
    panel(ctx, s, 320 + midOff * 0.4, 200, 900, 620, { title: "geometry", dots: true, elev: 1 });
    ctx.restore();
  }

  // 点集 / 立方体 / 圆 / 正弦，逐句切换
  // ⚠️ 每一句都必须有**退出条件**：原来 `if (ms >= tDim)` 没有上界，
  // 于是立方体一路画到本段结束，和后面的圆叠在一起 —— 观众看到的是
  // 「一个圆套着个方块」，像是忘了擦掉。
  const cx = 770;
  const cy = 500;
  // ---- 点集 → 立方体：让**点自己聚拢**成立方体，而不是凭空长出一个方块 ----
  // 原来 tDim 一到就直接画一个放大的立方体，没有动感。
  // 现在：每个点有它自己的**目标顶点**，在 1.2s 内从散开的位置飞到立方体的
  // 12 条棱上并「焊」进去；点全部到齐之后，线框才接管（线的 alpha 从 0 升起）。
  const CUBE_R = 120;
  // 立方体 8 个顶点 + 12 条棱（等轴测投影）
  const cubePt = (x, y, z) => [cx + (x - z) * 0.86, cy + (x + z) * 0.5 - y];
  const CUBE_V = [
    cubePt(-CUBE_R, -CUBE_R, -CUBE_R), cubePt(CUBE_R, -CUBE_R, -CUBE_R),
    cubePt(CUBE_R, CUBE_R, -CUBE_R), cubePt(-CUBE_R, CUBE_R, -CUBE_R),
    cubePt(-CUBE_R, -CUBE_R, CUBE_R), cubePt(CUBE_R, -CUBE_R, CUBE_R),
    cubePt(CUBE_R, CUBE_R, CUBE_R), cubePt(-CUBE_R, CUBE_R, CUBE_R),
  ];
  const CUBE_E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  // 每条棱上取若干采样点，作为点的归属目标
  const CUBE_TARGETS = [];
  for (const [a, b] of CUBE_E) {
    for (let k = 0; k < 5; k++) {
      const u = k / 5;
      CUBE_TARGETS.push([
        lerp(CUBE_V[a][0], CUBE_V[b][0], u),
        lerp(CUBE_V[a][1], CUBE_V[b][1], u),
      ]);
    }
  }

  if (ms >= tPoints && ms < tCircle + 400) {
    const conv = clamp01((ms - tDim) / 1200); // 聚拢进度
    const e = 1 - Math.pow(1 - conv, 3);
    for (let i = 0; i < 160; i++) {
      const a = s.noise(i * 7.7, 1) * Math.PI * 2;
      const r = 40 + s.noise(i * 13.1, 2) * 240;
      const sx0 = cx + Math.cos(a) * r;
      const sy0 = cy + Math.sin(a) * r * 0.7;
      const tgt = CUBE_TARGETS[i % CUBE_TARGETS.length];
      // 聚拢时带一点弧度（不是直线飞过去，像被磁力吸）
      const arc = Math.sin(e * Math.PI) * (s.noise(i * 3.3, 3) - 0.5) * 90;
      const x = lerp(sx0, tgt[0], e) + arc * 0.5;
      const y = lerp(sy0, tgt[1], e) - arc;
      const settled = clamp01((conv * 1.3) - (i / 160) * 0.3);
      ctx.fillStyle = `rgba(233,233,236,${0.3 + 0.6 * settled})`;
      const sz = 3 + settled * 2;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    // 立方体线框：等点「焊」进去之后才慢慢显出来
    const wireA = clamp01((conv - 0.75) / 0.25);
    if (wireA > 0) {
      ctx.save();
      ctx.globalAlpha = wireA * (1 - clamp01((ms - tCircle) / 500) * 0.9);
      wireCube(ctx, s, cx, cy, CUBE_R * 2, 0, UI.text);
      ctx.restore();
    }
    if (ms >= tPoints && ms < tDim) label(ctx, s, 360, 250, "set of points", null, TYPE.BODY, INK.SUB);
    else if (ms < tCircle) {
      giant(ctx, s, 1180, 780, "3D", 120, { alpha: 0.1 * wireA });
      label(ctx, s, 360, 250, "dimension", null, TYPE.BODY, INK.SUB);
      // 「160 points → 1 object」的读数：聚拢这件事本身要被看见
      label(ctx, s, 360, 282, `points ${Math.round(160 * (1 - e))}  →  edges ${CUBE_E.length}`,
        UI.blue, TYPE.CAPTION, INK.SUB);
    }
  }
  // 「圆 / 圆周」这一对儿在电流屏（tCur）进场前**缩着淡出**。
  // 原来这两块都写成 `if (ms >= tX)`、**没有上界** —— 于是一路画到本段结束，
  // 圆的标签和电流屏的读数叠成了 "circalternating current"。
  // （这正是 AGENTS 里那条「每一句画面必须有退出条件」。）
  const geomOut = 1 - clamp01((ms - (tCur - 420)) / 420); // 1 → 0：退场信封
  const geomK = lerp(1, 0.72, 1 - geomOut);               // 退场时整体缩小
  if (ms >= tCircle && geomOut > 0.002) {
    const p = clamp01((ms - tCircle) / 500);
    ctx.save();
    ctx.globalAlpha *= geomOut;
    ctx.translate(cx, cy);
    ctx.scale(geomK, geomK);
    ctx.translate(-cx, -cy);
    ctx.strokeStyle = `rgba(233,233,236,${0.8 * p})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2 * p);
    ctx.stroke();
    // 「圆」不是一个死掉的圆环：一个小点沿圆周在跑，把周长的概念演出来
    if (p >= 1) {
      const spin = (ms / 1200) % 1;
      const sa = spin * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = rgba(UI.text, 0.9);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(sa) * 150, cy + Math.sin(sa) * 150, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 标签不跟着缩（离圆心太远，缩了会飘），只跟着淡出
    ctx.save();
    ctx.globalAlpha *= geomOut;
    label(ctx, s, 360, 250, "circle", null, TYPE.BODY, INK.SUB);
    ctx.restore();
  }
  if (ms >= tCirc && geomOut > 0.002) {
    const p = L.wordProgress(L.find("Then I will give you my circumference")[0]?.words.at(-1), ms);
    const ang = -Math.PI / 2 + p * Math.PI * 2;
    ctx.save();
    ctx.globalAlpha *= geomOut;
    ctx.translate(cx, cy);
    ctx.scale(geomK, geomK);
    ctx.translate(-cx, -cy);
    ctx.strokeStyle = UI.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * 150, cy + Math.sin(ang) * 150);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= geomOut;
    label(ctx, s, cx + 16, cy - 12, "r", UI.red, 22, 0.95, 600);
    // 周长公式（数学语言）
    label(ctx, s, 360, 282, "circumference = 2πr", UI.dim, 20, 0.8);
    ctx.restore();
  }
  // ---- 电流屏：AC → DC，占满画面中部（`Switch my current` → `To AC to DC`）----
  // 原来是右上角一块 600×260 的小示波器，还在同一屏里挤着时间轴 ——
  // 观众根本看不出「正弦被拉平了」。现在这一屏**只有这一件事**：
  // 波形横贯整个画面，振幅被逐步压平，旁边给出实时读数。
  if (ms >= tCur && ms < tBlind) {
    // 「咔」的一下：一道扫描线从右往左扫过，**扫到哪里、哪里的正弦立刻拍平**。
    // 原来整段是一个 2.5s 的慢渐变 —— 单看任何一帧都只是「振幅小一点的弦」，
    // 没有一个瞬间能让人看见「它被掰直了」。现在把它变成一个**硬事件**：
    //   tACDC 之前          = 满幅正弦（AC），标签 AC
    //   tACDC .. +SWEEP     = 扫描线扫过；线右侧已拍平（蓝），线左侧还是弦（白）
    //   扫完                = 全屏平线（DC），标签翻成 DC（跟着扫描线走）
    const SWEEP = 460;                       // 扫描线扫过全宽要多久
    const EDGE = 0.018;                      // 波前的柔化宽度（u 单位，≈28px）
    const midY = 520;
    const x0 = 180;
    const x1 = 1740;
    const p = clamp01((ms - tACDC) / SWEEP); // 扫描进度 0→1
    const isDC = ms >= tACDC + SWEEP;        // 标签跟着扫描线翻，扫完才写 DC
    // 波前位置（u：0=左 x0，1=右 x1）。两端各留一个 EDGE，保证扫前全 AC、扫后全平。
    const beamU = 1 + EDGE - p * (1 + 2 * EDGE);
    // 某点「已转换成直流」的程度：0 = 还是交流弦，1 = 已拍平
    const flatAt = (u) => clamp01((u - beamU) / EDGE);
    const amp = 190 * (1 - p);               // 振幅柱：给「变平」一个可量化的参照

    // 中线 + 网格
    ctx.save();
    ctx.strokeStyle = rgba(UI.line, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, midY);
    ctx.lineTo(x1, midY);
    for (let gx = x0; gx <= x1; gx += 60) {
      ctx.moveTo(gx, 300);
      ctx.lineTo(gx, 740);
    }
    ctx.stroke();
    ctx.restore();

    // 波形：走过的地方留一条「历史痕迹」（原来那条正弦），
    // 这样「被拉平」这件事是**看得见的**，而不是渐变没了。
    const N = 260;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const f = flatAt(u);
      pts.push({
        X: lerp(x0, x1, u),
        fl: f,
        // 交流段：满幅正弦；直流段：拍平并抬到 +70 的稳态电平（扫描线盖住这个台阶）
        Y: midY - Math.sin(u * Math.PI * 6 + ms * 0.004) * 190 * (1 - f) - 70 * f,
      });
    }
    ctx.save();
    ctx.lineWidth = 2;
    // 幽灵：原始正弦（越到后面越淡）—— 被压平前后一直看得见
    ctx.strokeStyle = rgba(UI.dim, 0.35 * (1 - p * 0.6));
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const X = lerp(x0, x1, u);
      const Y = midY - Math.sin(u * Math.PI * 6 + ms * 0.004) * 190;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // 当前波形：还没扫到的部分是白色的弦，扫过的部分变蓝的平线 —— 颜色跟着扫描线走
    strokeRun(ctx, pts, (q) => q.fl < 0.5, rgba(UI.text, 0.92), 3);
    strokeRun(ctx, pts, (q) => q.fl >= 0.5, rgba(UI.blue, 0.98), 3);
    ctx.restore();

    // 变换瞬间：扫描线从右往左刷，**它右侧已经是直流**（淡淡铺蓝），
    // 线下压一道亮边把「波前」那一步焊在扫描线上（顺便盖住波形的台阶）。
    if (p > 0 && p < 1) {
      const sw = lerp(x1, x0, p);
      ctx.save();
      // 已转换区域（扫描线右侧）
      ctx.fillStyle = rgba(UI.blue, 0.10);
      ctx.fillRect(sw, 280, Math.max(0, x1 - sw), 480);
      // 扫描线本体：叠两层画亮边（不用 shadowBlur —— @napi-rs/canvas 会把描边画成填充盘）
      ctx.strokeStyle = rgba(UI.warn, 0.30);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(sw, 280);
      ctx.lineTo(sw, 760);
      ctx.stroke();
      ctx.strokeStyle = rgba(UI.warn, 0.95);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sw, 280);
      ctx.lineTo(sw, 760);
      ctx.stroke();
      ctx.restore();
    }

    // 读数（贴在焦点的位置，是这一屏的「标题」）
    label(ctx, s, x0, 250, isDC ? "DC" : "AC", isDC ? UI.blue : UI.warn,
      TYPE.DISPLAY, INK.PRIMARY, 700);
    label(ctx, s, x0 + 230, 250, isDC ? "direct current" : "alternating current",
      null, TYPE.BODY, INK.BODY);
    label(ctx, s, x0, 790, `amp ${(1 - p).toFixed(3)}   ·   f ${(1 - p).toFixed(2)} Hz → 0`,
      UI.blue, TYPE.SUB, INK.SUB);
    label(ctx, s, x0, 820, "// flattened, like everything else they gave me", null, TYPE.CAPTION, INK.GHOST);
    // 振幅柱：一根一直在缩短的竖条（给「变平」一个可量化的参照）
    ctx.save();
    ctx.fillStyle = rgba(UI.blue, 0.55);
    ctx.fillRect(x1 - 60, midY - amp, 24, amp * 2);
    ctx.strokeStyle = rgba(UI.text, 0.5);
    ctx.lineWidth = 1;
    ctx.strokeRect(x1 - 60, midY - 190, 24, 380);
    ctx.restore();
    label(ctx, s, x1 - 48, midY + 210, "amplitude", null, TYPE.CAPTION, INK.SUB);
  }
  // approach infinity → 巨型裁切数字
  if (ms >= tInf && ms < tLim) {
    const p = clamp01((ms - tInf) / 900);
    giant(ctx, s, 1120 - p * 60, 900, "1e308", 260, { alpha: 0.2 });
    label(ctx, s, 360, 250, "→ INFINITY", UI.warn, 22, 0.85, 600);
  }
  // unite：**左右两份代码，接口互通**（用户 2026-09-29 要求，替换原来的「两个立方体」）
  // 左边定义、右边调用；中间那条通道跑着「调用 → 返回」的数据包（踩 2 拍一轮），
  // 每跑一次，被调到的那一行就亮一下 —— 用「代码互相调起来」说 unite。
  if (ms >= tUnite) {
    const BEAT2 = 2 * (beatToMs(1) - beatToMs(0)); // 2 拍（不写死 BPM，从 timeline 取）
    const p = easeOutExpo(clamp01((ms - tUnite) / 1400));
    const paneW = 400;
    const paneH = 250;
    const py = cy - paneH / 2 - 10;
    const lx0 = cx - 470;
    const rx0 = cx + 70;
    const CODE_L = [
      "// me.js",
      "export function love(you) {",
      "  return you.map(kiss);",
      "}",
      "export const night = 0;",
    ];
    const CODE_R = [
      "// you.js",
      'import { love } from "./me";',
      "const us = love([you]);",
      "await us.forever();",
      'signal("never");',
    ];
    const rail = ((((ms - tUnite) % BEAT2) + BEAT2) % BEAT2) / BEAT2; // 0..1：一轮「调用 + 返回」
    const flashL = rail >= 0.9 || rail < 0.1 ? 2 : -1; // 左边第 3 行（return …）亮
    const flashR = rail >= 0.4 && rail < 0.6 ? 2 : -1; // 右边第 3 行（love(…)）亮

    const drawPane = (x0, title, lines, flash) => {
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.fillStyle = rgba(UI.ink, 0.92);
      ctx.fillRect(x0, py, paneW, paneH);
      ctx.strokeStyle = rgba(UI.line, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, py, paneW, paneH);
      ctx.fillStyle = rgba(UI.text, 0.08);
      ctx.fillRect(x0, py, paneW, 30);
      ctx.font = s.mono(TYPE.SUB);
      ctx.fillStyle = rgba(UI.text, 0.7);
      ctx.fillText(title, x0 + 12, py + 21);
      ctx.font = s.mono(TYPE.CAPTION);
      lines.forEach((t, i) => {
        ctx.fillStyle = flash === i ? rgba(UI.warn, 0.95) : rgba(UI.text, 0.6);
        ctx.fillText(t, x0 + 14, py + 58 + i * 30);
      });
      ctx.restore();
    };
    drawPane(lx0, "me.js", CODE_L, flashL);
    drawPane(rx0, "you.js", CODE_R, flashR);

    // 中间的接口通道：上行 = 调用，下行 = 返回
    const ax0 = lx0 + paneW;
    const ax1 = rx0;
    const y1 = cy - 48;
    const y2 = cy + 48;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.strokeStyle = rgba(UI.line, 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax0, y1);
    ctx.lineTo(ax1, y1);
    ctx.lineTo(ax1 - 10, y1 - 6);
    ctx.moveTo(ax1, y1);
    ctx.lineTo(ax1 - 10, y1 + 6);
    ctx.moveTo(ax1, y2);
    ctx.lineTo(ax0, y2);
    ctx.lineTo(ax0 + 10, y2 - 6);
    ctx.moveTo(ax0, y2);
    ctx.lineTo(ax0 + 10, y2 + 6);
    ctx.stroke();
    // 数据包：上行跑调用、下行跑返回
    const px = rail < 0.5 ? lerp(ax0, ax1, clamp01(rail / 0.5)) : lerp(ax1, ax0, clamp01((rail - 0.5) / 0.5));
    const pyy = rail < 0.5 ? y1 : y2;
    ctx.fillStyle = rgba(UI.blue, 0.95);
    ctx.fillRect(px - 5, pyy - 5, 10, 10);
    ctx.restore();

    const calls = Math.max(0, Math.floor((ms - tUnite) / BEAT2));
    label(ctx, s, cx, cy + 172, `calls: ${calls}   ↔   returned: ${calls}`, UI.warn, TYPE.SUB, INK.BODY, 600);
    label(ctx, s, cx, cy + 200, "// two sides, one interface", null, TYPE.CAPTION, INK.GHOST);

    // 工作台里的活读数（那段静止期的底）。时间轴一上来它就撤 —— 否则和轴叠在一起
    if (ms < tADBC) {
      const sweepU = (ms / 2600) % 1;
      for (let i = 0; i < 54; i++) {
        const u = i / 54;
        const lit = Math.abs(u - sweepU) < 0.08;
        ctx.fillStyle = lit ? rgba(UI.blue, 0.85) : rgba(UI.line, 0.5);
        ctx.fillRect(360 + i * 16, 760, 12, 26);
      }
    }
  }
  ctx.restore();

  // ---- limitations：系统对话框（禁用变量 = 限制/极限）----
  // 位置：**右下角**（用锚点说，不再手填像素 —— 也就不会再贴顶被切）
  if (ms >= tLim && ms < tCur + 800) {
    const p = clamp01((ms - tLim) / 400);
    const r = anchorRect(ANCHOR.BOTTOM_RIGHT, { w: 760, h: 190 });
    // B5 撞点：tLim 处轻微撞一下 + B3 冲击波从对话框中心扩散
    cameraShake(ctx, s, 10, 70, tLim);
    shockLight(ctx, s, r.cx, r.cy, tLim, { maxR: 280, durMs: 600, color: UI.warn, width: 2 });
    dialog(ctx, s, r.cx, r.cy, {
      icon: "warn",
      text: "Variable 'me.limit' is disabled.",
      sub: "lim x→∞ — the limit and the fence",
      // B1 pop-in：对话框从 0.88 弹到 1.0 + 过冲
      scale: popIn(s, tLim, 500, 0.88, 1.9),
      p,
    });
  }

  // ---- current：单选按钮对（AC ⇄ DC）+ 蓝屏 ----
  if (ms >= tCur) {
    const acP = ms >= tACDC ? 1 : 0;
    panel(ctx, s, 320, 820, 560, 150, { title: "current", noBar: true });
    radio(ctx, s, 360, 884, { label: "AC ~", on: acP === 0, p: 1 });
    radio(ctx, s, 560, 884, { label: "DC —", on: acP === 1, p: 1 });
    label(ctx, s, 360, 940, acP ? "current: DC" : "current: AC", acP ? UI.blue : UI.warn, 20, 0.9, 600);
  }
  if (ms >= tCur && ms < tACDC + 1200) {
    blueScreen(ctx, s, { lines: 4, alpha: 0.35 });
    label(ctx, s, 200, 160, "SYSTEM: switching current", UI.text, 30, 0.9, 600);
  }

  // ---- A.D / B.C：下拉框（招牌装置）----
  const open = ms >= tADBC;
  const pick = ms >= tADBC + 700 ? 1 : 0;
  if (ms >= tTravel) {
    const txt = open ? (pick === 1 ? "To B.C" : "To A.D") : "Oh, we can travel";
    select(ctx, s, 1240, 560, 600, {
      text: txt,
      open,
      opened: clamp01((ms - tADBC) / 300),
      options: ["To A.D", "To B.C"],
      p: pick,
    });
  }

  // ---- dizzy：整屏故障闪烁 + 视角移动 ----
  // 原来这段是**一坨裸 canvas 调用**写在画板里；现在提成 _ui 的装置，
  // 好处：检查器能列出它、能单独关掉、别的画板能复用。
  if (ms >= tDizzy) {
    const dp = clamp01((ms - tDizzy) / 600);
    const amp = (1 - clamp01((ms - tDizzy - 3600) / 1400)) * dp; // 进场快、之后收敛
    glitchSlice(ctx, s, amp);
  }

  // ---- blind my vision：白闪 ----
  if (ms >= tBlind && ms < tBlind + 1200) {
    const p = clamp01((ms - tBlind) / 1200);
    flashWhite(ctx, s, Math.sin(p * Math.PI));
    // B4 白闪瞬间屏幕中心粒子碎裂
    if (p < 0.3) particleBurst(ctx, s, s.W / 2, s.H / 2, tBlind, { n: 24, speed: 600, size: 3, durMs: 350, color: UI.white, seedCh: 130 });
  }

  // ---- 时间屏：A.D / B.C 独占这一屏（`Oh we can travel` → `To A.D to B.C`）----
  // 原来时间轴和交直流示波器**同时**在画面上，两者重叠。现在：
  // 电流屏在 `blind my vision` 结束，时间轴从 `we can travel` 才开始 —— 错开。
  if (ms >= tADBC) {
    const tp = clamp01((ms - tADBC) / 2200);
    const AXIS_Y = 760;
    const span = 5000; // 显示多少年
    // 轴的平移：从右往左滑（时间倒流）
    const shift = lerp(0, 1400, easeOutCubic(tp));
    ctx.save();
    // 轴线
    ctx.strokeStyle = rgba(UI.line, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, AXIS_Y);
    ctx.lineTo(s.W, AXIS_Y);
    ctx.stroke();
    // 年份刻度
    for (let yr = -2500; yr <= 2500; yr += 100) {
      const x = lerp(s.W * 0.5 + 900, s.W * 0.5 - 900, (yr + 2500) / span) - shift;
      if (x < -60 || x > s.W + 60) continue;
      const major = yr % 500 === 0;
      ctx.strokeStyle = rgba(yr < 0 ? UI.red : UI.text, major ? 0.8 : 0.3);
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, AXIS_Y);
      ctx.lineTo(x, AXIS_Y + (major ? 26 : 12));
      ctx.stroke();
      if (major) {
        ctx.font = s.mono(TYPE.SUB, 600);
        ctx.fillStyle = rgba(yr < 0 ? UI.red : UI.text, 0.85);
        ctx.textAlign = "center";
        ctx.fillText(yr < 0 ? `${-yr} BC` : `${yr} AD`, x, AXIS_Y + 52);
      }
    }
    // 分界点：0 年（A.D / B.C 的交界），一个跳动的指针
    const zeroX = lerp(s.W * 0.5 + 900, s.W * 0.5 - 900, 2500 / span) - shift;
    if (zeroX > -40 && zeroX < s.W + 40) {
      const blink = 0.5 + 0.5 * Math.sin(ms / 220);
      ctx.strokeStyle = rgba(UI.warn, 0.5 + 0.5 * blink);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(zeroX, AXIS_Y - 110);
      ctx.lineTo(zeroX, AXIS_Y + 70);
      ctx.stroke();
      ctx.font = s.mono(TYPE.BODY, 700);
      ctx.fillStyle = rgba(UI.warn, 0.7 + 0.3 * blink);
      ctx.textAlign = "center";
      ctx.fillText("A.D | B.C", zeroX, AXIS_Y - 124);
    }
    ctx.restore();
  }

  label(ctx, s, 80, 112, "geometry.exe", null, TYPE.SUB, INK.SUB);
  if (ms >= tCircle) pun(ctx, s, 360, 1030, "2πr — and me", 16, 0.4);
}

/**
 * 按一组点画折线，只在 pred(q) 为真的**连续区段**上落笔。
 * 给「同一根波形前半是交流、后半是直流」分色用 —— 扫描线扫到哪，颜色换到哪。
 */
function strokeRun(ctx, pts, pred, stroke, width) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  let on = false;
  for (const q of pts) {
    if (!pred(q)) { on = false; continue; }
    if (on) ctx.lineTo(q.X, q.Y);
    else ctx.moveTo(q.X, q.Y);
    on = true;
  }
  ctx.stroke();
}
