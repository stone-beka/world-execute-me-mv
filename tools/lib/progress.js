/**
 * tools/lib/progress.js — 渲染进度条
 *
 * 为什么需要它：`--jobs 4` 是推荐的出片方式，但进度只在 `JOBS === 1` 时才打印 ——
 * 于是用 4 进程渲全片时，屏幕会**整整五分钟没有任何输出**，只能干等。
 *
 * 这里做一条**聚合**进度条：每个 worker 把自己的进度写进一个共享的进度文件，
 * 主进程读所有 worker 的进度加起来显示。不用 IPC，不引入依赖。
 *
 * 用法（worker 侧）：
 *   const p = createProgressWriter(slot);
 *   p.update(doneFrames);
 *   p.finish();
 * 用法（主进程侧）：
 *   const bar = startTaskBar(totalFrames, jobs);
 *   bar.tick();   // 定时器内部读所有 slot，自己刷新
 */

import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CLEAR = "\x1b[2K\r";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

/** 进度条字符画 */
function bar(p, width = 28) {
  const q = Math.max(0, Math.min(1, p));
  const filled = Math.round(q * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmtDur(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** worker：把「我已经渲了多少帧」写进自己的 slot 文件 */
export function createProgressWriter(slot, dir) {
  const file = resolve(dir, `progress-${slot}.txt`);
  let lastWrite = 0;
  return {
    update(done, total) {
      const now = Date.now();
      // 别每帧都写盘（那是 I/O 噪声）；200ms 一次足够
      if (now - lastWrite < 200) return;
      lastWrite = now;
      try {
        writeFileSync(file, `${done}/${total}`, "utf8");
      } catch {
        /* 进度写失败不该弄死渲染 */
      }
    },
    finish(total) {
      try {
        writeFileSync(file, `${total}/${total}`, "utf8");
      } catch {
        /* 同上 */
      }
    },
  };
}

/**
 * 主进程：聚合所有 slot 的进度，定时刷新一条进度条。
 * 返回 { tick, stop, done }。
 */
export function startTaskBar(totalFrames, slots, dir, opt = {}) {
  const started = Date.now();
  const intervalMs = opt.intervalMs ?? 500;
  let lastLen = 0;
  let lastDone = 0;
  let lastAt = Date.now();

  function readAll() {
    let done = 0;
    for (let i = 0; i < slots; i++) {
      const f = resolve(dir, `progress-${i}.txt`);
      if (!existsSync(f)) continue;
      try {
        const m = readFileSync(f, "utf8").match(/(\d+)\/(\d+)/);
        if (m) done += Number(m[1]);
      } catch {
        /* 正在被写，跳过这一轮 */
      }
    }
    return Math.min(done, totalFrames);
  }

  function render(force = false) {
    const done = readAll();
    const p = totalFrames ? done / totalFrames : 0;
    const elapsed = (Date.now() - started) / 1000;

    // 速率用最近一段的瞬时值，比全程平均更能反映「现在快不快」
    const now = Date.now();
    const dt = (now - lastAt) / 1000;
    let rate = 0;
    if (dt > 0.4 && done > lastDone) {
      rate = (done - lastDone) / dt;
      lastDone = done;
      lastAt = now;
    } else if (rate === 0 && done > 0 && elapsed > 0) {
      rate = done / elapsed;
    }

    const remain = rate > 0 ? (totalFrames - done) / rate : NaN;
    const line =
      `  ${bar(p)} ${(p * 100).toFixed(1).padStart(5)}%  ` +
      `${String(done).padStart(5)}/${totalFrames} 帧  ` +
      `${rate > 0 ? rate.toFixed(1).padStart(5) : "  -- "} 帧/秒  ` +
      `已用 ${fmtDur(elapsed)}  剩 ${fmtDur(remain)}`;

    if (!force && line === lastLen) return;
    lastLen = line;
    process.stdout.write(CLEAR + DIM + line + RESET);
  }

  const timer = setInterval(() => render(), intervalMs);
  render(true);

  return {
    tick: () => render(),
    stop() {
      clearInterval(timer);
      render(true);
      process.stdout.write("\n");
    },
    done: readAll,
  };
}

/** 清理进度文件 */
export function clearProgress(slots, dir) {
  for (let i = 0; i < slots; i++) {
    try {
      rmSync(resolve(dir, `progress-${i}.txt`), { force: true });
    } catch {
      /* ignore */
    }
  }
}

export { bar, fmtDur, BOLD };
