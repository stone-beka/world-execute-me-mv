/**
 * tools/elements.js — 元素清单 + 可视化
 *
 * 为什么有它：协作时用「时间」定位元素是最难用的坐标 ——
 * 「0:44 那个弹窗」要反推是哪个画板、哪个分支、哪一行，反复猜错。
 *
 * 这个工具给画面上每个「可以被点名的元素」一个 ID，并支持：
 *   node tools/elements.js --list                   列出所有元素
 *   node tools/elements.js --frame 0:44             画出该时刻所有元素的 ID + 包围盒
 *   node tools/elements.js --board shot-03 --list   只看某块画板
 *   node tools/elements.js --json                   导出 out/elements.json
 *
 * --frame 会输出一张**标注图**（像浏览器 Inspect）：每个元素一个方框 +
 * 一个 ID 标签。你看着图报 ID 就行，不用在时间里猜。
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../src/core/timeline.js";

const BOARD_DIR = resolve(ROOT, "src", "boards");

/** 会被当成「一个可见元素」登记的装置 */
const DEVICES = [
  { name: "panel", re: /panel\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)[^,]*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/ },
  { name: "dialog", re: /dialog\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "label", re: /label\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*[`"']([^`"']{0,40})/ },
  { name: "bar", re: /bar\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/ },
  { name: "wireCube", re: /wireCube\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)/ },
  { name: "wireHeart", re: /wireHeart\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "chessPiece", re: /chessPiece\(\s*ctx\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)/ },
  { name: "powerButton", re: /powerButton\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "select", re: /select\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "feelingIndex", re: /feelingIndex\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "logConsole", re: /logConsole\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "glitchWall", re: /glitchWall\(\s*ctx\s*,\s*s\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/ },
  { name: "redAlarm", re: /redAlarm\(/ },
  { name: "blueScreen", re: /blueScreen\(/ },
  { name: "gridBg", re: /gridBg\(/ },
];

/** 距顶部/底部多近才提醒（会撞上顶部扫描带或底部注脚） */
const EDGE_TOP = 96;
const EDGE_BOTTOM = 1008;

/** 元素清单：静态扫描只作兜底参考（运行时登记才是真的），这里保留总数 */
export function scanElements() {
  const files = readdirSync(BOARD_DIR).filter((f) => f.endsWith(".js") && !f.startsWith("_"));
  const out = [];
  for (const f of files.sort()) {
    const lines = readFileSync(join(BOARD_DIR, f), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      for (const d of DEVICES) {
        const m = code.match(d.re);
        if (!m) continue;
        out.push({
          board: f.replace(/\.js$/, ""),
          line: i + 1,
          device: d.name,
          x: m[1] !== undefined ? Number(m[1]) : null,
          y: m[2] !== undefined ? Number(m[2]) : null,
          w: m[3] !== undefined ? Number(m[3]) : null,
          h: m[4] !== undefined ? Number(m[4]) : null,
          text: m[5] ?? null,
          snippet: line.trim().slice(0, 78),
        });
      }
    });
  }
  return out;
}

/** 给每个元素生成一个稳定 ID：画板.序号 */
export function withIds(items) {
  const counters = new Map();
  return items.map((it) => {
    const n = (counters.get(it.board) ?? 0) + 1;
    counters.set(it.board, n);
    return { ...it, id: `${it.board}#${String(n).padStart(2, "0")}` };
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  const getStr = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };

  const items = withIds(scanElements());
  const boardFilter = getStr("board", null);
  const shown = boardFilter ? items.filter((x) => x.board === boardFilter) : items;

  if (has("list") || !has("frame")) {
    console.log("元素清单（" + shown.length + " 个）");
    console.log("ID".padEnd(18) + "装置".padEnd(14) + "位置".padEnd(20) + "说明");
    for (const it of shown) {
      const pos = it.x === null ? "—" : `(${it.x},${it.y})${it.w ? ` ${it.w}×${it.h}` : ""}`;
      const warn = it.y !== null && it.y < EDGE_TOP ? "  ⚠️ 贴顶" : "";
      console.log(
        it.id.padEnd(18) +
          it.device.padEnd(14) +
          pos.padEnd(20) +
          (it.text ? `"${it.text}"` : it.snippet.slice(0, 44)) +
          warn,
      );
    }
    const risky = shown.filter((x) => x.y !== null && x.y < EDGE_TOP);
    console.log(`\n贴顶风险：${risky.length} 个`);
  }

  if (has("json")) {
    mkdirSync(resolve(ROOT, "out"), { recursive: true });
    const p = resolve(ROOT, "out", "elements.json");
    writeFileSync(p, JSON.stringify(shown, null, 2), "utf8");
    console.log(`\n已写出 ${p}`);
  }

  // ---- 标注图：把当前帧上的元素 ID + 包围盒画出来 ----
  if (has("frame")) {
    const spec = getStr("frame", "0:44");
    // 支持 "0:44" / "44" / "44.5"（秒）
    let sec;
    if (spec.includes(":")) {
      const [m, s2] = spec.split(":");
      sec = Number(m) * 60 + Number(s2);
    } else {
      sec = Number(spec);
    }
    if (!Number.isFinite(sec)) {
      console.error("--frame 要写秒数，例如 0:44 或 44");
      process.exit(1);
    }

    const { ts, initEngine, createSurface, renderFrame, surfaceToPNG } = await import("../src/core/render.js");
    await initEngine();
    const surf = createSurface();
    const f = Math.round(sec * ts.fps);
    renderFrame(surf.ctx, f, {});
    const ctx = surf.ctx;

    // 只标「这一帧真的在场」的元素：同一块画板的时间范围覆盖 sec
    // 注意：清单里的 board 是**文件名**（03-geometry），registry 里是 **meta.id**
    // （shot-03）—— 两者不一样，得先建映射。
    const { boards, resolveRange } = await import("../src/core/registry.js");
    const liveFiles = new Set(
      boards
        .filter((b) => {
          const r = resolveRange(b.meta);
          return sec * 1000 >= r.startMs && sec * 1000 < r.endMs;
        })
        .map((b) => b.file.replace(/\.js$/, "")),
    );

    let n = 0;
    ctx.save();
    ctx.font = "13px monospace";
    for (const it of items) {
      if (!liveFiles.has(it.board)) continue;
      if (it.x === null || it.y === null) continue;
      n++;
      const w = it.w ?? 0;
      const h = it.h ?? 0;
      ctx.strokeStyle = "rgba(255,64,96,0.85)";
      ctx.lineWidth = 1;
      if (w > 0 && h > 0) {
        ctx.strokeRect(it.x - 1, it.y - 1, w + 2, h + 2);
      } else {
        // 文字类：画一个小十字准星 + 引线
        ctx.beginPath();
        ctx.moveTo(it.x - 8, it.y - 6);
        ctx.lineTo(it.x + 8, it.y - 6);
        ctx.moveTo(it.x, it.y - 12);
        ctx.lineTo(it.x, it.y + 4);
        ctx.stroke();
      }
      const tag = it.id;
      const tw = ctx.measureText(tag).width + 6;
      const tx = Math.max(0, Math.min(ts.width - tw, it.x + 6));
      const ty = Math.max(14, it.y - 16);
      ctx.fillStyle = "rgba(255,64,96,0.92)";
      ctx.fillRect(tx, ty - 11, tw, 15);
      ctx.fillStyle = "#0a0a0c";
      ctx.fillText(tag, tx + 3, ty);
    }
    ctx.restore();

    mkdirSync(resolve(ROOT, "out", "probe"), { recursive: true });
    const outP = resolve(ROOT, "out", "probe", `elements-${String(sec).replace(".", "_")}.png`);
    writeFileSync(outP, surfaceToPNG(surf));
    console.log(`\n标注图 → ${outP}`);
    console.log(`  时刻 ${sec}s  在场画板 ${[...liveFiles].join(", ") || "（无）"}  标出元素 ${n} 个`);
    console.log(`  红色方框 = 有尺寸的装置（面板/进度条）`);
    console.log(`  红色准星 = 文字类元素（坐标是它的基线锚点）`);
  }
}
