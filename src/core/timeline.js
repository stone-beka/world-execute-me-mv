/**
 * timeline.js — 时间轴
 *
 * 全片只有一个时间真相源：config/project.json。
 * 画板一律通过这里换算，禁止自己写 60000 / bpm。
 *
 * 三个坐标系，互相可逆：
 *   frame  帧号，整数，[0, totalFrames)
 *   ms     音频毫秒
 *   beat   拍号，浮点。beat 0 = beatOffsetMs 处
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..", "..");

export const config = JSON.parse(
  readFileSync(resolve(ROOT, "config", "project.json"), "utf8"),
);

export const { fps, width, height, bpm, beatsPerBar, seed, colors } = config;

export const MS_PER_BEAT = 60000 / bpm;
export const MS_PER_FRAME = 1000 / fps;

/** 音频里第 1 拍的位置。null 表示还没对齐，先按 0 跑 */
export const beatOffsetMs = config.beatOffsetMs ?? 0;

/**
 * 全片总时长。优先用实测音频时长（tools/probe-audio.js 写回 config），
 * 否则退回 onBeat 对齐后手动指定。
 */
export function resolveDurationMs() {
  if (config.durationMs) return config.durationMs;
  const onsetsPath = resolve(ROOT, "assets", "onsets.json");
  try {
    const o = JSON.parse(readFileSync(onsetsPath, "utf8"));
    if (o.durationMs) return o.durationMs;
  } catch {
    /* 还没解析过 onsets，用默认 */
  }
  return 212000; // 3:32 兜底
}

export const durationMs = resolveDurationMs();
export const totalFrames = Math.ceil(durationMs / MS_PER_FRAME);

/**
 * 音频 onset 表（tools/onset-detect.js 生成，只读数据）。
 * 画板通过 s.onsets / s.hit() / s.onsetsIn() 用它做「鼓一响」的反应。
 * 文件不存在时是空表——卡拍退回网格，不会炸。
 */
export const onsets = loadOnsets();

function loadOnsets() {
  try {
    const o = JSON.parse(readFileSync(resolve(ROOT, "assets", "onsets.json"), "utf8"));
    return (o.onsets ?? [])
      .filter((e) => Number.isFinite(e?.ms))
      .map((e) => ({ ms: e.ms, strength: e.strength ?? 1 }));
  } catch {
    return [];
  }
}

/**
 * 段落表（tools/analyze-structure.js 的候选，人耳确认后改 name）。
 * 画板可以按段落写：s.section.name === "chorus1"、s.section.startBar。
 * 文件不存在时是空表，s.section 为 null —— 不会炸。
 */
export const sections = loadSections();

function loadSections() {
  try {
    const o = JSON.parse(readFileSync(resolve(ROOT, "assets", "sections.json"), "utf8"));
    return (o.sections ?? []).filter((s) => Number.isFinite(s?.startMs) && Number.isFinite(s?.endMs));
  } catch {
    return [];
  }
}

/** 当前时刻落在哪一段（没表或落在缝里返回 null） */
export function sectionAt(ms) {
  for (const s of sections) if (ms >= s.startMs && ms < s.endMs) return s;
  return null;
}

// ------------------------------------------------------------ 换算

export const frameToMs = (f) => f * MS_PER_FRAME;
export const msToFrame = (ms) => ms / MS_PER_FRAME;
export const msToBeat = (ms) => (ms - beatOffsetMs) / MS_PER_BEAT;
export const beatToMs = (b) => beatOffsetMs + b * MS_PER_BEAT;
export const frameToBeat = (f) => msToBeat(frameToMs(f));
export const beatToFrame = (b) => msToFrame(beatToMs(b));

/**
 * 小节对齐：4 拍里第几拍是「1」（0-3）。
 * 我们的网格只知道"每 461.5ms 一拍"，不知道这 4 拍里哪拍是小节头 ——
 * 这首歌鼓是四踩，机器分不出，只能人耳定。null = 还没定，先按 0 算。
 * 定法：npm run beat:check -- --bars 听 bar1..bar4 哪个重音像乐句开头。
 */
export const barPhaseBeats = config.barPhase ?? 0;

export const msToBar = (ms) => (msToBeat(ms) - barPhaseBeats) / beatsPerBar;

/** 当前帧在所在拍内的进度 [0,1)。卡拍闪烁全靠它 */
export function beatPhase(ms) {
  const b = msToBeat(ms);
  return b - Math.floor(b);
}

/** 当前帧在所在小节内的进度 [0,1) */
export function barPhase(ms) {
  const bar = msToBar(ms);
  return bar - Math.floor(bar);
}

/**
 * 把 ms 吸附到最近的 1/div 拍网格上。
 * div=4 → 十六分音符；div=1 → 整拍；div=2 → 八分。
 * 用网格而不是「第 N 个 onset」来排画面，这样音乐有摇摆也不会崩。
 */
export function snapToGrid(ms, div = 4) {
  const step = MS_PER_BEAT / div;
  return beatOffsetMs + Math.round((ms - beatOffsetMs) / step) * step;
}

/** 两帧之间是否跨过了某个 1/div 拍网格点（画板做「边沿触发」用） */
export function crossedGrid(msA, msB, div = 1) {
  const step = MS_PER_BEAT / div;
  return (
    Math.floor((msB - beatOffsetMs) / step) >
    Math.floor((msA - beatOffsetMs) / step)
  );
}

/** 供渲染循环使用的每帧状态包（msOverride 为子帧运动模糊服务，见 render.js） */
export function frameState(frame, msOverride) {
  const ms = msOverride ?? frameToMs(frame);
  const beat = msToBeat(ms);
  const bar = msToBar(ms);
  return {
    frame,
    ms,
    t: ms / 1000, // 秒，写动画时更顺手
    beat,
    bar,
    beatPhase: beat - Math.floor(beat),
    barPhase: bar - Math.floor(bar),
    isLastFrame: frame === totalFrames - 1,
  };
}
