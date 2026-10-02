/**
 * _ui.js — 「桌面系统 UI」母题库（复刻版的共享语言；`_` 开头不被加载）
 *
 * 参考片（同人 PV，852×480）的视觉语言：一颗电源按钮、打字机字幕、点阵进度条、
 * 下拉选择框、复选框、开关、警告对话框、情绪数值面板、日志控制台、
 * SYSTEM RECOVERY 蓝屏、密码框、条形码横幅、巨型裁切字体、线框爱心/立方体。
 *
 * 规则：
 *   · 扁平 —— **不用辉光、不用 shadowBlur**（参考片是平的，辉光是另一套语言）
 *   · 配色：近黑 + 白/浅灰面板 + 三个强调色（红=危险、蓝=系统、黄绿=警告）
 *   · 文字一律 s.mono()（打包字体，跨机器一致）
 *   · 纯函数；要"随机"用 s.rnd / s.noise（它们不含实时时钟）
 */

import { rgba } from "../core/fade.js";
import { clamp01, lerp, easeOutCubic, easeOutBack } from "../core/kernel.js";
import { pulses } from "../core/motion.js";

// ---------------------------------------------------------------- 元素登记（运行时）
//
// 【为什么是运行时，而不是扫源码】
// 原来 `tools/elements.js` 用正则静态扫源码，只认「写死数字坐标」的调用。
// 于是凡是**循环里画的 / 坐标算出来的 / 纯 canvas 手绘的**全部漏掉 ——
// 01-boot 的棋子（循环）、盾牌水印（双层循环）、电感碎片、摄像头取景框…
// 扫描永远追不上「运行时才决定的坐标」。
//
// 所以改成：**装置在真正画的时候自己报名**。坐标是真的，循环也拦不住。
// 只在检查器里开（s.__reg 存在时才收集），正常渲染零开销。
//
// 多行文字合并：像 logConsole / 逐行 label 这种「一行一条」，如果每行算一个
// 元素，一块画板能刷出几十条、列表被淹没。所以散落的 label 会按
// 「同一画板 + 相近 x + 邻近 y」**聚成一个块**（带行数），在检查器里算一个元素。

/** 登记一个元素。s.__reg 由检查器注入；没注入就直接返回（零开销）。 */
function reg(s, device, x, y, w, h, text) {
  if (!s || !s.__reg) return;
  s.__reg.push({
    board: s.__boardFile ?? "?",
    device,
    x: Math.round(x),
    y: Math.round(y),
    w: w == null ? null : Math.round(w),
    h: h == null ? null : Math.round(h),
    text: text == null ? null : String(text).slice(0, 48),
  });
}

/** 「解码字效」用的乱码字符集（只用 ASCII，跨机器一致） */
const GLYPH_SET = "0123456789#$%&*+=<>/\\|_";

/** 复刻版配色（参考片是固定的一套，不跟 config 的主题色走） */
export const UI = {
  ink: "#0a0a0c",
  ink2: "#141417",
  line: "#3c3c44",
  text: "#e9e9ec",
  dim: "#8b8b93",
  panel: "#d9d9dc",
  panelInk: "#141416",
  red: "#cf2a24",
  blue: "#1e40d8",
  blueDeep: "#131f6b",
  warn: "#c6d21c",
  white: "#f5f5f7",
};

// ---------------------------------------------------------------- 字号刻度
//
// 为什么有这一段：全片 56 处文字里有一半挤在 16–22px（差值只有 2–4px，
// 肉眼就是同一个大小），而 24/26/28/30/34 又各差一点、互相盖不住 ——
// 结果是「字号写了一堆，层次一个也没有」。策划书早就要求「字号只有 3 档」，
// 但代码里从没建立过这个约束。
//
// 现在把它定死。跨度收窄、档间拉开：
//
//   DISPLAY 96   巨型裁切字 / 标题句   一块画板最多 1 处
//   TITLE   56   主标题 / 段落大字
//   HEAD    36   大写读数 / 强调标题
//   BODY    22   正文 / 歌词 / 列表     ← 全片主力
//   SUB     18   次级读数 / 说明
//   CAPTION 14   注释 / 单位 / pun
//
// 用法：字号一律从 TYPE 里取，不许写裸数字。
//   label(ctx, s, x, y, "text", null, TYPE.HEAD)
//   ctx.font = s.mono(TYPE.BODY)
export const TYPE = {
  DISPLAY: 96,
  TITLE: 56,
  HEAD: 36,
  BODY: 22,
  SUB: 18,
  CAPTION: 14,
};

/** 档名 → 像素。兼容旧调用：TYPE.text(22) 直接给数字。 */
TYPE.at = (name) => TYPE[String(name).toUpperCase()] ?? TYPE.BODY;

/**
 * 取一个「最接近的档位」。给历史遗留的裸数字用：能自动收进刻度，
 * 不用把几百处调用一次改完。
 */
export function snapType(px) {
  const ladder = [TYPE.CAPTION, TYPE.SUB, TYPE.BODY, TYPE.HEAD, TYPE.TITLE, TYPE.DISPLAY];
  let best = ladder[0];
  let bestD = Infinity;
  for (const v of ladder) {
    const d = Math.abs(v - px);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/**
 * 明度台阶（前景不透明度）。
 *
 * 和字号同一个病：全片 alpha 散布在 0.45/0.5/0.55/0.6/0.7/0.75/0.8/0.85/0.9/0.95/1.0
 * —— 每档只差 0.05，肉眼分不出主次。这里把它收敛成 4 档、档间拉到 0.16~0.25。
 *
 *   PRIMARY  1.00  主角：主读数、标题、正在唱的词
 *   BODY     0.80  正文
 *   SUB      0.55  次级读数 / 说明
 *   GHOST    0.30  背景纹理 / 抬头水印
 *
 * 用法：label(ctx, s, x, y, "…", null, TYPE.HEAD, INK.PRIMARY)
 * 需要「再淡一点」表达状态（如未选中）时，用 INK.of("SUB", 0.6) 缩放，
 * 但**不要**自己造新的绝对值。
 */
export const INK = {
  PRIMARY: 1.0,
  BODY: 0.8,
  SUB: 0.55,
  GHOST: 0.3,
};

/** 档名直接当 alpha 用；第二参可选再乘一个缩放（0~1）。 */
INK.of = (name, scale = 1) => snapInk((INK[String(name).toUpperCase()] ?? INK.BODY) * scale);

/**
 * 把任意 alpha 收进最近的明度档。
 * 和 snapType 一样，让历史遗留的裸数字自动归位。
 */
export function snapInk(a) {
  const v = Math.max(0, Math.min(1, a));
  const ladder = [INK.GHOST, INK.SUB, INK.BODY, INK.PRIMARY];
  let best = ladder[0];
  let bestD = Infinity;
  for (const x of ladder) {
    const d = Math.abs(x - v);
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  return best;
}

// ---------------------------------------------------------------- 安全区

/**
 * 版式安全区（stage 单位 = 像素）。全片 1920×1080 都在这个范围里排。
 *
 * 为什么要有它：之前每个调用点手填坐标，于是出现「警告弹窗贴在屏幕顶上、
 * 看着像出了画」。安全区把「不能踩的边」变成函数里的一道约束，
 * 而不是靠人记得。
 */
export const SAFE = {
  left: 80,
  right: 1840,
  top: 96, // 让开顶部那条扫描高光（y=0..2）＋抬头（xx.exe）带
  bottom: 1008,
};

/** 把 [center,size] 夹进安全区（返回合法中心点） */
function clampCenter(center, size, lo, hi) {
  const half = size / 2;
  const min = lo + half;
  const max = hi - half;
  if (max < min) return (lo + hi) / 2; // 比安全区还大：居中
  return Math.min(Math.max(center, min), max);
}

/** 把 [start,size] 夹进安全区（返回合法起点） */
function clampStart(start, size, lo, hi) {
  const max = hi - size;
  if (max < lo) return (lo + hi) / 2 - size / 2;
  return Math.min(Math.max(start, lo), max);
}

// ---------------------------------------------------------------- 桌面背景

/**
 * 近黑底 + 极淡竖条纹（参考片的背景纹理），可选横向扫描行。
 *
 * 【2026-09】这里原来是**完全静态**的 `fillRect` —— 于是每块画板在「等下一句
 * 歌词」时，等于铺了一张死背景然后什么都不做。全片的静止段大半由此而来。
 * 现在底本身是时间的函数：条纹缓慢漂移、一道极淡的扫掠光来回走。
 * 改这一处 = 14 块画板的背景同时活过来（desk 是共享函数），不用逐块重排。
 */
export function desk(ctx, s, opt = {}) {
  // 图层开关：检查器可以单独关掉背景（desk）看效果
  if (s.layerOff && s.layerOff.desk) return;
  const { stripes = true, scan = false } = opt;
  const W = s.W;
  const H = s.H;
  ctx.fillStyle = UI.ink;
  ctx.fillRect(0, 0, W, H);

  if (stripes) {
    // 条纹不再是「固定位置」：整排以极慢速度横移，并随呼吸微调间距
    const drift = (s.ms * 0.0026) % 6;
    const gap = 6 + Math.sin(s.ms / 5200) * 0.6;
    ctx.fillStyle = "rgba(255,255,255,0.012)";
    for (let x = -6 + drift; x < W; x += gap) ctx.fillRect(x, 0, 2, H);
  }

  // 扫掠光：一道很宽的极淡斜向光带，来回走（周期 ≈ 11s）
  const sweep = Math.sin(s.ms / 1750) * 0.5 + 0.5; // 0..1
  const gx = -W * 0.5 + sweep * W * 2;
  const g = ctx.createLinearGradient(gx - W * 0.35, 0, gx + W * 0.35, H);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.022)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 顶部一条随拍轻跳的细高光（给画面一个「有在跑」的读数）
  //
  // ⚠️ 它画在 y=0..2 —— 任何**贴顶**的元素（弹窗、面板）都会被它横切一刀，
  // 看起来就是「上面被遮住了一半」。修法不是把元素往下挪（那只是躲），
  // 而是**这条高光自己让开顶部**：它只在「抬头带」上方那一条窄带里跑，
  // 而所有内容元素都在 SAFE.top(=96) 以下，两者不再重叠。
  const bp = s.beat - Math.floor(s.beat);
  ctx.fillStyle = `rgba(255,255,255,${0.03 + 0.035 * (1 - bp)})`;
  ctx.fillRect(0, 0, W, 2);
  // 再补一条更亮的、只占左上角一小段（明确是「读数」，不是横切画面的线）
  ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.05 * (1 - bp)})`;
  ctx.fillRect(0, 0, 150, 2);

  if (scan) {
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }
}

/**
 * 九宫格锚点：位置用「词」而不是像素说。
 *
 * 为什么要有它：协作时「挪到右下角」比「挪到 (1240,820)」好说得多，
 * 而且用锚点排出来的东西**自动避让安全区**，不会再出现「贴顶被切一半」。
 *
 *   const r = anchorRect(ANCHOR.BOTTOM_RIGHT, { w: 760, h: 190 });
 *   panel(ctx, s, r.x, r.y, r.w, r.h, ...)
 */
export const ANCHOR = {
  TOP_LEFT: "TOP_LEFT", TOP_CENTER: "TOP_CENTER", TOP_RIGHT: "TOP_RIGHT",
  MID_LEFT: "MID_LEFT", CENTER: "CENTER", MID_RIGHT: "MID_RIGHT",
  BOTTOM_LEFT: "BOTTOM_LEFT", BOTTOM_CENTER: "BOTTOM_CENTER", BOTTOM_RIGHT: "BOTTOM_RIGHT",
};

/**
 * 按锚点算出一个矩形。pad 可覆盖默认边距。
 *
 * 名字用 anchorRect 而不是 at：全片 7 块画板都各自定义了局部的
 * `const at = (q, b) => …`（歌词查询辅助），叫 at 必被遮蔽 ——
 * 曾经因此让 03/09 的 dialog 拿到 NaN 中心、弹窗画到屏幕外。别再改回 at。
 */
export function anchorRect(anchor, opt = {}) {
  const w = opt.w ?? 760;
  const h = opt.h ?? 190;
  const padX = opt.padX ?? 48;
  const padY = opt.padY ?? 40;
  // 注意 top 用 SAFE.top：那是「抬头（xx.exe）」的下方，不会被顶部高光切到
  const L = SAFE.left + padX;
  const R = SAFE.right - padX - w;
  const T = SAFE.top + padY;
  const B = SAFE.bottom - padY - h;
  const CX = Math.round((SAFE.left + SAFE.right) / 2 - w / 2);
  const CY = Math.round((SAFE.top + SAFE.bottom) / 2 - h / 2);
  const x =
    anchor.endsWith("_LEFT") ? L :
    anchor.endsWith("_RIGHT") ? R :
    CX;
  const y =
    anchor.startsWith("TOP_") ? T :
    anchor.startsWith("BOTTOM_") ? B :
    CY;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

// ---------------------------------------------------------------- 深度系统
//
// 为什么有这一段：`_ui.js` 原本的规矩是「扁平 —— 不用辉光、不用 shadowBlur」。
// 但「扁平」被误读成了「没有深度」—— 于是全片只剩「位置 + 明度」两个维度，
// 看起来就平。真正该禁的是**发光**（那是另一套语言），不是**层次**。
// 参考片本身也是有台阶的：面板浮在桌面上、弹窗浮在面板上。
//
// 这四条都是「不发光也能造深度」的手段（网上查来的通用美术方法）：
//   elev   高度 / 投影 —— 阴影是「两个面分离程度」唯一可靠的视觉线索
//   fog    空气透视   —— 越远越灰、越冷、对比越低
//   near   景深提示   —— 主角清晰，配角压暗/降饱和
//   parallax 分层视差 —— 不同深度以不同速度移动（配合 depthBand）

/** 假想光源：左上。投影一律往右下偏。 */
export const LIGHT = { x: -1, y: -1 };

/**
 * 高度台阶。数值是「离桌面多高」的抽象单位，不是像素。
 * 0 = 贴在桌面（无投影）  1 = 浮起（面板）  2 = 更高（弹窗/焦点）
 */
export const ELEV = {
  0: { dx: 0, dy: 0, blur: 0, alpha: 0, spread: 0 },
  1: { dx: 5, dy: 7, blur: 14, alpha: 0.34, spread: 2 },
  2: { dx: 9, dy: 13, blur: 26, alpha: 0.42, spread: 4 },
};

/**
 * 投影。**不用 shadowBlur**（慢且跨平台不一致），改用叠几层偏移半透明矩形。
 * 层次大一点就多叠一层，模拟模糊扩散。
 * @param {number} x,y,w,h  被投物体的矩形
 * @param {number} elev     0|1|2
 * @param {object} [opt]    { light } 覆盖光源方向
 */
export function shadow(ctx, s, x, y, w, h, elev = 1, opt = {}) {
  const e = ELEV[elev] ?? ELEV[1];
  if (!e.alpha) return;
  const L = opt.light ?? LIGHT;
  const dir = Math.sign(L.x) || 1;
  ctx.save();
  // 三层：主影 + 两层扩散（offset 递增、alpha 递减）
  for (let k = 0; k < 3; k++) {
    const off = e.spread * k;
    const a = e.alpha * (1 - k * 0.34);
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0, a).toFixed(3)})`;
    ctx.fillRect(
      x + e.dx * dir * (1 + k * 0.5) - off,
      y + e.dy * (1 + k * 0.5) - off,
      w + off * 2,
      h + off * 2,
    );
  }
  ctx.restore();
}

/**
 * 空气透视：把颜色按「深度」混向背景色并降对比。
 * depth 0 = 在最前面（原色）  1 = 最远（几乎等于背景）
 * 这是「越远越灰、越冷」那条规律的实现。
 */
export function fog(hex, depth) {
  const d = Math.max(0, Math.min(1, depth));
  const rgb = hexToRgbArr(hex);
  const bg = hexToRgbArr(UI.ink);
  const out = [0, 1, 2].map((i) => Math.round(rgb[i] + (bg[i] - rgb[i]) * d * 0.82));
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

function hexToRgbArr(hex) {
  const h = String(hex).replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 深度对不透明度的衰减（比 fog 更轻，用来叠在 fog 上做「虚」） */
export const fadeAt = (depth, base = 1) => base * (1 - 0.55 * Math.max(0, Math.min(1, depth)));

/**
 * 分层视差：同一个物体，深度不同 → 位移不同。
 * 用法：把一块画板拆成 2~3 组，各组用同一个基准偏移 + 自己的 depth。
 *   const off = parallax(s, 0.15, 34);   // 远层：动得少
 *   const off2 = parallax(s, 0.6, 34);   // 近层：动得多
 * @param {number} depth 0(远)~1(近)
 * @param {number} amount 摆动幅度（像素）
 */
export function parallax(s, depth, amount = 30) {
  return Math.sin(s.ms / 2600 + depth * 2.2) * amount * depth;
}

// ---------------------------------------------------------------- 面板 / 对话框

/**
 * 窗口面板。light=true 是参考片里的浅色面板（白底黑字）。
 * opt: { light, title, dots, noBar, elev }  elev 0=贴桌面 1=浮起(默认) 2=更高
 */
export function panel(ctx, s, x, y, w, h, opt = {}) {
  const { light = false, title = null, dots = false, noBar = false, elev = 1, scale = 1 } = opt;
  reg(s, 'panel', x, y, w, h, title || null);
  x = clampStart(x, w, SAFE.left, SAFE.right);
  y = clampStart(y, h, SAFE.top, SAFE.bottom);
  ctx.save();
  // B1 pop-in 缩放：以面板中心 (x + w/2, y + h/2) 为中心
  if (scale !== 1) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  shadow(ctx, s, x, y, w, h, elev); // 先影后体：这一步就是「浮起来」
  ctx.fillStyle = light ? rgba(UI.panel, 0.96) : rgba(UI.ink2, 0.92);
  ctx.fillRect(x, y, w, h);

  // 「活的材质」：面板内部不是纯色，而是一层逐帧在动的极淡颗粒。
  // 为什么必须在这里做：面板是画面里**面积最大、完全不透明**的色块，
  // 面板一静止，整帧 70~90% 的像素就是死的 —— 上面再怎么叠东西都救不了
  // 平均帧间差异。这里每像素只变 2~4 级，视觉上只是「屏幕有颗粒」，
  // 但足以让整块面板每一帧都不同。
  if (w > 40 && h > 40) {
    const grainMs = Math.floor(s.ms / 42); // 时间步进
    const step = 10; // 颗粒间距（越小越密越贵、也越难压缩）
    const seed = (x * 7919 + y * 104729) | 0;
    for (let gy = y + 3; gy < y + h - 3; gy += step) {
      const rowSeed = (seed + gy * 131) | 0;
      for (let gx = x + 3; gx < x + w - 3; gx += step) {
        const n = s.noise((rowSeed + gx * 17 + grainMs * 977) * 0.001, 51);
        if (n < 0.62) continue;
        const a = (n - 0.62) / 0.38;
        ctx.fillStyle = light
          ? `rgba(20,20,22,${(a * 0.032).toFixed(3)})`
          : `rgba(233,233,236,${(a * 0.035).toFixed(3)})`;
        ctx.fillRect(gx, gy, 4, 4);
      }
    }
  }

  ctx.strokeStyle = light ? rgba(UI.panelInk, 0.55) : rgba(UI.line, 0.9);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  // 顶部一条极亮的高光边 + 底部一条暗边：给面板一个「厚度」
  ctx.fillStyle = light ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.06)";
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  if (!noBar) {
    const barH = Math.round(TYPE.SUB * 2.0); // 按字号算：18px 字 → 36px 栏
    ctx.fillStyle = light ? rgba(UI.panelInk, 0.08) : rgba(UI.text, 0.07);
    ctx.fillRect(x, y, w, barH);
    // 标题栏的下边线：给这条 bar 一个「结束」，不然它和面板顶边混在一起
    ctx.fillStyle = light ? rgba(UI.panelInk, 0.22) : rgba(UI.text, 0.14);
    ctx.fillRect(x, y + barH - 1, w, 1);
    if (title) {
      ctx.font = s.mono(TYPE.SUB);
      ctx.fillStyle = light ? rgba(UI.panelInk, 0.8) : rgba(UI.text, 0.75);
      // 基线居中：barH/2 + 字高*0.35，保证字在栏内垂直居中而不是压到下沿
      ctx.fillText(title, x + 12, y + barH / 2 + TYPE.SUB * 0.35);
    }
    if (dots) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = light ? rgba(UI.panelInk, 0.35) : rgba(UI.text, 0.35);
        ctx.beginPath();
        ctx.arc(x + w - 22 - i * 20, y + barH / 2, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 帧内特效
//
// 这些原来都是**散落在各画板里的裸 canvas 调用**（比如 03-geometry 里那一坨
// 切片错位）。问题：没法被登记、没法被单独关闭、别的画板要用只能复制粘贴。
// 现在提升成有名字的装置 —— 检查器能列出它们、能一个个关掉看效果。
//
// 每个都遵守同一个约定：`s.fxOff[name] === true` 时**自己跳过**，
// 所以检查器的图层开关不用改画板代码就能生效。

/** 是否被图层开关关掉了 */
function fxOn(s, name) {
  return !(s.fxOff && s.fxOff[name]);
}

/**
 * 眩晕：整屏水平切片错位 + 亮度闪 + 扫描线抖动。
 * amp 0..1 控制强度。原来写在 03-geometry 的 dizzy 分支里。
 */
export function glitchSlice(ctx, s, amp) {
  if (!fxOn(s, "glitchSlice") || amp <= 0.01) return;
  const sliceH = 26;
  for (let yy = 0; yy < s.H; yy += sliceH) {
    const k = s.noise(yy * 3.7 + Math.floor(s.ms / 55) * 13, 71);
    if (k < 0.55) continue;
    const off = ((k - 0.55) / 0.45) * 46 * amp * (k > 0.8 ? -1 : 1);
    ctx.save();
    ctx.globalAlpha = 0.85 * amp;
    ctx.drawImage(ctx.canvas, 0, yy, s.W, sliceH, off, yy, s.W, sliceH);
    ctx.restore();
  }
  const flick = Math.max(0, Math.sin(s.ms / 47)) * amp * 0.35;
  ctx.fillStyle = `rgba(0,0,0,${flick.toFixed(3)})`;
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.fillStyle = `rgba(233,233,236,${(0.05 * amp).toFixed(3)})`;
  for (let yy = 0; yy < s.H; yy += 3) {
    if (s.noise(yy * 1.3 + Math.floor(s.ms / 30), 72) > 0.6) ctx.fillRect(0, yy, s.W, 1);
  }
}

/** 白闪：整屏一层白，p 0..1 是强度（一般用 sin 让它进出） */
export function flashWhite(ctx, s, p) {
  if (!fxOn(s, "flashWhite") || p <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(245,245,247,${clamp01(p) * 0.85})`;
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.restore();
}

/**
 * 撞击瞬间抖动（pdoom hook 风格：amp × pulse(t, t0, halfLife) 双向噪声）。
 *
 *   ampPx = 总振幅(px)，X/Y 各 ±ampPx/2。
 *   halfLifeMs = 脉冲半衰期（默认 60ms）。
 *   t0 = 撞击时刻 (ms | null | ms[])。不传则跟 s.hit() 走音频 onset。
 *       传数组可叠加多个撞点（每个 ampPx 对应自己的 halfLife）。
 *
 *     cameraShake(ctx, s, 20);                              // 音频 onset 触发
 *     cameraShake(ctx, s, 15, 80, tIll);                  // tIll 时刻 80ms 半衰期
 *     cameraShake(ctx, s, [18, 12], [60, 80], [tGod, tIll]); // 双撞点叠加
 *
 * ⚠️ 本函数只调 ctx.translate —— **必须在 draw() 最外层调用**，
 * 或者自己保证后面有 restore 配对。**不影响 floor / grain**(它们是画板之外的层)。
 * 画板作者可在 AGENTS.md 「动效库候选」查阅设计动机。
 */
export function cameraShake(ctx, s, ampPx, halfLifeMs = 60, t0 = null) {
  // 单个 vs 多个撞点 —— 统一成数组处理
  const amps = Array.isArray(ampPx) ? ampPx : [ampPx];
  const hlfs = Array.isArray(halfLifeMs) ? halfLifeMs : [halfLifeMs];
  const t0s = (() => {
    if (t0 === null) return [null];
    if (Array.isArray(t0)) return t0;
    return [t0];
  })();
  if (amps.length === 0) return;

  let dx = 0, dy = 0;
  for (let i = 0; i < amps.length; i++) {
    const a = amps[i];
    if (a< 0.5) continue;
    const hl = hlfs[Math.min(i, hlfs.length - 1)];
    const t = t0s[Math.min(i, t0s.length - 1)];
    const amp = t !== null
      ? pulses([t], s.ms, hl, 1200)
      : s.hit(hl);
    if (amp< 0.02) continue;
    // 不同撞点用不同 noise 通道 —— 避免撞点叠加后变零
    const ch = i * 7;
    dx += (s.noise(s.frame, ch) - 0.5) * a * amp;
    dy += (s.noise(s.frame, ch + 1) - 0.5) * a * amp;
  }
  if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
  ctx.translate(dx, dy);
}

/**
 * 弹窗 pop-in 缩放因子(pdoom 风格：outBack 过冲再回弹)。
 * 返回 0..1+ 范围,1.0+ 表示「过冲」瞬间。
 *
 *   s.ms < t0  →  返回 0(弹窗不出现)
 *   s.ms >= t0 →  返回 fromAmp + (1 - fromAmp) * easeOutBack(k)
 *                 k = clamp01((s.ms - t0) / durMs)
 *
 * 典型用法(画板里):
 *   dialog(ctx, s, 960, 700, { p: popIn(s, tIll), ... });
 *   trashDone(ctx, s, 1420, 400, popIn(s, tErase + 600, 350));
 *
 * ⚠️ **本函数不调 ctx,只返回值**。把它乘到现有装置的 p 参数即可。
 * 要做缩放效果,装置内部需要把这个因子当透明度 + 缩放源(dialog/panel/trashDone
 * 已经接 p 的透明度,装置需要额外接 popInScale 或在内部自己 scale)。
 */
export function popIn(s, t0, durMs = 400, fromAmp = 0.92, overshoot = 1.7) {
  if (s.ms < t0) return 0;
  const k = clamp01((s.ms - t0) / durMs);
  return fromAmp + (1 - fromAmp) * easeOutBack(k, overshoot);
}

/**
 * 撞击光波(shockLight)：从 (cx, cy) 出发,圆环向外扩散,然后淡出。
 * 配合 cameraShake 用,pdoom 的"撞击" = shake + shockLight 同时起。
 *
 *   shockLight(ctx, s, cx, cy, t0, opt = {})
 *     t0 = 撞击时刻(ms)
 *     opt:
 *       maxR    最大半径 (默认 320px)
 *       durMs   持续时间 (默认 600ms)
 *       color   圆环颜色 (默认 signal 红 #cf2a24)
 *       width   圆环线宽 (默认 3)
 *
 * 圆环半径 = maxR * easeOutExpo(k),k = (s.ms - t0)/durMs
 * 透明度   = (1 - k) * 0.8    —— 越远越淡
 */
export function shockLight(ctx, s, cx, cy, t0, opt = {}) {
  if (s.ms < t0) return;
  const { maxR = 320, durMs = 600, color = UI.red, width = 3 } = opt;
  const k = clamp01((s.ms - t0) / durMs);
  if (k >= 1) return;
  const r = maxR * (1 - Math.pow(1 - k, 3)); // easeOutExpo
  const a = (1 - k) * 0.8;
  ctx.save();
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // 内层淡光（更细更亮）
  ctx.strokeStyle = rgba(color, a * 0.5);
  ctx.lineWidth = width * 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * 撞击粒子碎裂(particleBurst)：从 (cx, cy) 向 n 个方向飞出 n 个粒子。
 * 每个粒子按固定速度向外,持续衰减 —— 给撞击加"碎裂感"。
 *
 *   particleBurst(ctx, s, cx, cy, t0, opt = {})
 *     t0 = 撞击时刻(ms)
 *     opt:
 *       n       粒子数 (默认 18)
 *       speed   速度 (px/s,默认 480)
 *       size    粒子大小 (默认 3px)
 *       durMs   持续时间 (默认 500ms)
 *       color   粒子颜色 (默认 white)
 *       seedCh  noise 通道 (默认 100,跟 cameraShake / shockLight 不冲突)
 *
 * 方向和大小由 noise(seedCh, i) 决定 —— 确定性,不同撞点可以用不同 seedCh。
 */
export function particleBurst(ctx, s, cx, cy, t0, opt = {}) {
  if (s.ms < t0) return;
  const { n = 18, speed = 480, size = 3, durMs = 500, color = UI.white, seedCh = 100 } = opt;
  const k = clamp01((s.ms - t0) / durMs);
  if (k >= 1) return;
  const age = (s.ms - t0) / 1000; // 秒
  const a = (1 - k) * 0.9;
  ctx.save();
  ctx.fillStyle = rgba(color, a);
  for (let i = 0; i < n; i++) {
    const ang = s.noise(seedCh, i) * Math.PI * 2;
    const v = speed * (0.6 + s.noise(seedCh + 1, i) * 0.8);
    const dx = Math.cos(ang) * v * age;
    const dy = Math.sin(ang) * v * age;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, size * (1 - k * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 文字辉光(textGlow)：在文字周围画几层不同透明度的同文字 ——「发光」效果。
 * 配合 popIn 用：文字弹出时同时辉光,过 300ms 后淡出。
 *
 *   textGlow(ctx, s, x, y, text, font, opt = {})
 *     x/y/text/font 跟 ctx.fillText 一致(调用方负责设 font)
 *     opt:
 *       color   辉光色 (默认 white)
 *       amp     起始强度 0..1,默认 0.6(过冲到 1.0 再衰减)
 *       durMs   辉光持续时间,默认 500ms
 *
 * 警告: ⚠️ 调用方**必须自己 ctx.font = ...**,本函数不读 opt.font
 * 性能:画 3 层文字,1px,3px,5px 半径递增,total ~4x ctx.fillText 的开销
 */
export function textGlow(ctx, s, x, y, text, opt = {}) {
  const { color = UI.white, durMs = 500 } = opt;
  // 辉光强度:在"开始出现"那一刻最大,稳定后归 0
  // 调用方负责"现在是不是新出现",通过 amp 传;不传 amp 就一直微弱
  // 这里做成"如果画板没传 amp,默认用 easeOutBack 一次性闪"
  if (s.frame === undefined) return; // 容错
  const t0 = (opt.t0 != null) ? opt.t0 : s.ms;
  const k = clamp01((s.ms - t0) / durMs);
  if (k >= 1) return;
  const a = (1 - k) * 0.6;
  ctx.save();
  ctx.fillStyle = rgba(color, a * 0.4);
  ctx.fillText(text, x, y);
  ctx.fillStyle = rgba(color, a * 0.25);
  ctx.fillText(text, x, y);
  ctx.fillStyle = rgba(color, a * 0.15);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 雷达扇区：一个旋转的扇形扫掠（用在 08-dial 的转盘上） */
export function radarSweep(ctx, s, cx, cy, r, opt = {}) {
  if (!fxOn(s, "radarSweep")) return;
  const period = opt.periodMs ?? 2600;
  const rr = (s.ms / period) % 1;
  const ra = rr * Math.PI * 2;
  const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(ra) * r, cy + Math.sin(ra) * r);
  g.addColorStop(0, opt.from ?? "rgba(30,64,216,0.28)");
  g.addColorStop(1, opt.to ?? "rgba(30,64,216,0)");
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, ra - (opt.spread ?? 0.5), ra);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 涟漪：一圈一直在扩、一直在灭的环 */
export function ripple(ctx, s, cx, cy, r0, r1, hex = null, periodMs = 1400) {
  if (!fxOn(s, "ripple")) return;
  const p = (s.ms / periodMs) % 1;
  ctx.save();
  ctx.strokeStyle = rgba(hex ?? UI.blue, 0.6 * (1 - p));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r0 + p * r1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 扫描光带：一道横带在画面里上下走（「清空之后机器还在跑」那类） */
export function scanBand(ctx, s, opt = {}) {
  if (!fxOn(s, "scanBand")) return;
  const periodMs = opt.periodMs ?? 3800;
  const h = opt.height ?? 320;
  const y = (0.5 + 0.5 * Math.sin((s.ms / periodMs) * Math.PI * 2)) * s.H;
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  const col = opt.colour ?? "rgba(30,64,216,0.10)";
  g.addColorStop(0, col.replace(/[\d.]+\)$/, "0)"));
  g.addColorStop(0.5, col);
  g.addColorStop(1, col.replace(/[\d.]+\)$/, "0)"));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, y - h / 2, s.W, h);
  ctx.restore();
}

/** 水平扫描线：整屏逐行细线（监控/CRT 感） */
export function scanlines(ctx, s, alpha = 0.08, step = 4) {
  if (!fxOn(s, "scanlines")) return;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < s.H; y += step) ctx.fillRect(0, y, s.W, 1);
  ctx.restore();
}

/** 系统对话框（参考片里那种居中弹窗）。icon: "warn" | "info" | "error" */
export function dialog(ctx, s, cx, cy, opt = {}) {
  const { icon = "warn", text = "", sub = null, w = 760, h = 190, p = 1, scale = 1 } = opt;
  reg(s, 'dialog', cx - w / 2, cy - h / 2, w, h, text);
  const e = easeOutCubic(clamp01(p));
  // 安全区约束：弹窗中心不许把矩形顶出屏幕（入场还会再上移 14px，一并计入）。
  cx = clampCenter(cx, w, SAFE.left, SAFE.right);
  cy = clampCenter(cy + 14, h, SAFE.top, SAFE.bottom) - 14;
  ctx.save();
  ctx.globalAlpha *= e;
  // ⚠️ 必须带上 cy！这里原来只 translate 了 cx，第二个参数是「入场下滑 14px」
  // 的偏移 —— 结果全片每个 dialog 都画在 y=0 那条线上，上半截出屏（“贴顶”）。
  ctx.translate(cx, cy + (1 - e) * -14);
  // B1 pop-in 缩放：scale 一般由 popIn(s, t0) 给出，1.0+ 表示「过冲」
  // 应用在「弹窗中心」坐标系 —— 先 translate 到中心,scale,再 translate(-w/2,-h/2)
  if (scale !== 1) {
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
  }
  shadow(ctx, s, -w / 2, -h / 2, w, h, 2); // 弹窗比面板高一档：它是最前面的
  ctx.fillStyle = rgba(UI.panel, 0.97);
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = rgba(UI.panelInk, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  // 图标
  const ix = -w / 2 + 58;
  if (icon === "warn") {
    ctx.fillStyle = UI.warn;
    ctx.beginPath();
    ctx.moveTo(ix, -26);
    ctx.lineTo(ix + 26, 22);
    ctx.lineTo(ix - 26, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = UI.panelInk;
    ctx.font = s.mono(24, 700);
    ctx.fillText("!", ix - 4, 14);
  } else if (icon === "error") {
    ctx.fillStyle = UI.red;
    ctx.beginPath();
    ctx.arc(ix, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = UI.white;
    ctx.font = s.mono(26, 700);
    ctx.fillText("×", ix - 9, 10);
  } else {
    ctx.strokeStyle = UI.blue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ix, 0, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = UI.blue;
    ctx.font = s.mono(26, 700);
    ctx.fillText("i", ix - 3, 10);
  }
  ctx.font = s.mono(26, 600);
  ctx.fillStyle = UI.panelInk;
  ctx.fillText(text, -w / 2 + 110, 4);
  if (sub) {
    ctx.font = s.mono(19);
    ctx.fillStyle = rgba(UI.panelInk, 0.62);
    ctx.fillText(sub, -w / 2 + 110, 44);
  }
  ctx.restore();
}

/** 垃圾桶确认框（参考片里"清空记忆"那一下） */
export function trashDone(ctx, s, cx, cy, p, opt = {}) {
  const { label = "Done.", scale = 1 } = opt;
  const e = easeOutCubic(clamp01(p));
  const w = 560;
  const h = 150;
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'trashDone', cx - w / 2, cy - h / 2, w, h, label);
  cx = clampCenter(cx, w, SAFE.left, SAFE.right);
  cy = clampCenter(cy, h, SAFE.top, SAFE.bottom);
  ctx.save();
  ctx.globalAlpha *= e;
  // B1 pop-in 缩放：以 (cx, cy) 为中心
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  shadow(ctx, s, cx - w / 2, cy - h / 2, w, h, 2);
  ctx.fillStyle = rgba(UI.panel, 0.97);
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = rgba(UI.panelInk, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  // 垃圾桶图标
  const bx = cx - w / 2 + 70;
  ctx.fillStyle = UI.panelInk;
  ctx.fillRect(bx - 22, cy - 22, 44, 8);
  ctx.fillRect(bx - 18, cy - 34, 36, 8);
  ctx.fillRect(bx - 15, cy - 14, 30, 40);
  ctx.fillStyle = rgba(UI.panel, 1);
  for (let i = -1; i <= 1; i++) ctx.fillRect(bx + i * 8 - 2, cy - 6, 2, 24);
  ctx.fillStyle = UI.panelInk;
  ctx.font = s.mono(26, 600);
  ctx.fillText(label, cx - w / 2 + 130, cy + 9);
  ctx.restore();
}

// ---------------------------------------------------------------- 控件

/** 条形码 / 打码块（参考片里表单字段被这些东西盖住） */
export function barcode(ctx, s, x, y, w, h, key = 0, hex = null) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'barcode', x, y, w, h, null);
  const c = hex ?? UI.panelInk;
  ctx.save();
  let px = x;
  let i = 0;
  while (px < x + w) {
    const bw = 3 + Math.floor(s.noise(i * 3.7 + key, 5) * 7);
    if (s.noise(i * 9.1 + key, 6) > 0.35) {
      ctx.fillStyle = rgba(c, 0.85);
      ctx.fillRect(px, y, Math.min(bw, x + w - px), h);
    }
    px += bw + 3;
    i++;
  }
  ctx.restore();
}

/** 表单一行：标签 + 值（值可以是条形码） */
export function fieldRow(ctx, s, x, y, w, opt = {}) {
  const { label = "", value = "", redacted = false, light = false, key = 0 } = opt;
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  // 注意：reg() 在解构之后 —— 它用到 label/value，写在解构前会 TDZ 崩溃。
  reg(s, 'fieldRow', x, y - 28, w, 44, label || value || null);
  const ink = light ? UI.panelInk : UI.text;
  ctx.save();
  ctx.font = s.mono(20);
  ctx.fillStyle = rgba(ink, 0.75);
  ctx.fillText(label, x, y);
  const fx = x + 190;
  ctx.strokeStyle = rgba(ink, 0.45);
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, y - 24, w - 200, 34);
  if (redacted) barcode(ctx, s, fx + 6, y - 18, w - 212, 22, key, ink);
  else if (value) {
    ctx.fillStyle = rgba(ink, 0.9);
    ctx.font = s.mono(22, 600);
    ctx.fillText(value, fx + 10, y + 2);
  }
  ctx.restore();
}

/** 单选按钮 */
export function radio(ctx, s, x, y, opt = {}) {
  const { label = "", on = false, light = false } = opt;
  reg(s, 'radio', x, y - 8, null, null, label);
  const ink = light ? UI.panelInk : UI.text;
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 7, 11, 0, Math.PI * 2);
  ctx.stroke();
  if (on) {
    ctx.fillStyle = UI.blue;
    ctx.beginPath();
    ctx.arc(x, y - 7, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = s.mono(20);
  ctx.fillStyle = rgba(ink, 0.85);
  ctx.fillText(label, x + 22, y);
  ctx.restore();
}

/** 复选框 */
export function checkbox(ctx, s, x, y, opt = {}) {
  const { label = "", checked = false, p = 1, light = false } = opt;
  reg(s, 'checkbox', x, y - 16, null, null, label);
  const ink = light ? UI.panelInk : UI.text;
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y - 16, 20, 20);
  if (checked) {
    ctx.strokeStyle = UI.blue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 6);
    ctx.lineTo(x + 9, y + 1);
    ctx.lineTo(x + 17, y - 12);
    ctx.stroke();
  }
  ctx.font = s.mono(20);
  ctx.fillStyle = rgba(ink, 0.8);
  ctx.fillText(label, x + 32, y);
  if (p < 1 && p >= 0) {
    ctx.fillStyle = rgba(UI.blue, (1 - p) * 0.25);
    ctx.fillRect(x, y - 18, 400, 24);
  }
  ctx.restore();
}

/** iOS 风格开关 */
export function toggle(ctx, s, x, y, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'toggle', x, y - 22, 86, 44, null);
  const { on = false, p = 1, light = false } = opt;
  const w = 86;
  const h = 40;
  const ink = light ? UI.panelInk : UI.text;
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + h / 2, y, h / 2, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + w - h / 2, y, h / 2, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = on ? rgba(UI.blue, 0.85) : rgba(UI.dim, 0.25);
  ctx.fill();
  const kx = lerp(x + h / 2, x + w - h / 2, easeOutCubic(clamp01(p)));
  ctx.fillStyle = on ? UI.white : rgba(UI.dim, 0.9);
  ctx.beginPath();
  ctx.arc(kx, y, h / 2 - 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 下拉选择框（歌词当选项 —— 参考片的招牌装置） */
export function select(ctx, s, x, y, w, opt = {}) {
  const { text = "", open = false, options = [], p = 1, opened = 0 } = opt;
  reg(s, 'select', x, y, w, 44, text);
  const h = 44;
  ctx.save();
  ctx.fillStyle = rgba(UI.ink2, 0.95);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(UI.line, 1);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.font = s.mono(22, 600);
  ctx.fillStyle = rgba(UI.text, 0.92);
  ctx.fillText(text, x + 14, y + 29);
  // 箭头
  ctx.fillStyle = rgba(UI.text, 0.7);
  const ax = x + w - 26;
  ctx.beginPath();
  ctx.moveTo(ax - 10, y + 18);
  ctx.lineTo(ax + 10, y + 18);
  ctx.lineTo(ax, y + 30);
  ctx.closePath();
  ctx.fill();
  if (open && opened > 0) {
    const eh = options.length * 40 + 8;
    const e = easeOutCubic(clamp01(opened));
    ctx.fillStyle = rgba(UI.ink2, 0.98);
    ctx.fillRect(x, y + h, w, eh * e);
    ctx.strokeStyle = rgba(UI.line, 1);
    ctx.strokeRect(x, y + h, w, eh * e);
    for (let i = 0; i < options.length; i++) {
      const oy = y + h + 4 + i * 40;
      if (oy + 40 > y + h + eh * e) break;
      if (i === p) {
        ctx.fillStyle = rgba(UI.blue, 0.75);
        ctx.fillRect(x + 2, oy, w - 4, 40);
      }
      ctx.font = s.mono(20);
      ctx.fillStyle = rgba(i === p ? UI.white : UI.text, 0.9);
      ctx.fillText(options[i], x + 16, oy + 27);
    }
  }
  ctx.restore();
}

/** 点阵进度条（片头那个） */
export function dottedBar(ctx, s, x, y, w, h, p) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'dottedBar', x, y, w, h, null);
  ctx.save();
  const cols = Math.floor(w / 8);
  const filled = Math.round(cols * clamp01(p));
  for (let i = 0; i < cols; i++) {
    ctx.fillStyle = i < filled ? rgba(UI.text, 0.92) : rgba(UI.dim, 0.22);
    ctx.fillRect(x + i * 8, y, 5, h);
  }
  ctx.restore();
}

/** 实心进度条 */
export function bar(ctx, s, x, y, w, h, p, hex = null) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'bar', x, y, w, h, null);
  ctx.save();
  ctx.fillStyle = rgba(UI.dim, 0.25);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = rgba(hex ?? UI.blue, 0.9);
  ctx.fillRect(x, y, w * clamp01(p), h);
  ctx.restore();
}

// ---------------------------------------------------------------- 系统图标

/** 电源按钮 ⏻（用基本图形画，不靠字体里的 U+23FB） */
export function powerButton(ctx, s, cx, cy, r, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'powerButton', cx - r, cy - r, r * 2, r * 2, null);
  const { hex = null, on = true, glow = 0, scale = 1 } = opt;
  const c = hex ?? UI.text;
  ctx.save();
  // B1 pop-in 缩放：以 (cx, cy) 为中心
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = rgba(c, on ? 0.95 : 0.35);
  ctx.lineWidth = Math.max(4, r * 0.13);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, -Math.PI * 0.28, Math.PI * 1.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy - r * 0.32);
  ctx.stroke();
  if (glow > 0) {
    // 电气感：一圈淡淡的外扩（不是辉光滤镜，是叠描边）
    for (const [m, a] of [
      [1.35, 0.06],
      [1.15, 0.1],
    ]) {
      ctx.strokeStyle = rgba(c, a * glow);
      ctx.lineWidth = 6 * m;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.82 * m, -Math.PI * 0.28, Math.PI * 1.28);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 打字机文本：t0 开始，cps 字/秒；返回已打出的字符数 */
export function typewriter(ctx, s, x, y, text, t0, opt = {}) {
  const { cps = 14, size = 30, hex = null, weight = 400, cursor = true } = opt;
  reg(s, 'typewriter', x, y - size, null, null, text);
  const n = Math.max(0, Math.floor(((s.ms - t0) / 1000) * cps));
  const shown = text.slice(0, n);
  ctx.save();
  ctx.font = s.mono(size, weight);
  ctx.fillStyle = rgba(hex ?? UI.text, 0.95);
  ctx.fillText(shown, x, y);
  if (cursor && n < text.length && Math.floor(s.ms / 260) % 2 === 0) {
    const w = ctx.measureText(shown).width;
    ctx.fillStyle = rgba(UI.text, 0.9);
    ctx.fillRect(x + w + 4, y - size * 0.8, size * 0.5, size * 0.95);
  }
  ctx.restore();
  return n;
}

/** 巨型裁切字体（参考片里那种超出画面的巨大数字/字） */
export function giant(ctx, s, x, y, text, size, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'giant', x, y - size, null, null, text);
  const { alpha = 0.16, hex = null } = opt;
  ctx.save();
  ctx.font = s.mono(size, 700);
  ctx.fillStyle = rgba(hex ?? UI.text, alpha);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 情绪数值面板（Feeling Index） */
export function feelingIndex(ctx, s, x, y, w, opt = {}) {
  const { items = [], mark = null, title = "Feeling Index", badge = "object/You", quiet = false } = opt;
  reg(s, 'feelingIndex', x, y, w, 260, title);
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  // quiet：作为背景纹理用时，整体压到明度刻度之外（不进 PRIMARY 档，避免抢焦点）
  const A = quiet ? { title: 0.42, body: 0.3, mark: 0.5 } : { title: 0.92, body: 0.72, mark: 1 };
  ctx.save();
  ctx.font = s.mono(TYPE.BODY, 700);
  ctx.fillStyle = rgba(UI.text, A.title);
  ctx.fillText(title, x, y);
  ctx.font = s.mono(TYPE.SUB);
  ctx.fillStyle = rgba(UI.blue, quiet ? 0.4 : 0.9);
  ctx.fillText(badge, x + ctx.measureText(title).width + 24, y - 6);
  ctx.font = s.mono(TYPE.SUB);
  ctx.fillStyle = rgba(UI.dim, A.body);
  ctx.fillText("+", x + w * 0.5 - 60, y + 26);
  const rowH = 28;
  for (let i = 0; i < left.length; i++) {
    const [name, val] = left[i];
    ctx.font = s.mono(TYPE.SUB);
    ctx.fillStyle = rgba(UI.text, name === mark ? A.mark : A.body);
    ctx.fillText(`${name} = ${val};`, x, y + 60 + i * rowH);
    if (name === mark) {
      ctx.fillStyle = rgba(UI.blue, quiet ? 0.5 : 1);
      ctx.fillRect(x - 4, y + 60 + i * rowH - 16, 3, 20);
    }
  }
  for (let i = 0; i < right.length; i++) {
    const [name, val] = right[i];
    ctx.font = s.mono(TYPE.SUB);
    ctx.fillStyle = rgba(UI.text, name === mark ? A.mark : A.body);
    ctx.fillText(`${name} = ${val};`, x + w * 0.52, y + 60 + i * rowH);
    if (name === mark) {
      ctx.fillStyle = rgba(UI.blue, quiet ? 0.5 : 1);
      ctx.fillRect(x + w * 0.52 - 4, y + 60 + i * rowH - 16, 3, 20);
    }
  }
  ctx.restore();
}

/** 日志控制台：> 开头的行，逐条出现 */
export function logConsole(ctx, s, x, y, w, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'logConsole', x, y - 20, w, 12 * 30, 'console');
  const { lines = [], size = 20, maxLines = 12, caret = true } = opt;
  // lines: [[text, atMs, hex?], ...]
  const shown = lines.filter((l) => s.ms >= l[1]).slice(-maxLines);
  ctx.save();
  ctx.font = s.mono(size);
  for (let i = 0; i < shown.length; i++) {
    const [text, , hex] = shown[i];
    ctx.fillStyle = rgba(hex ?? UI.text, 0.82);
    ctx.fillText(text, x, y + i * 30);
  }
  if (caret) {
    const cy = y + shown.length * 30;
    if (Math.floor(s.ms / 260) % 2 === 0) {
      ctx.fillStyle = rgba(UI.text, 0.8);
      ctx.fillRect(x, cy - size + 4, size * 0.55, size);
    }
  }
  ctx.restore();
  return y + shown.length * 30;
}

/** 一堵密集的小字彩墙（参考片里日志堆到爆的那一下） */
export function glitchWall(ctx, s, x, y, w, h, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'glitchWall', x, y, w, h, null);
  const { density = 0.5, seed = 0, cells = 46 } = opt;
  const cw = w / cells;
  const ch = 26;
  const rows = Math.ceil(h / ch);
  const CH = "executionsucceedworld0110><[]{}#*".split("");
  ctx.save();
  ctx.font = s.mono(20, 700);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cells; i++) {
      const n = s.noise((i + j * cells + seed) * 1.7, 3);
      if (n > density) continue;
      const rr = s.noise((i + j * cells + seed) * 5.3, 4);
      const hex = rr > 0.72 ? UI.red : rr > 0.55 ? UI.blue : rr > 0.4 ? UI.warn : UI.text;
      ctx.fillStyle = rgba(hex, 0.55 + 0.4 * s.noise(i * 3.1 + j, 7));
      ctx.fillText(CH[Math.floor(s.noise((i + j) * 2.3, 6) * CH.length) % CH.length], x + i * cw, y + j * ch);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 线框图形

/** 线框立方体（等轴测） */
export function wireCube(ctx, s, cx, cy, size, rot = 0, hex = null) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'wireCube', cx - size / 2, cy - size / 2, size, size, null);
  const c = hex ?? UI.text;
  const r = size / 2;
  const k = 0.5; // 等轴测压缩
  const p = (x, y, z) => [cx + (x - z) * 0.86, cy + (x + z) * k - y];
  ctx.save();
  ctx.strokeStyle = rgba(c, 0.7);
  ctx.lineWidth = 2;
  const v = [
    p(-r, -r, -r), p(r, -r, -r), p(r, r, -r), p(-r, r, -r),
    p(-r, -r, r), p(r, -r, r), p(r, r, r), p(-r, r, r),
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  ctx.beginPath();
  for (const [a, b] of edges) {
    ctx.moveTo(v[a][0], v[a][1]);
    ctx.lineTo(v[b][0], v[b][1]);
  }
  ctx.stroke();
  ctx.restore();
  void rot;
}

/** 线框爱心（参考片的情绪母题）：outline 或 mesh */
export function wireHeart(ctx, s, cx, cy, size, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'wireHeart', cx - size / 2, cy - size / 2, size, size, null);
  const { mesh = false, alpha = 0.9, hex = null, fillP = 0 } = opt;
  const c = hex ?? UI.text;
  const k = size / 100;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, 34 * k);
    ctx.bezierCurveTo(-70 * k, -10 * k, -38 * k, -72 * k, 0, -34 * k);
    ctx.bezierCurveTo(38 * k, -72 * k, 70 * k, -10 * k, 0, 34 * k);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = rgba(c, alpha);
  ctx.lineWidth = Math.max(1.5, 2.4 * k);
  path();
  ctx.stroke();
  if (fillP > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-80 * k, -80 * k + 170 * k * (1 - clamp01(fillP)), 160 * k, 170 * k * clamp01(fillP));
    ctx.clip();
    path();
    ctx.fillStyle = rgba(c, 0.7);
    ctx.fill();
    ctx.restore();
  }
  if (mesh) {
    // 网格（参考片那个"菱格爱心"）：横向弦 + 纵向细线
    ctx.save();
    path();
    ctx.clip();
    ctx.strokeStyle = rgba(c, alpha * 0.5);
    ctx.lineWidth = 1;
    for (let gx = -80; gx <= 80; gx += 16) {
      ctx.beginPath();
      ctx.moveTo(gx * k, -80 * k);
      ctx.lineTo(gx * k, 60 * k);
      ctx.stroke();
    }
    for (let gy = -80; gy <= 60; gy += 16) {
      ctx.beginPath();
      ctx.moveTo(-80 * k, gy * k);
      ctx.lineTo(80 * k, gy * k);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** 跑步小人（参考片结尾那个走网格条的小人） */
export function runner(ctx, s, x, y, scale = 1, t = 0) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'runner', x - 20, y - 50, null, null, null);
  const c = UI.panelInk;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = rgba(c, 0.9);
  ctx.fillStyle = rgba(c, 0.9);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -34, 8, 0, Math.PI * 2);
  ctx.fill();
  const ph = Math.sin(t * 0.006);
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(2, 2);
  ctx.moveTo(2, 2);
  ctx.lineTo(-10 - ph * 6, 22);
  ctx.moveTo(2, 2);
  ctx.lineTo(14 + ph * 6, 20);
  ctx.moveTo(0, -18);
  ctx.lineTo(-14 - ph * 8, -4);
  ctx.moveTo(0, -18);
  ctx.lineTo(14 + ph * 8, -6);
  ctx.stroke();
  ctx.restore();
}

/** 蓝屏（系统级界面）—— 同样是全屏色块，必须会动 */
export function blueScreen(ctx, s, opt = {}) {
  const { lines = 0, alpha = 1 } = opt;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = UI.blueDeep;
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.fillStyle = rgba(UI.blue, 0.5);
  ctx.fillRect(0, s.H * 0.32, s.W, 6);
  ctx.fillRect(0, s.H * 0.63, s.W, 6);
  // 扫描行缓慢下移 + 明暗呼吸：整块蓝屏不是死的
  const drift = (s.ms * 0.02) % 34;
  for (let i = 0; i < lines; i++) {
    ctx.fillStyle = `rgba(233,233,236,${(0.05 + 0.03 * Math.sin(s.ms / 900 + i)).toFixed(3)})`;
    ctx.fillRect(0, ((120 + i * 34 + drift) % (s.H + 40)) - 20, s.W, 2);
  }
  ctx.fillStyle = `rgba(0,0,0,${(0.08 + 0.06 * Math.sin(s.ms / 1500)).toFixed(3)})`;
  for (let y = 0; y < s.H; y += 4) ctx.fillRect(0, y, s.W, 1);
  ctx.restore();
}

// ---------------------------------------------------------------- 文字

export function label(ctx, s, x, y, text, hex = null, size = TYPE.BODY, alpha = INK.BODY, weight = 400) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'label', x, y - (size || 22), null, null, text);
  ctx.save();
  ctx.font = s.mono(snapType(size), weight);
  ctx.fillStyle = rgba(hex ?? UI.text, snapInk(alpha));
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * 「解码式」出现的文字：前面几个字已经解出来，后面的还在用乱码跳。
 *
 * 用户 2026-09-29 要求：`05-inspect` 属性面板里的字要有「加载动画」的感觉。
 * p = 0..1 的解码进度；乱码每 60ms 换一批（用 s.noise，不含 frame，所以同一 tick 内稳定）。
 * 登记的是**真实文案**（不是乱码），这样检查器里复制出来是可读的。
 */
export function labelDecode(ctx, s, x, y, text, p, opt = {}) {
  const { hex = null, size = TYPE.BODY, alpha = INK.BODY, weight = 400, seed = 0, step = 60 } = opt;
  const done = Math.floor(Math.max(0, Math.min(1, p)) * (text.length + 2));
  const tick = Math.floor(s.ms / step);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (i < done || text[i] === " ") {
      out += text[i];
    } else {
      const gi = Math.floor(s.noise(seed + i * 1.7 + tick * 0.9, 61) * GLYPH_SET.length) % GLYPH_SET.length;
      out += GLYPH_SET.charAt(gi);
    }
  }
  reg(s, 'label', x, y - (size || 22), null, null, text);
  ctx.save();
  ctx.font = s.mono(snapType(size), weight);
  ctx.fillStyle = rgba(hex ?? UI.text, snapInk(alpha));
  ctx.fillText(out, x, y);
  ctx.restore();
}

/**
 * 线框棋子（等轴测）。同一个造型复用 → 「实例化」的视觉依据。
 * kind: 'pawn' | 'rook' | 'bishop' —— 只用轮廓，不写实。
 *
 * 注意签名：第一个参数是 `s`（状态包），不是 ctx —— 因为要登记元素、
 * 将来可能还要读 s.ms。ctx 从 s 之外单独传，保持和其它装置一致。
 * 兼容旧调用：如果第一参传的是 ctx（有 canvas 属性），自动兼容。
 */
export function chessPiece(ctx, s, cx, cy, hgt, kind = "pawn", alpha = 1) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'chessPiece', cx - hgt * 0.3, cy - hgt * 0.8, hgt * 0.6, hgt, kind);
  const u = hgt / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = rgba(UI.text, 0.9);
  // 线宽跟尺寸走。固定 2px 去画一个 100px 的棋子 = 几根头发丝，看不清是棋子。
  ctx.lineWidth = Math.max(2, hgt * 0.045);
  // 底座（等轴测椭圆）
  ctx.beginPath();
  ctx.ellipse(0, 0, 26 * u, 26 * u * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  if (kind === "rook") {
    ctx.moveTo(-18 * u, 0);
    ctx.lineTo(-18 * u, -58 * u);
    ctx.lineTo(18 * u, -58 * u);
    ctx.lineTo(18 * u, 0);
    for (let i = 0; i < 3; i++) {
      const bx = -18 * u + i * 18 * u;
      ctx.moveTo(bx, -58 * u);
      ctx.lineTo(bx, -74 * u);
      ctx.lineTo(bx + 10 * u, -74 * u);
      ctx.lineTo(bx + 10 * u, -58 * u);
    }
  } else if (kind === "bishop") {
    ctx.moveTo(-16 * u, 0);
    ctx.bezierCurveTo(-22 * u, -30 * u, -14 * u, -52 * u, 0, -62 * u);
    ctx.bezierCurveTo(14 * u, -52 * u, 22 * u, -30 * u, 16 * u, 0);
    ctx.moveTo(-20 * u, -6 * u);
    ctx.lineTo(20 * u, -6 * u);
    ctx.moveTo(0, -62 * u);
    ctx.lineTo(0, -76 * u);
  } else {
    ctx.moveTo(-14 * u, 0);
    ctx.bezierCurveTo(-20 * u, -26 * u, -12 * u, -42 * u, 0, -48 * u);
    ctx.bezierCurveTo(12 * u, -42 * u, 20 * u, -26 * u, 14 * u, 0);
  }
  ctx.stroke();
  if (kind === "pawn") {
    ctx.beginPath();
    ctx.arc(0, -56 * u, 10 * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 性别符号（用基本图形画，不靠字体里有没有 ♂ ♀）。
 *
 * 【修 2026-09】原来圆画在 (0, size*0.12)、尾巴朝下/朝右上，整个符号的
 * **视觉中心不在原点上**。于是 rotate() 的时候它会绕着原点**公转**而不是
 * 自转 —— 观众看到的就是「转起来有额外偏移，很不好看」。
 * 第一次修：把整个符号按**包围盒**居中，让符号自身自转。
 *
 * 【修 2026-09-29（第二次）】按包围盒居中是错的 —— 包围盒的中心**不是圆的中心**：
 * ♀ 的尾巴朝下 → 圆心被抬上去 27px；♂ 的箭头朝右上 → 圆心被推偏 61px。后果：
 *   ① 圆的中心偏离转盘中心，自转时**绕着转盘中心打转**（蓝色扫描锥从圆心乱冒）；
 *   ② 切换 ♀/♂ 时 offset 突变，整个符号**跳一下** —— 看起来就是「突然转向别的角度」。
 * 现在改成：
 *   · **圆永远在原点**，两种性别**同一个圆**（同半径 r = size*0.34、同圆心）→ 和外圈同心；
 *   · 旋转绕**圆心**，所以圆钉在转盘中心不动，尾巴/箭头绕着它扫；
 *   · 尾巴的本地角度由 `morph` **连续插值**（0=♀ 朝正下，1=♂ 朝右上），
 *     末端样式（横杠↔箭头）跟着淡入淡出 → 切换是平滑形变，角度是继承的，不硬切。
 */
export function genderGlyph(ctx, s, x, y, size, rot, kind, opt = {}) {
  const { hex = null, alpha = 0.92, morph = kind === "male" ? 1 : 0 } = opt;
  const m = Math.max(0, Math.min(1, morph));
  const c = hex ?? UI.text;
  const r = size * 0.34; // 圆：两种性别完全一样
  const stemF = size * 0.26; // ♀ 尾巴长度
  const stemM = size * 0.34 * Math.SQRT2; // ♂ 尾巴长度（与旧版箭头够到的一样远）
  const head = size * 0.17; // 箭头（♂）
  const bar = size * 0.12;  // 横杠半长（♀）
  const tailLen = stemF + (stemM - stemF) * m;

  // 登记：以**圆**为准（这是恒定的那部分，不再随性别跳）
  reg(s, 'genderGlyph', x - r, y - r, r * 2, r * 2, kind);

  // 尾巴的本地角度：♀ 朝正下(+90°)，♂ 朝右上(-45°)；m 插值 → 形变连续、角度继承
  const tailA = (Math.PI / 2) * (1 - m) + (-Math.PI / 4) * m;
  const ux = Math.cos(tailA);
  const uy = Math.sin(tailA);
  const tx = ux * (r + tailLen);
  const ty = uy * (r + tailLen);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot); // 绕圆心自转（没有包围盒偏移，所以圆不会公转/跳）
  ctx.strokeStyle = rgba(c, alpha);
  ctx.lineWidth = Math.max(3, size * 0.085);
  ctx.lineCap = "round";
  // 圆（圆心恒在原点）
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // 尾巴：圆边 → 末端
  ctx.beginPath();
  ctx.moveTo(ux * r, uy * r);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  // 末端：♀ 横杠（m→0 越明显）
  if (m < 0.999) {
    const bx = ux * (r + tailLen * 0.62);
    const by = uy * (r + tailLen * 0.62);
    ctx.save();
    ctx.globalAlpha *= 1 - m;
    ctx.beginPath();
    ctx.moveTo(bx + uy * bar, by - ux * bar);
    ctx.lineTo(bx - uy * bar, by + ux * bar);
    ctx.stroke();
    ctx.restore();
  }
  // 末端：♂ 箭头（m→1 越明显）
  if (m > 0.001) {
    const a1 = tailA + Math.PI - 0.6;
    const a2 = tailA + Math.PI + 0.6;
    ctx.save();
    ctx.globalAlpha *= m;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(a1) * head, ty + Math.sin(a1) * head);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(a2) * head, ty + Math.sin(a2) * head);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** 词块（参考片里 `stable` 那种小胶囊） */
export function chip(ctx, s, x, y, w, text, opt = {}) {
  const { on = true, light = false } = opt;
  const h = 40;
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'chip', x, y, w, h, text);
  ctx.save();
  ctx.fillStyle = on
    ? light
      ? rgba(UI.panelInk, 0.85)
      : rgba(UI.text, 0.16)
    : rgba(UI.dim, 0.10);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(light ? UI.panelInk : UI.text, on ? 0.5 : 0.18);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.font = s.mono(20);
  ctx.fillStyle = on
    ? light
      ? rgba(UI.panel, 0.95)
      : rgba(UI.text, 0.92)
    : rgba(UI.dim, 0.5);
  ctx.fillText(text, x + 14, y + 27);
  ctx.restore();
}

/** 网格底（密码屏那种蓝灰方格） */
export function gridBg(ctx, s, opt = {}) {
  const { cell = 20, alpha = 0.10, hex = null, live = false } = opt;
  ctx.save();
  ctx.fillStyle = rgba(hex ?? UI.text, 0.06);
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.strokeStyle = rgba(hex ?? UI.text, alpha);
  ctx.lineWidth = 1;
  // live：网格缓慢漂移 + 亮度呼吸（背景也要是时间的函数）
  const dx = live ? (s.ms * 0.006) % cell : 0;
  const dy = live ? (s.ms * 0.0035) % cell : 0;
  const a = live ? 0.75 + 0.25 * Math.sin(s.ms / 1900) : 1;
  if (live) ctx.strokeStyle = rgba(hex ?? UI.text, alpha * a);
  ctx.beginPath();
  for (let x = -cell; x <= s.W + cell; x += cell) {
    ctx.moveTo(x + dx, 0);
    ctx.lineTo(x + dx, s.H);
  }
  for (let y = -cell; y <= s.H + cell; y += cell) {
    ctx.moveTo(0, y + dy);
    ctx.lineTo(s.W, y + dy);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 透视棋盘地板（国际象棋的黑白格）。
 *
 * 【为什么放这里】`Setup our new world` 之后这块棋盘要**跨两块画板**活着
 * （shot-01 的尾巴 + shot-02 的整段对弈）。跨画板的东西只能是共享装置 ——
 * 两边各自算一套透视参数，边界上一定会错位。
 *
 * 画法：8 列 × rows 行的梯形格，近大远小。亮格很淡、暗格压深，
 * 这样它是一层「地板」而不是一块白布（不会把上面的棋子吃掉）。
 * 格子亮度随时间和格子位置缓慢呼吸 —— 大块不透明的面必须自己会动。
 *
 * 登记：**免登记**（全屏背景，见 tools/registry-audit.js 的 NO_REG）。
 */
/** 透视棋盘的几何参数（画地板、算棋子落点必须用同一份，否则棋子会踩不准格子） */
export const CHESS = {
  cx: 960,
  farY: 648,
  nearY: 1092,
  farW: 1400,
  nearW: 2000,
  cols: 8,
  rows: 6,
};

/**
 * 透视棋盘上 (col,row) 格的中心 → 画面坐标。
 * col/row 允许小数（走子途中的插值位置就靠它）。
 */
export function chessFloorPos(col, row, opt = {}) {
  const o = { ...CHESS, ...opt };
  const u = (col + 0.5) / o.cols;
  const t = (row + 0.5) / o.rows;
  const y = o.farY + (o.nearY - o.farY) * t;
  const half = (o.farW + (o.nearW - o.farW) * t) / 2;
  return { x: o.cx + (u * 2 - 1) * half, y };
}

export function chessFloor(ctx, s, opt = {}) {
  const o = { ...CHESS, ...opt };
  const { reveal = 1, pulse = 0, light = "#dfe3e8", dark = "#070a10" } = opt;
  const k = Math.max(0, Math.min(1, reveal));
  if (k <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= k;
  const yLerp = (t) => o.farY + (o.nearY - o.farY) * t;
  const wLerp = (t) => o.farW + (o.nearW - o.farW) * t;
  for (let r = 0; r < o.rows; r++) {
    const t0 = r / o.rows;
    const t1 = (r + 1) / o.rows;
    const y0 = yLerp(t0);
    const y1 = yLerp(t1);
    const h0 = wLerp(t0) / 2;
    const h1 = wLerp(t1) / 2;
    for (let c = 0; c < o.cols; c++) {
      const u0 = c / o.cols;
      const u1 = (c + 1) / o.cols;
      const isLight = (r + c) % 2 === 0;
      // 呼吸：格子自己在慢慢变亮变暗（地板不许是死面）；pulse 是卡拍的那一下
      const br = (0.8 + 0.2 * s.noise(c * 3.1 + r * 5.7 + s.ms * 0.0004, 86)) * (1 + 0.55 * pulse);
      ctx.fillStyle = isLight ? rgba(light, 0.12 * br) : rgba(dark, 0.62 * br);
      ctx.beginPath();
      ctx.moveTo(o.cx + (u0 * 2 - 1) * h0, y0);
      ctx.lineTo(o.cx + (u1 * 2 - 1) * h0, y0);
      ctx.lineTo(o.cx + (u1 * 2 - 1) * h1, y1);
      ctx.lineTo(o.cx + (u0 * 2 - 1) * h1, y1);
      ctx.closePath();
      ctx.fill();
    }
  }
  // 透视线：横向每行、纵向每列（一格一条，压在格子上）
  ctx.strokeStyle = rgba(UI.line, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 0; r <= o.rows; r++) {
    const t = r / o.rows;
    const y = yLerp(t);
    const h = wLerp(t) / 2;
    ctx.moveTo(o.cx - h, y);
    ctx.lineTo(o.cx + h, y);
  }
  for (let c = 0; c <= o.cols; c++) {
    const u = (c / o.cols) * 2 - 1;
    ctx.moveTo(o.cx + u * (wLerp(0) / 2), yLerp(0));
    ctx.lineTo(o.cx + u * (wLerp(1) / 2), yLerp(1));
  }
  ctx.stroke();
  ctx.restore();
}

/** 竖排大字（参考片那种巨型竖排 SYSTEM RECOVERY） */
export function verticalText(ctx, s, x, y, text, size, opt = {}) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'verticalText', x, y - size, null, null, text);
  const { step = null, alpha = 0.2, hex = null, weight = 700 } = opt;
  ctx.save();
  ctx.font = s.mono(size, weight);
  ctx.fillStyle = rgba(hex ?? UI.text, alpha);
  const dy = step ?? size * 1.02;
  for (let i = 0; i < text.length; i++) ctx.fillText(text[i], x, y + i * dy);
  ctx.restore();
  return y + text.length * dy;
}

/** 红色告警整屏（参考片那种红）—— 铺满全屏，所以它必须自己会动 */
export function redAlarm(ctx, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = UI.red;
  ctx.fillRect(0, 0, s.W, s.H);
  // 全屏色块是最容易「一整片静止」的地方：叠一层随拍起伏的暗纹
  const bp = s.beat - Math.floor(s.beat);
  const pulse = 0.10 + 0.14 * (1 - bp);
  ctx.fillStyle = `rgba(0,0,0,${pulse.toFixed(3)})`;
  for (let y = 0; y < s.H; y += 6) ctx.fillRect(0, y, s.W, 2);
  // 一层慢慢转的径向暗角，让整块红一直在变
  const cr = 0.5 + 0.5 * Math.sin(s.ms / 1300);
  const g = ctx.createRadialGradient(
    s.W * (0.3 + 0.4 * cr), s.H * 0.5, 80,
    s.W * 0.5, s.H * 0.5, s.W * 0.7,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.restore();
}

/** 代码双关注释（沿用第一版的装置，复刻版也保留：它是"系统"的语气） */
export function pun(ctx, s, x, y, text, size = 18, alpha = 0.55) {
  // 运行时登记（检查器用；s.__reg 不存在时零开销）
  reg(s, 'pun', x, y - size, null, null, text);
  ctx.save();
  ctx.font = s.mono(size);
  ctx.fillStyle = rgba(UI.dim, alpha);
  ctx.fillText(`// ${text}`, x, y);
  ctx.restore();
}

export { rgba, clamp01, lerp, easeOutCubic };