/**
 * verify/gap-check.js — 全片体检
 *
 * 两层检查，故意的：
 *
 *   ① 结构层（不渲染，全帧扫）
 *      - 每一帧是否至少有 1 块画板覆盖
 *      - 覆盖块的合计设计时长是否连续（有没有「时间轴上没人管」的洞）
 *      - 画板互相重叠但不该重叠的（同 z 同区间 = 可能打架）
 *      → 极快，12720 帧也就零点几秒
 *
 *   ② 渲染层（抽样真渲染）
 *      - 该帧渲染是否抛错
 *      - 出来的像素是不是「空帧」（整屏都是背景色 / 全黑）
 *      → 慢，默认每 15 帧抽 1 帧；--every 1 可以全渲染
 *
 * 用法：
 *   npm run verify:gap
 *   node verify/gap-check.js --every 5
 *   node verify/gap-check.js --every 1 --start 3600 --end 5400
 *
 * 退出码非 0 = 有问题，可以直接挂进 CI。
 */

import { createHash } from "node:crypto";
import {
  ts,
  initEngine,
  createSurface,
  renderFrame,
  surfaceToRGBA,
} from "../src/core/render.js";
import { boards, resolveRange } from "../src/core/registry.js";
import { hexToRgb, envelope } from "../src/core/fade.js";

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};

const START = getArg("start", 0);
const END = getArg("end", ts.totalFrames - 1);
const EVERY = getArg("every", 15);
// 静止段默认只报 warn（先让人看见，不阻塞出片）；--strict-motion 才让它失败
const STRICT_MOTION = argv.includes("--strict-motion");
// --floor 强制开常驻「地板」，--no-floor 强制关；都不给就用 config.floor
const FLOOR = argv.includes("--floor") ? true : argv.includes("--no-floor") ? false : undefined;
/**
 * 「在动」的判据：平均每像素变化幅度。逐像素看 |Δ| 的平均值。
 * 为什么不用「有没有像素不同」：常驻「地板」只贡献 alpha 0.03 的微光，
 * 它会让每一帧都「不同」，于是任何静止都能蒙混过关。这里要求**幅度**够大。
 * 0.6/255 ≈ 0.24% —— 地板（约 0.1）过不了，真正的画面运动（约 1~20）轻松过。
 */
const MOTION_MIN = getArg("motion", 0.6);

await initEngine();

console.log("══════════════════════════════════════════════════");
console.log(` gap-check   ${ts.width}x${ts.height} @${ts.fps}fps`);
console.log(` 帧范围 ${START}..${END}  (${END - START + 1} 帧 / ${((END - START + 1) / ts.fps).toFixed(1)}s)`);
console.log(` 画板 ${boards.length} 块`);
console.log("══════════════════════════════════════════════════\n");

const ranges = boards.map((b) => ({
  id: b.meta.id,
  z: b.meta.z ?? 0,
  ...resolveRange(b.meta),
}));
for (const r of ranges) {
  console.log(
    `  · ${r.id.padEnd(24)} ${(r.startMs / 1000).toFixed(2).padStart(8)}s → ` +
      `${(r.endMs / 1000).toFixed(2).padStart(8)}s   z=${r.z}`,
  );
}
console.log("");

let problems = 0;

// ------------------------------------------------------------ ① 结构层

console.log("① 结构层：覆盖连续性");
const uncovered = [];
for (let f = START; f <= END; f++) {
  const ms = (f * 1000) / ts.fps;
  const covered = ranges.some((r) => ms >= r.startMs && ms < r.endMs);
  if (!covered) uncovered.push(f);
}

/**
 * 空洞要分性质，不然这个工具在「片尾还没做」的早期会天天误报，
 * 报久了就没人看了，这才是真正危险的。
 *   head/tail  = 已实现区段之外的延伸 → 还没做，⚠️ 提示，不失败
 *   interior   = 已实现区段之间被夹出来的洞 → 回归，❌ 失败
 */
const firstStart = Math.min(...ranges.map((r) => r.startMs));
const lastEnd = Math.max(...ranges.map((r) => r.endMs));

const headTail = [];
const interior = [];
for (const [a, b] of toRuns(uncovered, ts.fps)) {
  const msA = (a * 1000) / ts.fps;
  const msB = (b * 1000) / ts.fps;
  if (msB <= firstStart || msA >= lastEnd) headTail.push([a, b]);
  else interior.push([a, b]);
}

if (interior.length) {
  problems++;
  console.log(`  ❌ ${interior.length} 处真空洞（夹在已实现区段之间，属于回归）：`);
  for (const [a, b] of interior) {
    console.log(`       ${fmtMs(a)} → ${fmtMs(b)}   共 ${b - a + 1} 帧   (frame ${a}..${b})`);
  }
} else {
  console.log("  ✅ 已实现区段内部没有空洞");
}

if (headTail.length) {
  const n = headTail.reduce((s, [a, b]) => s + (b - a + 1), 0);
  console.log(`  ⚠️  ${n} 帧落在已实现区段之外（还没开始做，不算错）：`);
  for (const [a, b] of headTail) {
    console.log(`       ${fmtMs(a)} → ${fmtMs(b)}   共 ${b - a + 1} 帧   (frame ${a}..${b})`);
  }
}

// 同 z 同区间重叠 = 可疑
const dupZ = [];
for (let i = 0; i < ranges.length; i++) {
  for (let j = i + 1; j < ranges.length; j++) {
    const a = ranges[i];
    const b = ranges[j];
    if (a.z === b.z && a.startMs < b.endMs && b.startMs < a.endMs) {
      dupZ.push(`${a.id} ↔ ${b.id} (z=${a.z})`);
    }
  }
}
if (dupZ.length) {
  console.log(`  ⚠️  ${dupZ.length} 组同 z 重叠（不是错，但要确认是有意的叠加）：`);
  for (const d of dupZ) console.log(`       ${d}`);
}

console.log("");

// ------------------------------------------------------------ ② 渲染层

console.log(`② 渲染层：抽样真渲染（每 ${EVERY} 帧 1 帧）`);
const surface = createSurface();
const bg = hexToRgb(ts.colors.bg);
const blank = [];
const errors = [];
const sigs = [];
let sampled = 0;
let prevBuf = null;

for (let f = START; f <= END; f += EVERY) {
  sampled++;
  let buf;
  try {
    renderFrame(surface.ctx, f, { floor: FLOOR });
    buf = surfaceToRGBA(surface);
  } catch (e) {
    errors.push({ f, msg: e.message });
    continue;
  }
  if (isBlank(buf, bg)) blank.push(f);
  sigs.push({ f, sig: pixelSig(buf), mean: meanAbsDiff(buf, prevBuf) });
  prevBuf = buf;
}

if (errors.length) {
  problems++;
  console.log(`  ❌ ${errors.length} 帧渲染抛错：`);
  for (const e of errors.slice(0, 10)) console.log(`       frame ${e.f}: ${e.msg}`);
} else {
  console.log(`  ✅ 抽样 ${sampled} 帧全部渲染通过`);
}

if (blank.length) {
  // 淡入的起点 env=0，画面本来就是空的 —— 这是对的，不是 bug。
  // 所以「空帧」只有在「该看得见的时候却是空的」才算问题。
  const coveredMs = (f) => {
    const ms = (f * 1000) / ts.fps;
    return ranges.some((r) => ms >= r.startMs && ms < r.endMs);
  };
  const blankSuspicious = blank.filter((f) => expectedVisible((f * 1000) / ts.fps));
  const blankNoCover = blank.filter((f) => !coveredMs(f));
  const blankFadeEdge = blank.filter(
    (f) => coveredMs(f) && !expectedVisible((f * 1000) / ts.fps),
  );

  if (blankSuspicious.length) {
    problems++;
    console.log(
      `  ❌ ${blankSuspicious.length} 帧「本该可见却全空」（信封 > 0.5 但一个像素都没画）：`,
    );
    console.log(`       ${blankSuspicious.slice(0, 20).join(", ")}`);
  } else {
    console.log("  ✅ 没有「该可见却空」的帧");
  }
  if (blankFadeEdge.length) {
    console.log(
      `  ⚠️  ${blankFadeEdge.length} 帧空帧处于淡入/淡出边缘（env≤0.5），属正常`,
    );
  }
  if (blankNoCover.length) {
    console.log(
      `  ⚠️  ${blankNoCover.length} 帧空帧压根没有画板覆盖（同「还没做」，不算错）`,
    );
  }
} else {
  console.log("  ✅ 无空帧");
}

console.log("");

// ------------------------------------------------------------ ③ 运动层

console.log(`③ 运动层：「在动」= 相邻采样帧平均像素变化 ≥ ${MOTION_MIN}/255（每 ${EVERY} 帧 1 帧）`);
const still = [];
for (let i = 1; i < sigs.length; i++) {
  if (sigs[i].sig === sigs[i - 1].sig || sigs[i].mean < MOTION_MIN) still.push(sigs[i].f);
}
const stillPct = sigs.length > 1 ? (still.length / (sigs.length - 1)) * 100 : 0;
const means = sigs.slice(1).map((x) => x.mean).sort((a, b) => a - b);
const medMean = means.length ? means[means.length >> 1] : 0;
console.log(
  `  采样 ${sigs.length} 帧；「近乎没动」的有 ${still.length} 帧（${stillPct.toFixed(1)}%）` +
    `；每帧平均变化 p50=${medMean.toFixed(2)}  min=${(means[0] ?? 0).toFixed(2)}`,
);

// 把连续相同的帧聚成「静止段」—— 一串相邻的采样帧都没变，才是观众感知到的「卡住」
const stillRuns = [];
for (const f of still) {
  const last = stillRuns[stillRuns.length - 1];
  if (last && f - last.end <= EVERY * 1.5) last.end = f;
  else stillRuns.push({ start: f, end: f });
}
const DEAD_FRAMES = Math.round(0.6 * ts.fps);
const dead = stillRuns.filter((r) => r.end - r.start >= DEAD_FRAMES);
if (dead.length) {
  const label = STRICT_MOTION ? "❌" : "⚠️";
  console.log(`  ${label} ${dead.length} 段静止 ≥0.6s（画了但没动）：`);
  for (const r of dead) {
    console.log(
      `       ${fmtMs(r.start)} → ${fmtMs(r.end)}   共 ${((r.end - r.start) / ts.fps).toFixed(2)}s`,
    );
  }
  if (STRICT_MOTION) problems++;
  else console.log("       （加 --strict-motion 可让这条失败）");
} else if (sigs.length) {
  console.log("  ✅ 没有 ≥0.6s 的静止段");
}

console.log("");
console.log("══════════════════════════════════════════════════");
if (problems) {
  console.log(`❌ gap-check 失败：${problems} 类问题`);
  process.exit(1);
}
console.log("✅ gap-check 通过");
console.log("══════════════════════════════════════════════════");

// ------------------------------------------------------------ helpers

function fmtMs(frame) {
  return `${((frame * 1000) / ts.fps / 1000).toFixed(2)}s`;
}

function toRuns(frames, fps) {
  const runs = [];
  // 空数组要返回空 —— 否则会推出一对 [undefined, undefined]，
  // 被后面的分类逻辑误判成"一个 NaN 空洞"（全片覆盖完整时就会踩到）
  if (!frames || frames.length === 0) return runs;
  let a = frames[0];
  let prev = frames[0];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] === prev + 1) {
      prev = frames[i];
      continue;
    }
    runs.push([a, prev]);
    a = frames[i];
    prev = frames[i];
  }
  runs.push([a, prev]);
  return runs;
}

/**
 * 画面指纹：逐像素取 R 通道（够快），任何 ≥1px 的明暗变化都能看出来，
 * 用来判「这一帧和上一采样帧是不是同一幅静止画面」。
 * （只取 R：纯绿/纯蓝通道的微小变化会漏，但对「有没有在动」无影响。）
 */
function pixelSig(buf) {
  let h1 = 2166136261 >>> 0;
  let h2 = 5381 >>> 0;
  for (let i = 0; i < buf.length; i += 4) {
    const v = buf[i];
    h1 = Math.imul(h1 ^ v, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) + v) >>> 0;
  }
  return h1.toString(16) + ":" + h2.toString(16);
}

/**
 * 平均每像素变化幅度（只取 R 通道，够快、够用）。
 * 和「指纹是否相同」互补：指纹判「完全一样」，这个判「差别够不够大」。
 */
function meanAbsDiff(buf, prev) {
  if (!prev) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < buf.length; i += 4) {
    sum += Math.abs(buf[i] - prev[i]);
    n++;
  }
  return sum / n;
}

/** 抽样判定「空帧」：容忍零星抗锯齿，>99.5% 像素等于底色就算空 */function isBlank(buf, bg) {
  const need = 0.005;
  let diff = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] !== bg[0] || buf[i + 1] !== bg[1] || buf[i + 2] !== bg[2]) {
      diff++;
      if (diff / (buf.length / 4) > need) return false;
    }
  }
  return true;
}

/** 该时刻是否「本该看得见」：有画板覆盖且其信封已过半 */
function expectedVisible(ms) {
  for (const b of boards) {
    const { startMs, endMs } = resolveRange(b.meta);
    if (ms >= startMs && ms < endMs) {
      if (envelope(ms, startMs, endMs, b.meta.fade ?? {}) > 0.5) return true;
    }
  }
  return false;
}
