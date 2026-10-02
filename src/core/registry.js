/**
 * registry.js — 画板注册表
 *
 * 一块画板 = 一个时间段 + 一个纯绘制函数。
 *
 * 画板规则（review 时按这几条卡）：
 *   1. 必须导出 meta：{ id, startMs, endMs, z?, tags? }
 *      start/end 允许是函数 (ctxState) => ms，用于跟随上一块的结尾。
 *   2. 必须导出 draw(ctx, s)，其中 s 由引擎注入，含：
 *        s.frame s.ms s.t s.beat s.bar s.beatPhase  —— 时间
 *        s.env   —— 已算好的淡入淡出值 0..1
 *        s.rnd(k) s.range(a,b,k) s.pick(arr,k)     —— 确定性随机（已绑 seed）
 *        s.noise(x,ch) s.fbm(x,oct,ch)             —— 平滑噪声
 *        s.colors                                  —— 调色板
 *        s.W s.H                                  —— 画布尺寸
 *      动效原语（见 motion.js）：
 *        s.keys(ms, [[ms,v,ease],...])             —— 关键帧
 *        s.stagger(i, stepMs) / s.staggerEase(...) —— 错峰（依次亮）
 *        s.echo({count,decay,...})                 —— 拖尾/回声步进表
 *        s.shift(dtMs)                             —— 把状态挪到 dtMs 之前（拖尾用）
 *        s.snap(ms, div) s.crossed(msA, msB, div)  —— 网格吸附 / 是否跨过网格点
 *        s.decay(dtMs, halfLifeMs)                 —— 衰减
 *      音频反应（数据来自 assets/onsets.json）：
 *        s.onsets            —— [{ms, strength}] 只读
 *        s.hit(halfLifeMs, lookbackMs)             —— 「鼓一响」的余晖 0..1+
 *        s.onsetsIn(msA, msB)                      —— 区间内的 onset 列表
 *      段落（数据来自 assets/sections.json，候选待确认）：
 *        s.section           —— 当前所在段落 {name,startMs,endMs,startBar,…} 或 null
 *        s.sections          —— 全部段落
 *      歌词（数据来自 assets/lyrics.json，由 tools/align-lyrics.js 生成）：
 *        s.lyrics.get("…")   —— 按内容找句子（找不到会大声报错，别静默失败）
 *        s.lyrics.wordProgress(word, ms)   —— 0..1 唱到哪了
 *        s.line s.word       —— 当前句 / 当前词（空表时为 null）
 *   3. 禁止读写全局可变状态。要传数据就用 meta.data 或 config。
 *   4. 禁止 ctx.filter = 'blur(...)' 之外的重型滤镜（慢且各平台不一致）；辉光用叠加画。
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, onsets, sections, sectionAt, snapToGrid, crossedGrid } from "./timeline.js";
import { rand01, randRange, randInt, pick, noise1, fbm1, hashU32 } from "./kernel.js";
import { keys, staggerMs, staggerEase, echoSteps, decay, pulses, shiftState } from "./motion.js";
import { mono, FONT_MONO } from "./fonts.js";
import { lyrics } from "./lyrics.js";

/** 已注册的画板，按 z 再按 startMs 排序 */
export const boards = [];

const BOARDS_DIR = resolve(ROOT, "src", "boards");

/**
 * 扫描 src/boards/*.js 并加载。
 * 文件名约定 NN-name.js，NN 只影响阅读顺序，实际顺序由 meta.z / startMs 决定。
 */
export async function loadBoards(dir = BOARDS_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
    .sort();

  for (const f of files) {
    const mod = await import(pathToFileURL(resolve(dir, f)).href);
    const meta = mod.meta;
    const draw = mod.draw;
    if (!meta || typeof meta.id !== "string") {
      throw new Error(`画板 ${f} 缺少有效 meta.id`);
    }
    if (typeof draw !== "function") {
      throw new Error(`画板 ${f} (id=${meta.id}) 缺少 draw 函数`);
    }
    if (boards.some((b) => b.meta.id === meta.id)) {
      throw new Error(`画板 id 重复：${meta.id}（${f}）`);
    }
    boards.push({ meta, draw, file: f });
  }

  boards.sort((a, b) => (a.meta.z ?? 0) - (b.meta.z ?? 0) || startOf(a) - startOf(b));
  return boards;
}

function startOf(b) {
  const s = b.meta.startMs;
  return typeof s === "function" ? 0 : s;
}

/** 解析可能为函数的 start/end */
export function resolveRange(meta) {
  const startMs = typeof meta.startMs === "function" ? meta.startMs() : meta.startMs;
  const endMs = typeof meta.endMs === "function" ? meta.endMs() : meta.endMs;
  return { startMs, endMs };
}

/**
 * 找出覆盖当前时间的所有画板，从底到顶。
 * 注意：这里允许重叠——叠加是 MV 的常态。
 */
export function activeBoards(ms) {
  const out = [];
  for (const b of boards) {
    const { startMs, endMs } = resolveRange(b.meta);
    if (ms >= startMs && ms < endMs) out.push({ ...b, startMs, endMs });
  }
  return out;
}

/**
 * 给 draw 用的状态包。所有随机函数都已经把 seed 绑好，
 * 画板拿到的 s.rnd(1,2) 在任意时刻都是同一个值。
 */
export function makeState(frame, ts) {
  const seed = ts.seed;
  const st = {
    frame: ts.frame,
    ms: ts.ms,
    t: ts.t,
    beat: ts.beat,
    bar: ts.bar,
    beatPhase: ts.beatPhase,
    barPhase: ts.barPhase,
    W: ts.width,
    H: ts.height,
    colors: ts.colors,
    durationMs: ts.durationMs,

    rnd: (...k) => rand01(seed, frame, ...k),
    range: (a, b, ...k) => randRange(seed, a, b, frame, ...k),
    int: (a, b, ...k) => randInt(seed, a, b, frame, ...k),
    pick: (arr, ...k) => pick(seed, arr, frame, ...k),
    // 注意：下面两个用「帧」当噪声坐标，所以噪声在时间上是连续的
    noise: (x, ch = 0) => noise1(seed, x, ch),
    fbm: (x, oct = 3, ch = 0) => fbm1(seed, x, oct, ch),
    hash: (...k) => hashU32(seed, frame, ...k),

    // ---- 动效原语（motion.js 的快捷入口）----
    keys: (ms, points, ease) => keys(ms, points, ease),
    stagger: (i, stepMs) => staggerMs(i, stepMs),
    staggerEase: (elapsedMs, i, stepMs, durMs, ease) =>
      staggerEase(elapsedMs, i, stepMs, durMs, ease),
    echo: (opt) => echoSteps(opt),
    decay: (dtMs, halfLifeMs) => decay(dtMs, halfLifeMs),

    // ---- 字体（assets/fonts/ 里打包的，跨机器一致）----
    // ctx.font = s.mono(16)  /  s.mono(34, 700)
    mono: (px, weight = 400) => mono(px, weight),
    fontName: FONT_MONO,

    // ---- 网格 ----
    snap: (ms, div = 4) => snapToGrid(ms, div),
    crossed: (msA, msB, div = 1) => crossedGrid(msA, msB, div),

    // ---- 音频反应 ----
    onsets,
    hit: (halfLifeMs = 110, lookbackMs = 1200) => pulses(onsets, ts.ms, halfLifeMs, lookbackMs),
    onsetsIn: (msA, msB) => onsets.filter((o) => o.ms >= msA && o.ms < msB),

    // ---- 段落（候选表，见 assets/sections.json）----
    sections,
    section: sectionAt(ts.ms),

    // ---- 歌词（assets/lyrics.json，由 tools/align-lyrics.js 生成）----
    // 空表时 s.line/s.word 是 null，画板别假设一定有
    lyrics,
    line: lyrics.lineAt(ts.ms) ?? lyrics.lastLine(ts.ms),
    word: lyrics.wordAt(ts.ms),
  };

  // 拖尾用：把状态挪到 dtMs 之前（时间跟着挪，env / localMs 不挪）
  st.shift = (dtMs) => shiftState(st, dtMs);
  return st;
}
