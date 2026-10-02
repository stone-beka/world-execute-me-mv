/**
 * tools/parse-midi.js — 从 MIDI 提取音符卡点
 *
 * 产出：
 *   assets/onsets.js     ESM 模块，默认导出 [[ms, pitch, velocity], ...]
 *   assets/onsets.json   同一份数据的 JSON + 元信息（tempo / 时长 / 统计）
 *
 * 用法：
 *   npm run parse:midi -- "assets/world.execute(me);.mid"
 *   npm run parse:midi -- song.mid --quantize 4 --min-velocity 0.01
 *
 * 注意 velocity 归一化到 [0,1]；ms 是绝对毫秒。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Midi } from "@tonejs/midi";
import { ROOT } from "../src/core/timeline.js";

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    flags[k] = v;
  } else positional.push(argv[i]);
}

const MIN_VELOCITY = Number(flags["min-velocity"] ?? 0);
const QUANTIZE = flags.quantize ? Number(flags.quantize) : null; // 每拍切几份

// ---------------------------------------------------------------- 找文件

function findMidi() {
  if (positional[0]) {
    const p = resolve(ROOT, positional[0]);
    return existsSync(p) ? p : null;
  }
  const dir = resolve(ROOT, "assets");
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => /\.(mid|midi)$/i.test(f));
  return hit ? resolve(dir, hit) : null;
}

const midiPath = findMidi();

if (!midiPath) {
  console.error(
    [
      "❌ 没找到 MIDI 文件。",
      "",
      "   把 .mid 放进 assets/ 再跑一次，或显式指定：",
      `     npm run parse:midi -- "assets/world.execute(me);.mid"`,
      "",
      "   如果你手上没有这首歌的 MIDI（很可能没有），不要硬造。",
      "   改用节拍网格路线：npm run probe:audio → npm run align-beat",
      "   见 README「素材路线」一节。",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`▶ 解析 ${basename(midiPath)}`);

const midi = new Midi(readFileSync(midiPath));

// ---------------------------------------------------------------- 提取音符

/** @type {Array<[number, number, number]>} */
const onsets = [];

for (const track of midi.tracks) {
  for (const note of track.notes) {
    if (note.velocity < MIN_VELOCITY) continue;
    onsets.push([Math.round(note.time * 1000), note.midi, Number(note.velocity.toFixed(4))]);
  }
}

onsets.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

// ---------------------------------------------------------------- Tempo / 时长

const firstTempo = midi.header.tempos[0];
const bpm = firstTempo ? Math.round(firstTempo.bpm * 100) / 100 : null;
const tempoCount = midi.header.tempos.length;

const lastMs = Math.round(midi.duration * 1000);

// ---------------------------------------------------------------- 网格对齐

let grid = null;
if (QUANTIZE && bpm) {
  const offsetMs = firstTempo ? Math.round(firstTempo.time * 1000) : 0;
  const step = 60000 / bpm / QUANTIZE;
  const slots = new Set();
  for (const [ms] of onsets) {
    slots.add(Math.round((ms - offsetMs) / step) * step + offsetMs);
  }
  grid = {
    bpm,
    offsetMs,
    div: QUANTIZE,
    stepMs: Math.round(step * 1000) / 1000,
    slotCount: slots.size,
    slots: [...slots].sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------- 写出

mkdirSync(resolve(ROOT, "assets"), { recursive: true });

const meta = {
  source: basename(midiPath),
  bpm,
  tempoChanges: tempoCount,
  durationMs: lastMs,
  noteCount: onsets.length,
  pitchRange: onsets.length
    ? [Math.min(...onsets.map((o) => o[1])), Math.max(...onsets.map((o) => o[1]))]
    : null,
  grid,
  generatedAt: "STATIC", // 刻意不写时间戳：产物必须可复现，diff 才干净
};

writeFileSync(
  resolve(ROOT, "assets", "onsets.json"),
  JSON.stringify({ ...meta, onsets }, null, 0),
);

writeFileSync(
  resolve(ROOT, "assets", "onsets.js"),
  `// 由 tools/parse-midi.js 生成，不要手改。
// 格式：[ms, pitch, velocity]，按 ms 升序。
export const meta = ${JSON.stringify(meta, null, 2)};

export default ${JSON.stringify(onsets)};
`,
);

console.log(`✅ assets/onsets.js   音符 ${onsets.length} 个`);
console.log(`   BPM ${bpm ?? "?"}   tempo 变更 ${tempoCount} 处   时长 ${(lastMs / 1000).toFixed(2)}s`);
if (grid) console.log(`   网格：1/${QUANTIZE} 拍 → ${grid.slotCount} 个格子`);

// ---------------------------------------------------------------- 对拍提醒

const cfgBpm = JSON.parse(readFileSync(resolve(ROOT, "config", "project.json"), "utf8")).bpm;
if (bpm && Math.abs(bpm - cfgBpm) > 0.5) {
  console.warn(
    `\n⚠️  MIDI 的 BPM (${bpm}) 和 config/project.json 的 bpm (${cfgBpm}) 对不上。` +
      `\n    两首歌/两个版本的节奏可能不一样，先确认用哪一版再改 config。`,
  );
}
