/**
 * verify/determinism-check.js — 确定性守卫
 *
 * 这个工程的核心承诺是「同 seed + 同帧号 = 同像素」。
 * 一旦有人手滑写了 Math.random() 或者让画板之间通过全局变量串味，
 * 承诺就废了，而且是在渲染了 3 小时之后才会发现。
 * 所以这里提前拦。
 *
 * 三层：
 *   ① 静态扫描   源码里出现禁用 API 直接报错
 *   ② 重复渲染   同一帧渲两次，逐字节比
 *   ③ 乱序渲染   倒着渲 / 跳着渲，结果必须和正着渲一样
 *                （这条专治「画板偷偷依赖上一帧状态」）
 *
 * 用法：
 *   npm run verify:determinism
 *   node verify/determinism-check.js --samples 40
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { ROOT } from "../src/core/timeline.js";
import {
  ts,
  initEngine,
  createSurface,
  renderFrame,
  surfaceToRGBA,
} from "../src/core/render.js";

const argv = process.argv.slice(2);
const getArg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const SAMPLES = getArg("samples", 24);

let problems = 0;

console.log("══════════════════════════════════════════════════");
console.log(" determinism-check");
console.log("══════════════════════════════════════════════════\n");

// ------------------------------------------------------------ ① 静态扫描

console.log("① 静态扫描：禁用 API");

const BANNED = [
  { re: /\bMath\.random\s*\(/, msg: "Math.random() —— 随机只能来自 kernel.js" },
  { re: /\bDate\.now\s*\(/, msg: "Date.now() —— 画面不能依赖真实时间" },
  { re: /\bperformance\.now\s*\(/, msg: "performance.now() —— 画面不能依赖真实时间" },
  { re: /new\s+Date\s*\(/, msg: "new Date() —— 同上" },
  { re: /\brequestAnimationFrame\b/, msg: "requestAnimationFrame —— 这是逐帧离线渲染，不是实时循环" },
];

/**
 * 豁免名单：必须写清楚「为什么这里可以有」。
 * 原则：只要这个值有可能流进像素，就不许豁免。
 */
const ALLOW = [
  {
    file: "tools/smoke.js",
    api: /Date\.now\s*\(/,
    reason: "只用于打印渲完耗时，不进画面",
  },
  {
    file: "tools/preview.js",
    api: /Date\.now\s*\(/,
    reason: "只用于打印预览耗时，不进画面",
  },
  {
    file: "tools/render-frames.js",
    api: /Date\.now\s*\(/,
    reason: "只用于打印全片渲染耗时，不进画面",
  },
  {
    file: "tools/lib/progress.js",
    api: /Date\.now\s*\(/,
    reason: "只用于渲染进度条的速率/剩余时间估算，不进画面",
  },
  {
    file: "tools/watch-render.js",
    api: /Date\.now\s*\(/,
    reason: "只用于「渲染进度看板」的速率/已用/剩余时间估算，不进画面",
  },
  {
    file: "tools/scene.js",
    api: /Date\.now\s*\(/,
    reason: "只用于打印场景渲染耗时，不进画面",
  },
  {
    file: "tools/lib/editor-page.js",
    api: /requestAnimationFrame/,
    reason: "只用于编辑器播放循环（界面预览），不进成片像素",
  },
  {
    file: "tools/inspect.js",
    api: /performance\.now\s*\(/,
    reason: "只用于检查器网页里的高亮脉冲动画，不进渲染产物",
  },
  {
    file: "tools/inspect.js",
    api: /requestAnimationFrame/,
    reason: "只用于检查器网页里的高亮脉冲动画，不进渲染产物",
  },
];

/** 检查器自己的规则表里就写着这些 API，扫描时跳过 */
const SKIP_FILES = new Set(["verify/determinism-check.js"]);

const roots = [
  resolve(ROOT, "src"),
  resolve(ROOT, "tools"),
  resolve(ROOT, "verify"),
];
const files = [];
for (const r of roots) walk(r, files);

const hits = [];
let allowedCount = 0;
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, "/");
  if (SKIP_FILES.has(rel)) continue;
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    // 跳过注释（允许在文档里提到这些 API）
    const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
    for (const b of BANNED) {
      if (!b.re.test(code)) continue;
      const exempt = ALLOW.some((a) => a.file === rel && a.api.test(code));
      if (exempt) {
        allowedCount++;
        continue;
      }
      hits.push(`${rel}:${i + 1}  ${b.msg}`);
    }
  });
}

if (hits.length) {
  problems++;
  console.log(`  ❌ 命中 ${hits.length} 处：`);
  for (const h of hits) console.log(`       ${h}`);
} else {
  console.log(`  ✅ ${files.length} 个源文件中，src/ 零违规`);
  if (allowedCount) console.log(`  ℹ️  另有 ${allowedCount} 处已显式豁免（见 ALLOW 表）`);
}
console.log("");

// ------------------------------------------------------------ 抽样帧

await initEngine();

const surfaceA = createSurface();
const surfaceB = createSurface();

const sampleFrames = pickSampleFrames(SAMPLES);
console.log(`② 重复渲染：同一帧渲两次比字节（${SAMPLES} 帧）`);
const hashOf = (surface, f) => {
  renderFrame(surface.ctx, f);
  return createHash("sha1").update(surfaceToRGBA(surface)).digest("hex");
};

const baseline = new Map();
let mismatch = 0;
for (const f of sampleFrames) {
  const a = hashOf(surfaceA, f);
  const b = hashOf(surfaceB, f);
  baseline.set(f, a);
  if (a !== b) {
    mismatch++;
    console.log(`  ❌ frame ${f}: ${a.slice(0, 12)} ≠ ${b.slice(0, 12)}`);
  }
}
if (mismatch) {
  problems++;
} else {
  console.log(`  ✅ ${SAMPLES} 帧全部逐字节一致`);
}

// ------------------------------------------------------------ ③ 乱序渲染

console.log("\n③ 乱序渲染：倒序重渲必须一致");
const reversed = [...sampleFrames].sort((a, b) => b - a);
let orderMismatch = 0;
for (const f of reversed) {
  const h = hashOf(surfaceA, f);
  if (h !== baseline.get(f)) {
    orderMismatch++;
    console.log(`  ❌ frame ${f} 倒序重渲结果不同 → 疑似依赖上一帧状态`);
  }
}
if (orderMismatch) {
  problems++;
} else {
  console.log(`  ✅ 倒序重渲 ${reversed.length} 帧全部一致`);
}

// ------------------------------------------------------------ ④ 并发渲染

console.log("\n④ 并发渲染：交错渲染必须一致");
let interleaveMismatch = 0;
for (let i = 0; i < reversed.length; i++) {
  const f = reversed[i];
  const other = sampleFrames[i % sampleFrames.length];
  renderFrame(surfaceA.ctx, other); // 故意插一帧别的
  const h = hashOf(surfaceA, f);
  if (h !== baseline.get(f)) {
    interleaveMismatch++;
    console.log(`  ❌ frame ${f} 被别的帧「污染」了`);
  }
}
if (interleaveMismatch) {
  problems++;
} else {
  console.log("  ✅ 交错渲染无污染");
}

// ------------------------------------------------------------ ⑤ 画面基线

/**
 * 基线只 warn、不 fail，而且变了就自动更新 —— 它的用途是「告诉我画面
 * 被无意识地改了没有」，不是「冻结画面」。有意的改动跑一次就重设基线。
 * 换 @napi-rs/canvas 版本 / 换机器也可能让指纹变，同样只会 warn。
 *
 * 抽样比 ② 密（每 100 帧 ≈ 1.7s 一帧）：太稀会整块画板漏过去 ——
 * 之前用 24 帧时，改了一整块 shot-07，基线居然报「一致」。
 */
console.log("\n⑤ 画面基线：和存档的指纹比（每 100 帧抽 1 帧）");
{
  const STEP = 100;
  const filmFrames = [];
  for (let f = 0; f < ts.totalFrames; f += STEP) filmFrames.push(f);
  const current = {
    note: "由 verify/determinism-check.js 生成；画面有意改动后重跑一次即可自动更新。",
    width: ts.width,
    height: ts.height,
    fps: ts.fps,
    step: STEP,
    frames: filmFrames.map((f) => ({ f, sha1: hashOf(surfaceA, f) })),
  };

  const FILE = resolve(ROOT, "verify", "picture-baseline.json");
  if (!existsSync(FILE)) {
    writeFileSync(FILE, JSON.stringify(current), "utf8");
    console.log(`  ℹ️  首次运行：已写入基线 ${relative(ROOT, FILE)}（${current.frames.length} 帧）`);
  } else {
    const prev = JSON.parse(readFileSync(FILE, "utf8"));
    const prevMap = new Map((prev.frames ?? []).map((x) => [x.f, x.sha1]));
    const sameShape =
      prev.width === ts.width &&
      prev.height === ts.height &&
      prev.fps === ts.fps &&
      prev.step === STEP &&
      (prev.frames ?? []).length === current.frames.length;

    if (!sameShape) {
      writeFileSync(FILE, JSON.stringify(current), "utf8");
      console.log(
        `  ⚠️  基线参数不一致（尺寸/帧率/抽样步长变了），已重建基线（${current.frames.length} 帧）`,
      );
    } else {
      const changed = current.frames.filter((x) => prevMap.get(x.f) !== x.sha1).map((x) => x.f);
      if (changed.length) {
        writeFileSync(FILE, JSON.stringify(current), "utf8");
        console.log(
          `  ⚠️  画面相对基线有 ${changed.length}/${current.frames.length} 帧变化（基线已更新）：`,
        );
        console.log(
          `       frame ${changed.slice(0, 12).join(", ")}${changed.length > 12 ? " …" : ""}`,
        );
      } else {
        console.log(`  ✅ 画面与基线一致（${current.frames.length} 帧）`);
      }
    }
  }
}

console.log("");
console.log("══════════════════════════════════════════════════");
if (problems) {
  console.log(`❌ determinism-check 失败：${problems} 类问题`);
  console.log("   （渲染产物不可复现 = 没法断点续渲，也没法只重跑有问题的几秒）");
  process.exit(1);
}
console.log("✅ determinism-check 通过：同 seed + 同帧号 = 同像素");
console.log("══════════════════════════════════════════════════");

// ------------------------------------------------------------ helpers

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
}

/** 固定步长的抽样（刻意不用随机——检查器自己也必须是确定性的） */
function pickSampleFrames(n) {
  const out = [];
  const step = Math.max(1, Math.floor(ts.totalFrames / n));
  for (let f = 0; f < ts.totalFrames && out.length < n; f += step) out.push(f);
  return out;
}
