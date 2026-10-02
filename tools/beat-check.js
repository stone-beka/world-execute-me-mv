/**
 * tools/beat-check.js — 人耳校准拍相位
 *
 * 自动分析定不下这首歌的拍相位（相位糊成一片台地，锐度 1.30），
 * 那就别猜了：把网格做成咔哒声叠在原曲上，你听一遍就知道准不准。
 * 耳朵是最硬的裁判，一次试听顶一百次自相关。
 *
 * 用法：
 *   node tools/beat-check.js                          # 用 probe 拟合的 offset，从 8s 起 16 秒
 *   node tools/beat-check.js --offset 610.7
 *   node tools/beat-check.js --from 20 --dur 20 --offset 380
 *   node tools/beat-check.js --sweep                  # 一次生成 5 个错开相位的版本，直接 A/B
 *
 * 产出 out/beatchk/*.m4a
 */

import { mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, basename } from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

import { ROOT, config } from "../src/core/timeline.js";
import { readWav, writeWavStereo16 } from "./lib/wav.js";
import { rand01 } from "../src/core/kernel.js";

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const has = (n) => argv.includes(`--${n}`);

// ---------------------------------------------------------------- 输入

const audioDir = resolve(ROOT, "assets", "audio");
const wavName = existsSync(audioDir)
  ? readdirSync(audioDir).find((f) => /\.wav$/i.test(f) && !f.startsWith("_"))
  : null;
if (!wavName) {
  console.error("❌ assets/audio/ 里没有 WAV");
  process.exit(1);
}
const wavPath = resolve(audioDir, wavName);

const probePath = resolve(ROOT, "assets", "audio-probe.json");
const probe = existsSync(probePath)
  ? JSON.parse(readFileSync(probePath, "utf8"))
  : {};

const BPM = Number(getArg("bpm", probe.bpm ?? config.bpm));
const PERIOD = 60000 / BPM;
const BASE_OFFSET = getArg("offset", probe.beatOffsetMs ?? config.beatOffsetMs);
const FROM_S = getArg("from", 8);
const DUR_S = getArg("dur", 16);
const SWEEP = has("sweep");

const OUT_DIR = resolve(ROOT, "out", "beatchk");
mkdirSync(OUT_DIR, { recursive: true });

console.log(`▶ ${basename(wavPath)}`);
console.log(`   BPM ${BPM.toFixed(2)}   拍周期 ${PERIOD.toFixed(2)}ms   基准 offset ${BASE_OFFSET.toFixed(1)}ms`);

const { samples, sampleRate } = readWav(wavPath);

// ---------------------------------------------------------------- 咔哒声

/**
 * 咔哒设计：一个高频瞬态 + 短衰减，频段躲开歌曲主体，
 * 保证「听得到但不盖住音乐」。用确定性噪声（kernel 的 rand01），
 * 这样每次生成的咔哒完全一样，A/B 对比才有意义。
 */
function makeClick(sr, freq = 1800, decay = 320, seedKey = 7, lenMs = 12) {
  const len = Math.round(sr * (lenMs / 1000));
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * decay);
    const tone = Math.sin(2 * Math.PI * freq * t);
    const noise = (rand01(seedKey, i) - 0.5) * 0.9;
    buf[i] = (tone * 0.8 + noise * 0.2) * env;
  }
  return buf;
}

// ---------------------------------------------------------------- 混音

/** 把咔哒网格叠到某一段音乐上。sweep / 单发 / 教学 / 小节都对都用它。
 *  @param accent 可选 {beat, per}：每 per 拍里第 beat 拍用重音咔哒（用来试小节开头） */
function renderSegment(offsetMs, fromS, durS, click, accent = null) {
  const i0 = Math.round(fromS * sampleRate);
  const n = Math.round(durS * sampleRate);
  const music = samples.subarray(i0, Math.min(i0 + n, samples.length));

  const mix = Float32Array.from(music);
  const startMs = fromS * 1000;
  const firstK = Math.ceil((startMs - offsetMs) / PERIOD);
  let clickCount = 0;
  let accentCount = 0;

  for (let k = firstK; ; k++) {
    const idx = Math.round((offsetMs + k * PERIOD - startMs) * (sampleRate / 1000));
    if (idx >= mix.length) break;
    if (idx < 0) continue;

    let buf = click;
    let gain = 0.5;
    if (accent) {
      const inBar = ((k % accent.per) + accent.per) % accent.per;
      if (inBar === accent.beat) {
        buf = accent.click;
        gain = 0.72;
        accentCount++;
      }
    }
    for (let j = 0; j < buf.length && idx + j < mix.length; j++) {
      mix[idx + j] += buf[j] * gain;
    }
    clickCount++;
  }
  return { mix, clickCount, accentCount };
}

/** 写一段到 m4a。 */
async function encode(mix, tag) {
  const tmpWav = resolve(OUT_DIR, `_${tag}.wav`);
  writeWavStereo16(tmpWav, mix, sampleRate);
  const outM4a = resolve(OUT_DIR, `${tag}.m4a`);
  await new Promise((res, rej) => {
    const ff = spawn(ffmpegPath, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", tmpWav,
      "-c:a", "aac", "-b:a", "160k",
      outM4a,
    ]);
    ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`))));
  });
  unlinkSync(tmpWav);
  return outM4a;
}

const click = makeClick(sampleRate);
const clickAccent = makeClick(sampleRate, 2700, 400, 11); // 重音：更高更脆

// ------------------------------------------------------------ 小节对齐模式
//
// 机器同样分不出「哪一拍是小节的 1」。四拍一小节 → 只有 4 种可能，
// 那就把 4 种都生成，每种的「1」上打个重音，你挑哪个听起来像开头。
if (has("bars")) {
  const BARS = Number(getArg("per", config.beatsPerBar ?? 4));
  console.log(`▶ 小节对齐：每 ${BARS} 拍一小节，重音在第 N 拍上`);
  console.log(`   ${FROM_S}s 起 ${DUR_S}s   基准 offset ${BASE_OFFSET.toFixed(1)}ms`);
  console.log("");
  for (let beat = 0; beat < BARS; beat++) {
    const { mix, accentCount } = renderSegment(BASE_OFFSET, FROM_S, DUR_S, click, {
      beat,
      per: BARS,
      click: clickAccent,
    });
    const outPath = await encode(mix, `bar${beat + 1}-of-${BARS}`);
    console.log(
      `   ✅ ${basename(outPath)}   第 ${beat + 1} 拍当「1」   ${accentCount} 次重音`,
    );
  }
  console.log("");
  console.log("   重音应该落在「乐句开头」那个感觉上 —— 像鼓手砸下的第一下。");
  console.log("   哪个最像，就回我「bar1」/「bar2」/「bar3」/「bar4」。");
  process.exit(0);
}

// ------------------------------------------------------------ 教学模式
//
// 光说「粘」你听不出来。直接把偏移量排成阶梯，让你亲耳听出区别。
// 四段各 6 秒，偏移依次是：偏早 → 完全对上 → 偏晚 → 差半拍。
if (has("teach")) {
  const SEG = getArg("seg", 6);
  const steps = [
    { off: BASE_OFFSET - 180, note: "偏早 180ms（大约 2/5 拍）—— 应该明显「咔—哒」两声" },
    { off: BASE_OFFSET, note: "★ 完全对上 —— 该听到的是「一个声音」，咔哒像消失了" },
    { off: BASE_OFFSET + 180, note: "偏晚 180ms —— 又是两声，但先后顺序反过来" },
    { off: BASE_OFFSET + PERIOD / 2, note: "差半拍（正反拍）—— 咔哒落在鼓点正中间" },
  ];

  const parts = [];
  for (const s of steps) {
    const { mix } = renderSegment(s.off, FROM_S, SEG, click);
    parts.push(mix);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }

  const outPath = await encode(out, "TEACH-怎么听是粘");
  console.log(`▶ 教学文件：${basename(outPath)}   总长 ${(total / sampleRate).toFixed(1)}s`);
  console.log("");
  for (let i = 0; i < steps.length; i++) {
    console.log(
      `   ${String(i * SEG).padStart(3)}s ~ ${String((i + 1) * SEG).padStart(3)}s   ${steps[i].note}`,
    );
  }
  console.log("");
  console.log("   对照着听第 2 段和第 1/3 段，差别会非常明显。");
  process.exit(0);
}

const offsets = SWEEP
  ? [-2, -1, 0, 1, 2].map((k) => BASE_OFFSET + (k * PERIOD) / 5)
  : [BASE_OFFSET];

for (const off of offsets) {
  const { mix, clickCount } = renderSegment(off, FROM_S, DUR_S, click);

  if (clickCount === 0) {
    console.error(`   ❌ offset ${off.toFixed(1)}ms 一次咔哒都没落上，检查参数`);
    process.exit(1);
  }

  const tag = `${SWEEP ? "sweep-" : ""}off${String(Math.round(off)).padStart(4, "0")}`;
  const outM4a = await encode(mix, tag);

  console.log(
    `   ✅ ${basename(outM4a)}   offset ${off.toFixed(1)}ms   ` +
      `${clickCount} 次咔哒   ${FROM_S}s 起 ${DUR_S}s`,
  );
}

console.log("");
console.log("══════════════════════════════════════════════════");
console.log("怎么听：");
console.log("  · 咔哒应该和鼓点「粘」在一起，像同一件乐器");
console.log("  · 如果咔哒飘在鼓点前面/后面，就是相位偏了");
console.log("  · --sweep 生成的几个版本相差 1/5 拍，");
console.log("    哪个最「粘」，偏移就落在那一档附近");
console.log("");
console.log("听完告诉我：准 / 偏前 / 偏后 / 差半拍，我再调。");
console.log("══════════════════════════════════════════════════");
