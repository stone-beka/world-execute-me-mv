/**
 * tools/onset-detect.js — 从音频提取 onset（B 路线的卡点来源）
 *
 * 有 MIDI 走 A 路线（tools/parse-midi.js）；这首歌没有，就用音频自己找重音。
 * 产出和 parse-midi.js 对齐，画板不用关心数据来自哪条路线：
 *   assets/onsets.js     ESM 模块，默认导出 [[ms, strength], ...]
 *   assets/onsets.json   同一份数据 + 元信息（bpm / 时长 / 网格校验）
 *
 * 顺带用 config 里的网格校验这些 onset：命中率、残差中位数、漂移。
 * 网格不准先在 tools/beat-check.js 里用人耳校准，再回来跑这个。
 *
 * 用法：
 *   npm run detect:onsets
 *   node tools/onset-detect.js --file assets/audio/xxx.wav --k 2.0 --tol 25
 *   node tools/onset-detect.js --no-write      # 只看统计，不落盘
 *
 * 注意：onset 是音频里的真实击打，带 strength 但没有音高；MIDI 路线才是 [ms,pitch,velocity]。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { ROOT, config } from "../src/core/timeline.js";
import { onsetEnvelopes, pickOnsets } from "./lib/onsets.js";
import { residualStats, windowPhases } from "./lib/grid.js";

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(`--${n}`);

const K = getArg("k", 2.0);
const MIN_GAP = getArg("min-gap", 30);
const TOL = getArg("tol", 25);
const WRITE = !has("no-write");

// ---------------------------------------------------------------- 找 WAV

function findWav() {
  const explicit = getStr("file", null);
  if (explicit) {
    const p = resolve(ROOT, explicit);
    if (!existsSync(p)) {
      console.error(`❌ 找不到 ${p}`);
      process.exit(1);
    }
    return p;
  }
  const dir = resolve(ROOT, "assets", "audio");
  if (existsSync(dir)) {
    const hit = readdirSync(dir).find((f) => /\.wav$/i.test(f) && !f.startsWith("_"));
    if (hit) return resolve(dir, hit);
  }
  return null;
}

const wavPath = findWav();
if (!wavPath) {
  console.error("❌ assets/audio/ 里没有 WAV。先抽音频，或 --file 指定。");
  process.exit(1);
}

console.log(`▶ onset 检测：${basename(wavPath)}`);

const { onset, srFrames, hopMs, durationMs } = onsetEnvelopes(wavPath);
const onsets = pickOnsets(onset, srFrames, { k: K, minGapMs: MIN_GAP });

console.log(`   包络步长 ${hopMs}ms   阈值 k=${K}×MAD   最短间隔 ${MIN_GAP}ms`);
console.log(`   检出 onset ${onsets.length} 个   （约 ${(onsets.length / (durationMs / 1000)).toFixed(1)} 个/秒）`);

// ---------------------------------------------------------------- 网格校验

const periodMs = 60000 / config.bpm;
const beatOffsetMs = config.beatOffsetMs ?? 0;
const stats = residualStats(onsets, beatOffsetMs, periodMs, TOL);
const drift = windowPhases(onsets, beatOffsetMs, periodMs, 0, durationMs, 4);

console.log("");
console.log("① 对 config 网格（BPM " + config.bpm + ", offset " + beatOffsetMs.toFixed(1) + "ms）");
console.log(`   残差中位数   ${stats.medianAbs}ms   p90 ${stats.p90Abs}ms   最大 ${stats.maxAbs}ms`);
console.log(`   落在 ±${TOL}ms   ${stats.withinTol}/${stats.count}  (${stats.pctWithinTol}%)   ← 仅供参考`);
console.log("   （密集曲目里切分音/旋律/人声都是「不在拍上」的 onset，这份数天然偏低；");
console.log("     判网格准不准看下面各段相位是否一致，不看这个百分比）");

console.log("");
console.log("② 分段漂移（相位应各段一致）");
for (const w of drift) {
  const sec = (w.startMs / 1000).toFixed(0);
  console.log(
    `   ${sec.padStart(4)}s 起  n=${String(w.count).padStart(4)}  ` +
      `相位 ${String(w.phaseMs.toFixed(1)).padStart(6)}ms  集中度 ${w.concentration.toFixed(3)}`,
  );
}
const phaseSpread = Math.max(...drift.map((w) => w.phaseMs)) - Math.min(...drift.map((w) => w.phaseMs));
if (phaseSpread < 20) {
  console.log(`   ✅ 各段相位差 ${phaseSpread.toFixed(1)}ms，全局网格站得住`);
} else {
  console.log(`   ⚠️  各段相位差 ${phaseSpread.toFixed(1)}ms，可能有速度漂移；跑 align-beat 复核`);
}

// ---------------------------------------------------------------- 落盘

const meta = {
  source: basename(wavPath),
  mode: "audio",
  fields: ["ms", "strength"],
  bpm: config.bpm,
  beatOffsetMs: Number(beatOffsetMs.toFixed(2)),
  durationMs: Math.round(durationMs),
  onsetCount: onsets.length,
  pickK: K,
  minGapMs: MIN_GAP,
  gridCheck: { ...stats, drift },
  generatedAt: "STATIC", // 刻意不写时间戳：产物必须可复现，diff 才干净
};

if (WRITE) {
  mkdirSync(resolve(ROOT, "assets"), { recursive: true });
  writeFileSync(resolve(ROOT, "assets", "onsets.json"), JSON.stringify({ ...meta, onsets }, null, 0));
  writeFileSync(
    resolve(ROOT, "assets", "onsets.js"),
    `// 由 tools/onset-detect.js 生成，不要手改（B 路线：音频 onset）。
// 格式：[ms, strength]，按 ms 升序。没有音高——要音高请走 parse-midi（A 路线）。
export const meta = ${JSON.stringify(meta, null, 2)};

export default ${JSON.stringify(onsets.map((o) => [o.ms, o.strength]))};
`,
  );
  console.log("");
  console.log("✅ assets/onsets.js / assets/onsets.json 已写出");
} else {
  console.log("");
  console.log("（--no-write：只看统计，未落盘）");
}
