/**
 * verify/ink-check.js — 「真的画出来了」，不是「注册了」
 *
 * 为什么要单开一层：覆盖率如果只验证「画板被注册了」，那对一个
 * 「每块画板都在抛异常、什么都没画」的版本也会报 100%。
 * 这个检查不看像素，而是把真 ctx 包一层（见 lib/record-ctx.js），
 * 数每块画板到底往画布上落了几个图元 (ink)，并查 save/restore 配对。
 *
 * 它管三件事：
 *   ① 每块画板在若干进度点上合计要真的落墨（ink > 0）
 *   ② save/restore 必须配对（漏 restore 会污染下一块画板的绘制状态）
 *   ③ meta.fade 存在性 —— 只在没声明时 warn，因为用 hardCut()/envelope()
 *      自己进出也合法（AGENTS.md 允许，但要求「显式」）
 *
 * 用法：
 *   npm run verify:ink
 *   node verify/ink-check.js --verbose     # 逐块列出 ink / calls
 */

import { createSurface, ts, initEngine } from "../src/core/render.js";
import { boards, resolveRange, makeState } from "../src/core/registry.js";
import { envelope } from "../src/core/fade.js";
import * as tl from "../src/core/timeline.js";
import { createRecorder } from "./lib/record-ctx.js";

const VERBOSE = process.argv.includes("--verbose");
const PROGRESS = [0, 0.02, 0.2, 0.45, 0.7, 0.93, 0.999];

await initEngine();

const surface = createSurface();
const rec = createRecorder(surface.ctx);

console.log("══════════════════════════════════════════════════");
console.log(" ink-check   每块画板在 7 个进度点上真的落墨了吗");
console.log("══════════════════════════════════════════════════\n");

let problems = 0;
const rows = [];

for (const b of boards) {
  const id = b.meta.id;
  const { startMs, endMs } = resolveRange(b.meta);

  if (!(endMs > startMs)) {
    problems++;
    console.log(`  ❌ ${id}: 区间非法 ${startMs} → ${endMs}`);
    continue;
  }

  let ink = 0;
  let calls = 0;
  let leftoverDepth = 0;
  let unbalanced = 0;
  let err = null;

  for (const p of PROGRESS) {
    const ms = startMs + p * (endMs - startMs);
    const frame = Math.round(tl.msToFrame(ms));
    const time = tl.frameState(frame, ms);
    const base = makeState(frame, { ...ts, ...time });
    const s = {
      ...base,
      env: envelope(ms, startMs, endMs, b.meta.fade ?? {}),
      local: p,
      localMs: ms - startMs,
      remainMs: endMs - ms,
      startMs,
      endMs,
    };

    rec.reset();
    try {
      b.draw(rec.ctx, s);
    } catch (e) {
      err = e;
    }
    ink += rec.stats.ink;
    calls += rec.stats.calls;
    leftoverDepth = Math.max(leftoverDepth, Math.abs(rec.stats.depth));
    unbalanced += rec.stats.unbalanced;
  }

  const fatal = [];
  if (err) fatal.push(`抛异常：${err.message}`);
  else if (ink === 0) fatal.push("零图元（注册了但什么都没画）");
  if (unbalanced) fatal.push(`restore 多于 save（${unbalanced} 次）`);
  if (leftoverDepth) fatal.push(`漏 restore（画完残留 save 深度 ${leftoverDepth}）`);

  const warn = [];
  if (!b.meta.fade) warn.push("未声明 meta.fade（若用 hardCut/envelope 自行进出则忽略）");

  rows.push({ id, z: b.meta.z ?? 0, ink, calls, fatal, warn });
  problems += fatal.length;
}

// 结果从少到多排：最容易出问题（画得最少）的排前面
rows.sort((a, b) => a.ink - b.ink);
for (const r of rows) {
  const ok = r.fatal.length === 0;
  const tag = ok ? (r.warn.length ? "  ⚠️" : "  ✅") : "  ❌";
  console.log(
    `${tag} ${r.id.padEnd(12)} ink=${String(r.ink).padStart(7)}  calls=${String(r.calls).padStart(7)}  z=${r.z}`,
  );
  if (VERBOSE) continue;
  for (const f of r.fatal) console.log(`       · ${f}`);
  for (const w of r.warn) console.log(`       · ${w}`);
}

const min = rows.length ? Math.min(...rows.map((r) => r.ink)) : 0;
const totalInk = rows.reduce((a, r) => a + r.ink, 0);
console.log(
  `\n  合计 ${rows.length} 块，最低 ink=${min}，平均 ink=${Math.round(totalInk / Math.max(1, rows.length))}`,
);

console.log("\n══════════════════════════════════════════════════");
if (problems) {
  console.log(`❌ ink-check 失败：${problems} 处（有画板没画出来 / 状态没配对）`);
  process.exit(1);
}
console.log("✅ ink-check 通过：每块画板都真的落了墨，save/restore 配对");
console.log("══════════════════════════════════════════════════");
