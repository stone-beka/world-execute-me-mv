/**
 * tools/watch-render.js — 渲染进度看板（只读）
 *
 * 【为什么有它】
 * 渲染（`tools/render-frames.js`）本来就会把每个 worker 的进度写进
 * `out/.render-tmp-<pid>/progress-<slot>.txt`（内容是 `<done>/<total>`）。
 * 但那条**聚合进度条只打印在「启动渲染的那个终端」**里 ——
 * 如果渲染是别的进程（比如 Agent 的后台会话）启动的，你这边就**完全看不到进度**。
 *
 * 这个工具只读那些进度文件，把汇总结果打印在**跑它的这个终端**里。
 * 所以：不管渲染是谁启动的（你的终端 / Agent 的后台 / CI），
 * 你在自己的终端跑 `npm run watch:render` 就能看到进度。
 *
 * 用法：
 *   node tools/watch-render.js               # 跟着最新的渲染看，100% 后自动退出
 *   node tools/watch-render.js --once        # 只看一眼（脚本里用）
 *   node tools/watch-render.js --dir out/.render-tmp-1234
 *   node tools/watch-render.js --interval 300
 *   node tools/watch-render.js --json        # 机器可读（给别的工具/页面用）
 *
 * 退出码：0 = 看完了（渲染结束 / 文件被清理）；2 = 找不到任何渲染。
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../src/core/timeline.js";
import { bar, fmtDur } from "./lib/progress.js";

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const getNum = (n, d) => {
  const v = getStr(n, d);
  return v === undefined ? d : Number(v);
};

const OUT_DIR = resolve(ROOT, "out");
const PINNED = getStr("dir", null);
const INTERVAL = Math.max(100, getNum("interval", 500));
const ONCE = has("once");
const JSON_OUT = has("json");

/** 找到要看的进度目录：显式指定的 > 最新修改的 .render-tmp-* */
function findDir() {
  if (PINNED) {
    const p = resolve(ROOT, PINNED);
    return existsSync(p) ? p : null;
  }
  let best = null;
  let bestT = -Infinity;
  for (const e of readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.startsWith(".render-tmp-")) continue;
    const p = resolve(OUT_DIR, e.name);
    try {
      const t = statSync(p).mtimeMs;
      if (t > bestT) { bestT = t; best = p; }
    } catch {
      /* 目录正好被清掉，跳过 */
    }
  }
  return best;
}

/** 读一个目录里所有 progress-*.txt，汇总 done/total */
function readDir(dir) {
  let done = 0;
  let total = 0;
  let files = 0;
  let workers = 0;
  let mtime = 0;
  try {
    for (const f of readdirSync(dir)) {
      const m = /^progress-(\d+)\.txt$/.exec(f);
      if (!m) continue;
      workers++;
      const p = resolve(dir, f);
      mtime = Math.max(mtime, statSync(p).mtimeMs);
      const txt = readFileSync(p, "utf8");
      const g = /(\d+)\s*\/\s*(\d+)/.exec(txt);
      if (!g) continue;
      done += Number(g[1]);
      total += Number(g[2]);
      files++;
    }
  } catch {
    /* 正在被写/被清，下一轮再说 */
  }
  return { done, total, files, workers, mtime };
}

// ---------------------------------------------------------------- 主循环

let lastDir = null;
let lastDone = 0;
let lastAt = Date.now();
let rate = 0;
let startAt = null;
let sawProgress = false;

function snapshot() {
  const dir = findDir();
  if (!dir) return { dir: null, done: 0, total: 0, files: 0, workers: 0 };
  if (dir !== lastDir) {
    lastDir = dir;
    // 用目录的创建时间当「渲染开始」，估已用时间
    try {
      const b = statSync(dir).birthtimeMs;
      startAt = Number.isFinite(b) && b > 0 ? b : Date.now();
    } catch {
      startAt = Date.now();
    }
  }
  return { dir, ...readDir(dir) };
}

function tick() {
  const s = snapshot();
  if (!s.dir) {
    if (sawProgress) return { line: "渲染结束（进度文件已被清理）", done: true };
    return { line: "没找到正在跑的渲染（out/.render-tmp-* 不存在）", done: true, code: 2 };
  }

  const { done, total, workers } = s;
  if (total > 0 && done > 0) sawProgress = true;

  const p = total > 0 ? done / total : 0;
  const now = Date.now();
  const dt = (now - lastAt) / 1000;
  if (dt > 0.4 && done > lastDone && lastDone > 0) {
    rate = (done - lastDone) / dt;
  }
  lastDone = done;
  lastAt = now;

  const elapsed = startAt ? (now - startAt) / 1000 : 0;
  const remain = rate > 0 && total > done ? (total - done) / rate : NaN;

  const line =
    `  ${bar(p)} ${(p * 100).toFixed(1).padStart(5)}%  ` +
    `${String(done).padStart(5)}/${total || "?"} 帧  ` +
    `${rate > 0 ? rate.toFixed(1).padStart(5) : "  -- "} 帧/秒  ` +
    `已用 ${fmtDur(elapsed)}  剩 ${fmtDur(remain)}  ` +
    `(${workers} 进程)`;

  return { line, done: total > 0 && done >= total && p >= 0.999, raw: { ...s, rate, elapsed, remain } };
}

const first = snapshot();
if (JSON_OUT) {
  const r = tick();
  console.log(JSON.stringify(r.raw ?? { dir: null }, null, 2));
  process.exit(r.code ?? (r.raw && r.raw.total > 0 && r.raw.done >= r.raw.total ? 0 : 0));
}

if (!first.dir) {
  console.error("没找到正在跑的渲染（out/.render-tmp-* 不存在）。渲染启动后再试，或用 --dir 指定。");
  process.exit(2);
}
console.log(`▶ 看板盯住：${first.dir.replace(ROOT + "\\", "").replace(ROOT + "/", "")}`);
console.log(`  （渲染由谁启动都行；Ctrl+C 退出）`);

if (ONCE) {
  const r = tick();
  console.log(r.line);
  process.exit(r.code ?? 0);
}

let exitTimer = null;
const timer = setInterval(() => {
  const r = tick();
  process.stdout.write("\x1b[2K\r\x1b[2m" + r.line + "\x1b[0m");
  if (r.code) {
    clearInterval(timer);
    process.stdout.write("\n" + r.line + "\n");
    process.exit(r.code);
  }
  if (r.done && !exitTimer) {
    // 到了 100% 再多看两秒（后面还有混流/清理），然后收工
    exitTimer = setTimeout(() => {
      clearInterval(timer);
      process.stdout.write("\n✅ 进度到 100%（后续还有混流/清理，成品 mp4 稍后落盘）\n");
      process.exit(0);
    }, 2000);
  }
}, INTERVAL);
