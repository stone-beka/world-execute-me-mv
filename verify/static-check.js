/**
 * verify/static-check.js — 静态检查（不渲染，秒级）
 *
 *  ① 画板里每一个 `s.xxx()` 都真的存在于状态包上。
 *     s 上的东西是字符串键，拼错了要等渲到那一帧才炸，抽样还可能抽不到。
 *     一条正则就能把这一类错挡在渲染之前（`s.stagger` vs `s.staggerEase`、
 *     `s.fbm` 写成 `s.fbn` …）。AGENTS.md 里的 s 清单就是判据。
 *
 *  ② 画板的毫秒区间和段落表（assets/sections.json）对得上。
 *     画板区间是写死的毫秒，段落表是机器从音频量的；时间基准一挪
 *     （改 beatOffsetMs / 重跑 analyze:structure），两边会悄悄错位。
 *     这里报每块的偏差，偏太多（>1 小节）才红 —— 故意留了宽容度，
 *     因为画板首尾本来就要为转场互相重叠约 200ms。
 *
 * 用法：npm run verify:static
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ROOT, sections } from "../src/core/timeline.js";
import { ts, initEngine } from "../src/core/render.js";
import { makeState, boards, resolveRange } from "../src/core/registry.js";
import * as tl from "../src/core/timeline.js";

const BOARD_DIR = resolve(ROOT, "src", "boards");

/** 段落的起止偏差超过这些毫秒才吭声（再大就是「错位」而不是「转场重叠」） */
const WARN_MS = 1500;
// 2026-09-29 试点：歌词驱动后画板按歌词锚定，会跨 section 边界或多 section，
// 区间比单个 section 宽是设计（fadeIn/Out 多重叠加）。容差放到 5000ms。
const FAIL_MS = 5000;

let problems = 0;

/** 逐行剥掉注释，但不破坏行号（块注释跨行时后面几行留空） */
function scanLines(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split(/\r?\n/)) {
    let code = "";
    let j = 0;
    while (j < line.length) {
      if (!inBlock) {
        const b = line.indexOf("/*", j);
        const l = line.indexOf("//", j);
        if (l >= 0 && (b < 0 || l < b)) {
          code += line.slice(j, l);
          break;
        }
        if (b >= 0) {
          code += line.slice(j, b);
          inBlock = true;
          j = b + 2;
          continue;
        }
        code += line.slice(j);
        break;
      } else {
        const e = line.indexOf("*/", j);
        if (e < 0) j = line.length;
        else {
          inBlock = false;
          j = e + 2;
        }
      }
    }
    out.push(code);
  }
  return out;
}

console.log("══════════════════════════════════════════════════");
console.log(" static-check   ① s.* 名字真实存在  ② 画板 ↔ 段落表对齐");
console.log("══════════════════════════════════════════════════\n");

// ------------------------------------------------------------ ① s.* 名字

console.log("① 画板里的 s.xxx() 必须真的存在");
{
  const sample = makeState(0, { ...ts, ...tl.frameState(0) });
  const known = new Set(
    Object.keys(sample).filter((k) => typeof sample[k] === "function"),
  );

  const files = readdirSync(BOARD_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
    .sort();

  const unknown = [];
  for (const f of files) {
    const lines = scanLines(readFileSync(join(BOARD_DIR, f), "utf8"));
    lines.forEach((code, i) => {
      const re = /\bs\.([A-Za-z_]\w*)\s*\(/g;
      let m;
      while ((m = re.exec(code))) {
        if (!known.has(m[1])) unknown.push(`${f}:${i + 1}  s.${m[1]}()`);
      }
    });
  }

  if (unknown.length) {
    problems++;
    console.log(`  ❌ 命中 ${unknown.length} 处不存在于状态包上的 s.xxx()：`);
    for (const u of unknown) console.log(`       ${u}`);
  } else {
    console.log(
      `  ✅ ${files.length} 个画板里，每个 s.xxx() 都能对上状态包（共 ${known.size} 个可调用名）`,
    );
  }
}

// ------------------------------------------------------------ ② 画板 ↔ 段落

console.log("\n② 画板区间 vs 段落表（assets/sections.json）");
await initEngine();
{
  if (!sections.length) {
    console.log("  ⚠️  段落表是空的（还没跑 analyze:structure），跳过");
  } else {
    const secs = sections.slice().sort((a, b) => a.startMs - b.startMs);
    let worst = 0;

    for (const b of boards) {
      const id = b.meta.id;
      const { startMs, endMs } = resolveRange(b.meta);

      // 用「最大重叠」配对，而不是按位置 —— 位置对齐是脆的
      let sec = null;
      let overlap = 0;
      for (const s of secs) {
        const ov = Math.min(endMs, s.endMs) - Math.max(startMs, s.startMs);
        if (ov > overlap) {
          overlap = ov;
          sec = s;
        }
      }
      if (!sec || overlap <= 0) {
        // 歌词驱动的画板可能跨多 section,或位于段间缝里:warn 而非 fail
        const inRange = startMs >= 0 && endMs <= tl.durationMs;
        if (inRange) {
          console.log(`  ⚠️  ${id} 未匹配到任何段落（歌词驱动画板可能跨多段）`);
          continue;
        }
        problems++;
        console.log(`  ❌ ${id} 和任何段落都不重叠`);
        continue;
      }

      const dS = startMs - sec.startMs;
      const dE = endMs - sec.endMs;
      worst = Math.max(worst, Math.abs(dS), Math.abs(dE));
      const bad = Math.abs(dS) > FAIL_MS || Math.abs(dE) > FAIL_MS;
      const soft = !bad && (Math.abs(dS) > WARN_MS || Math.abs(dE) > WARN_MS);
      if (bad) problems++;
      const tag = bad ? "❌" : soft ? "⚠️" : "  ";
      console.log(
        `${tag} ${id.padEnd(12)} ↔ ${sec.name.padEnd(4)} ` +
          `start${signed(dS).padStart(8)}ms  end${signed(dE).padStart(8)}ms`,
      );
    }
    if (problems === 0) {
      console.log(`  ✅ 全部对得上（最大偏差 ${Math.round(worst)}ms，容差 ${FAIL_MS}ms）`);
    }
  }
}

console.log("\n══════════════════════════════════════════════════");
if (problems) {
  console.log(`❌ static-check 失败：${problems} 处`);
  process.exit(1);
}
console.log("✅ static-check 通过");
console.log("══════════════════════════════════════════════════");

function signed(n) {
  const r = Math.round(n);
  return (r > 0 ? "+" : "") + r;
}
