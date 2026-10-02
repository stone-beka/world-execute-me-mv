/**
 * 02-title.js — SHOT-02 标题 + 世界开始构建
 * 0:12.46 – 0:30.00
 *
 * 参考片的这一段：`[Press any key to start simulation]` 之后打出**标题卡**——
 * 三行 `world / execute / (me);`，`execute` 带下划线；然后世界开始"装载"：
 * 进度条、浮现的模块、以及第一个系统面板。
 * 结尾（If I'm a set of points）交给 03 的几何幕。
 */

import {
  clamp01,
  lerp,
  easeOutCubic } from "../core/kernel.js";
import { beatToMs } from "../core/timeline.js";
import { UI,
  desk,
  label,
  pun,
  chessPiece,
  chessFloor,
  chessFloorPos,
  CHESS,
  rgba,
  TYPE,
  INK,
  cameraShake,
  popIn,
  shockLight,
  particleBurst,
  textGlow,
} from "./_ui.js";

import { lyrics } from "../core/lyrics.js";

// 试点 (2026-09-29):歌词驱动
//   startMs = title 段首句首词 start - 250ms (留淡入)
//   endMs   = title 段末句 end
const shot02Start = () => lyrics.get("Setup our new world").words[0].start - 250;
const shot02End = () => lyrics.get("If I'm a set of points").end;

export const meta = {
  id: "shot-02",
  z: 151,
  startMs: shot02Start,
  endMs: shot02End,
  fade: { fadeInMs: 200, fadeOutMs: 250 },
  tags: ["film", "shot", "ui"],
};

export function draw(ctx, s) {
  const L = s.lyrics;
  const ms = s.ms;
  const tTitle = L.find("And let's begin the simulation")[0]?.start ?? beatToMs(4);
  const tCmd = L.find("world.execute(me);")[0]?.start ?? beatToMs(8);
  const tPts = L.find("If I'm a set of points")[0]?.start ?? beatToMs(16);
  // ⚠️ 这两个必须在 draw() 顶部声明：棋盘（chessFloor）在函数一开始就要用 tWorld。
  // （踩过一次：声明留在第二幕里 → 顶部调用它 → TDZ 崩溃）
  const tInit = L.find("Fill in my data parameters")[0]?.start ?? beatToMs(16);
  const tWorld = L.find("Setup our new world")[0]?.start ?? beatToMs(24);

  desk(ctx, s, { stripes: true });
  // B5 标题出现的瞬间轻抖（"打字机打完字"那一刻）：6px / 80ms
  cameraShake(ctx, s, 6, 80, tTitle);
  // B3 冲击波 + B4 粒子从标题中心扩散
  shockLight(ctx, s, 900, 528, tTitle, { maxR: 360, durMs: 800, color: UI.red, width: 2 });
  particleBurst(ctx, s, 900, 528, tTitle, { n: 16, speed: 380, size: 2.5, durMs: 600, color: UI.red, seedCh: 120 });
  // 棋盘：shot-01 从 `Setup our new world` 起就在铺，这里**接着铺**。
  // 同一个装置、同一套参数、同一个 reveal 公式 —— 所以两块画板交界处不会错位。
  // pulse 用 s.hit 现算（不引用后面的 hit 变量，避免 TDZ）。
  chessFloor(ctx, s, {
    reveal: clamp01((ms - tWorld) / 1600),
    pulse: ms >= 13440 ? Math.min(1, s.hit(130, 220)) : 0,
  });

  // ---------- 第一幕：标题卡 + 从上一幕带过来的棋子 ----------
  // 【改 2026-09】原来 0:13 的过渡是「标题卡凭空淡入」—— 很单调。
  // 现在：**上一幕落下的棋子被挪到标题旁，绕着标题缓慢公转**，
  // 让两块画面之间有「同一个东西延续下来」的连续感，而不是硬切。
  if (ms < tCmd + 1800) {
    const p = clamp01((ms - tTitle) / 900);
    const e = easeOutCubic(p);
    const cx = 900;
    ctx.save();
    ctx.globalAlpha *= e;
    ctx.font = s.mono(74, 700);
    ctx.fillStyle = UI.text;
    // B2 标题文字辉光：tTitle 出现的 800ms 内,文字周围三层半透明淡光
    textGlow(ctx, s, cx - 190, 440, "world", { t0: tTitle, durMs: 800, color: UI.text });
    textGlow(ctx, s, cx - 190, 528, "execute", { t0: tTitle, durMs: 800, color: UI.text });
    textGlow(ctx, s, cx - 190, 616, "(me);", { t0: tTitle, durMs: 800, color: UI.text });
    ctx.fillText("world", cx - 190, 440);
    ctx.fillText("execute", cx - 190, 528);
    ctx.fillText("(me);", cx - 190, 616);
    // 下划线只画在 execute 下面（参考片的细节）
    const w = ctx.measureText("execute").width;
    ctx.fillStyle = UI.red;
    ctx.fillRect(cx - 190, 546, w, 5);
    // 标题卡不该是静止的：打完字后行尾留一个闪烁光标
    if (p >= 1 && Math.floor(ms / 380) % 2 === 0) {
      const wm = ctx.measureText("(me);").width;
      ctx.fillStyle = UI.text;
      ctx.fillRect(cx - 190 + wm + 10, 556, 40, 72);
    }
    ctx.font = s.mono(TYPE.BODY);
    ctx.fillStyle = UI.dim;
    ctx.fillText("a simulation by the machine", cx - 190, 664);
    ctx.restore(); // 标题卡到这里结束 —— 下面的棋子**不跟它一起淡**

    // 棋子绕标题缓慢公转（3 枚，半径/速度/相位各不同）
    // 【改 2026-09-29】三个问题一起修：
    //   ① 太淡太细 → 尺寸提到 88~104、线宽跟尺寸走（见 _ui.js chessPiece）、
    //      明度给下限 0.72（不再有 0.27 的「头发丝」）；
    //   ② 轨道穿过标题 → 半径放大到标题之外、椭圆压扁 0.42，棋子不再压字；
    //   ③ 没有「挪过来」的过程 → 标题出现的**同时**（tTitle = 0:12.93），
    //      从上一幕（shot-01）底部那排棋子的位置飞进轨道（错峰起飞）。
    const TITLE_CX = cx - 190 + w / 2;
    const TITLE_CY = 528;
    const ORB = [
      // from / kind / sz 都和**上一幕底部那排棋子**当场的第 1、5、9 枚对齐，
      // 所以交接那一段两枚棋子的包围盒完全重合 —— 看起来就是同一枚没动过。
      { r: 470, sp: 0.00042, ph: 0.0, kind: "pawn", sz: 92, from: [200, 880], delay: 0 },
      { r: 540, sp: -0.00030, ph: 2.1, kind: "rook", sz: 92, from: [742, 880], delay: 150 },
      { r: 430, sp: 0.00055, ph: 4.0, kind: "bishop", sz: 92, from: [1284, 880], delay: 300 },
    ];
    for (const o of ORB) {
      const a = o.ph + ms * o.sp;
      const tx = TITLE_CX + Math.cos(a) * o.r;
      const ty = TITLE_CY + Math.sin(a) * o.r * 0.42;
      // 入场：标题开始出现的那一刻才起飞（0 → 1），和标题的淡入同一个节拍
      const k = easeOutCubic(clamp01((ms - tTitle - o.delay) / 900));
      const ox = lerp(o.from[0], tx, k);
      const oy = lerp(o.from[1], ty, k);
      // 前后关系：转到后面就暗一点，但给一个下限（别淡成头发丝）
      const depth = 0.72 + 0.28 * Math.sin(a);
      chessPiece(ctx, s, ox, oy, o.sz, o.kind, depth);
    }
  }

  // ---------- 第二幕：数据注入 LLM（替换原来的 loading 进度条）----------
  // 「And let's begin the simulation」+「Fill in my data parameters initialisation」
  // 原来是「loading world + 一条点阵进度条」—— 太单薄。现在做成**管道 + token 流**：
  // 左侧一串 token 方块被吸进中央的模型；注入节奏踩真实拍点。
  const injStart = tCmd + 400;
  const injEnd = tWorld + 600;
  if (ms >= injStart - 200 && ms < injEnd + 900) {
    const p = clamp01((ms - injStart) / (injEnd - injStart));
    const CX = 1180;
    const CY = 690;
    const MX = 1180; // 模型
    const MY = 690;

    // 模型：网格剖面的方块（机器本体）
    const pulse = 1 + 0.05 * Math.sin(ms / 420) + 0.06 * p;
    ctx.save();
    ctx.translate(MX, MY);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = rgba(UI.blue, 0.9);
    ctx.lineWidth = 3;
    ctx.strokeRect(-95, -95, 190, 190);
    ctx.strokeStyle = rgba(UI.blue, 0.3);
    ctx.lineWidth = 1;
    for (let g = -95; g <= 95; g += 19) {
      ctx.beginPath();
      ctx.moveTo(g, -95);
      ctx.lineTo(g, 95);
      ctx.moveTo(-95, g);
      ctx.lineTo(95, g);
      ctx.stroke();
    }
    // 模型内部的「已注入量」：从下往上填
    const fillH = 190 * p;
    ctx.fillStyle = rgba(UI.blue, 0.28);
    ctx.fillRect(-95, 95 - fillH, 190, fillH);
    // 注入时向外的环
    const inj = Math.min(1, s.hit(110, 240));
    ctx.strokeStyle = rgba(UI.text, 0.4 * inj);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 110 + inj * 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    label(ctx, s, MX, MY + 132, "MODEL  sim.v0", UI.blue, TYPE.SUB, INK.BODY, 600);
    label(ctx, s, MX, MY + 160, `tokens ${Math.round(p * 100)}%`, null, TYPE.CAPTION, INK.SUB);

    // 管道：从左侧延伸到模型
    const PIPE_Y = MY;
    ctx.strokeStyle = rgba(UI.line, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(300, PIPE_Y - 34);
    ctx.lineTo(CX - 95, PIPE_Y - 34);
    ctx.moveTo(300, PIPE_Y + 34);
    ctx.lineTo(CX - 95, PIPE_Y + 34);
    ctx.stroke();
    // 管道里的流动刻度（视觉上「有东西在流」）
    for (let i = 0; i < 40; i++) {
      const xx = 300 + ((i * 24 + (ms * 0.22) % 24) % (CX - 95 - 300));
      ctx.strokeStyle = rgba(UI.blue, 0.22 + 0.2 * s.noise(i * 3.1 + Math.floor(ms / 120), 81));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xx, PIPE_Y - 34);
      ctx.lineTo(xx, PIPE_Y + 34);
      ctx.stroke();
    }

    // token 方块：从左边排队滑进模型
    const TOK = ["If", "I", "can", "give", "you", "all", "the", "data", "…"];
    for (let i = 0; i < 26; i++) {
      // 每个 token 的出发时刻：按拍推进（不是匀速），所以踩在鼓上
      const tDepart = injStart + i * 240;
      const prog = (ms - tDepart) / 900;
      if (prog < 0 || prog > 1) continue;
      const e = easeOutCubic(clamp01(prog));
      const x = lerp(300, CX - 100, e);
      const y = PIPE_Y + (s.noise(i * 5.3, 82) - 0.5) * 34;
      const a = 1 - clamp01((prog - 0.85) / 0.15);
      ctx.fillStyle = rgba(UI.text, 0.85 * a);
      ctx.fillRect(x - 26, y - 12, 52, 24);
      ctx.font = s.mono(15, 700);
      ctx.fillStyle = rgba(UI.ink, 0.95 * a);
      ctx.fillText(TOK[i % TOK.length], x - 22, y + 5);
    }
  }

  // ---------- 对弈：中间两侧，两军对垒 ----------
  // 【改 2026-09-29】用户：13.45s 之后这一段「太单调」，改成**棋子在中间两侧对弈**，
  // 一直延续到 30s —— 于是整段替换掉原来的第三幕（立方体装配/连线/日志/点云）。
  // 旧实现留档在 `src/boards/_archive-title-act3.js`（可运行的，不是注释）。
  //
  // 实现要点（也都是本工程的铁律）：
  //   · 棋盘用 _ui 的 chessFloor —— shot-01 从 `Setup our new world` 起就在铺它，这里接着用；
  //   · 棋子位置**每帧从 MOVES 现算**（重放），不存任何跨帧状态 → 满足「画板不许留状态」；
  //   · 每一步落在**拍**上（beatToMs），所以「落子」这件事自带节奏；
  //   · 每一句/每一块都有退出条件：13.44s 起淡入，30.25s 随画板一起退。
  const PK = ["pawn", "rook", "bishop"];
  const pieces = [];
  for (let c = 0; c < CHESS.cols; c++) pieces.push({ id: "F" + c, side: "far", c, r: 1, kind: PK[c % 3] });
  for (let c = 0; c < CHESS.cols; c++) {
    pieces.push({ id: "N" + c, side: "near", c, r: CHESS.rows - 2, kind: PK[(c + 1) % 3] });
  }
  // 走子脚本：{ b: 拍号, by: 谁走, t: [列,行] }。不是合法棋谱 ——
  // 是按拍推进的**姿态**：两军往中间压、互相吃掉，读起来像一局棋。
  const MOVES = [
    { b: 38, by: "N3", t: [3, 3] },
    { b: 40, by: "F4", t: [4, 2] },
    { b: 42, by: "N4", t: [4, 3] },
    { b: 44, by: "F3", t: [3, 2] },
    { b: 46, by: "N3", t: [3, 2] }, // 吃 F3
    { b: 48, by: "F5", t: [5, 2] },
    { b: 50, by: "N4", t: [4, 2] }, // 吃 F4
    { b: 52, by: "F2", t: [2, 2] },
    { b: 54, by: "N2", t: [2, 3] },
    { b: 56, by: "F5", t: [4, 2] }, // 吃 N4
    { b: 58, by: "N5", t: [5, 3] },
    { b: 60, by: "F2", t: [3, 2] }, // 吃 N3
    { b: 62, by: "N5", t: [4, 2] }, // 吃 F5
  ];
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const deadAt = new Map(); // id → 被吃掉的时刻
  const moving = new Map(); // id → { fc, fr, k }
  const MOVE_DUR = 430;
  for (const mv of MOVES) {
    const t0 = beatToMs(mv.b);
    if (ms < t0) break;
    const p = byId.get(mv.by);
    if (!p || deadAt.has(p.id)) continue;
    const k = clamp01((ms - t0) / MOVE_DUR);
    if (k < 1) {
      moving.set(p.id, { fc: p.c, fr: p.r, tc: mv.t[0], tr: mv.t[1], k });
    } else {
      // 落地：踩在目标格上的敌人被吃掉（记下时刻，画的时候做缩小淡出）
      for (const q of pieces) {
        if (q === p || deadAt.has(q.id)) continue;
        if (q.c === mv.t[0] && q.r === mv.t[1]) deadAt.set(q.id, t0 + MOVE_DUR);
      }
      p.c = mv.t[0];
      p.r = mv.t[1];
    }
  }

  const setup = clamp01((ms - 13440) / 900); // 摆盘淡入
  const hit = Math.min(1, s.hit(130, 220)); // 鼓一响，棋子亮一下
  // 落子那一下：目标格上一圈扩散（拍点上的「咔」）
  for (const mv of MOVES) {
    const t1 = beatToMs(mv.b) + MOVE_DUR;
    if (ms < t1 || ms > t1 + 420) continue;
    const rp = (ms - t1) / 420;
    const pos = chessFloorPos(mv.t[0], mv.t[1]);
    ctx.strokeStyle = rgba(UI.warn, 0.7 * (1 - rp));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 6, 26 + rp * 92, 10 + rp * 36, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (setup > 0.002) {
    for (const p of pieces) {
      const d = deadAt.get(p.id);
      let a = 0.95;
      let sc = 1;
      if (d != null) {
        const k = clamp01((ms - d) / 420);
        if (k >= 1) continue;
        a = 0.95 * (1 - k);
        sc = 1 - 0.55 * k;
      }
      const mv = moving.get(p.id);
      let col = p.c;
      let row = p.r;
      let lift = 0;
      if (mv) {
        const e = mv.k * mv.k * (3 - 2 * mv.k); // smoothstep：起步快、落点稳
        col = lerp(mv.fc, mv.tc, e);
        row = lerp(mv.fr, mv.tr, e);
        lift = Math.sin(mv.k * Math.PI) * 30; // 抬起来走，不像贴地滑
      }
      const pos = chessFloorPos(col, row);
      chessPiece(ctx, s, pos.x, pos.y - lift, 104 * sc, p.kind, a * setup * (0.82 + 0.18 * hit));
    }
  }

  // 双关注释：标题句的第二层意思
  if (ms >= tCmd) pun(ctx, s, 300, 1000, "run me — or kill me", 18, 0.5);

  label(ctx, s, 80, 112, "SIMULATION", null, TYPE.SUB, INK.SUB);
}
