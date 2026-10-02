/**
 * tools/lib/probe.js — 运行时「探针」：把「某一刻画面上有什么、在哪、往哪动」
 * 变成**可编程查询的数据**，而不是「渲一张图再用眼睛看」。
 *
 * 【为什么有它】
 * 排查/过审时最常问的三个问题是：
 *   ① 这一刻画面上有哪些元素？坐标/尺寸/装置/文案？
 *   ② 它下一时刻往哪走？多快？（矢量变化）
 *   ③ 这一帧是哪些画板叠出来的？各自的淡入淡出值是多少？
 * 以前只能靠渲图 + 识图，慢且不准。现在这些都从**运行时登记**（`s.__reg`）直接取。
 *
 * 【唯一真相源】
 * `tools/inspect.js`（网页检查器）和 `tools/query.js`（命令行查询）都 import 这里，
 * 所以两边永远不会出现「同一帧列出不同元素」。改这里的去重/合并规则，
 * 两边同时生效。
 *
 * 依赖：`src/core/render.js` 的 `opt.reg`（检查器注入的登记数组）。
 * 正常出片路径完全不传 reg，所以这里的一切**不影响**渲染结果。
 */

import { ts, initEngine, createSurface, renderFrame, surfaceToPNG } from "../../src/core/render.js";
import { boards, resolveRange } from "../../src/core/registry.js";
import { sectionAt } from "../../src/core/timeline.js";
import { envelope } from "../../src/core/fade.js";

/** 登记过的「帧内特效」（和 _ui.js 里的 fpOn 名字对应），服务和页面共用 */
export const FX_LIST = [
  { name: "glitchSlice", label: "眩晕：切片错位", where: "03-geometry" },
  { name: "flashWhite", label: "白闪", where: "03-geometry" },
  { name: "radarSweep", label: "雷达扇区", where: "08-dial" },
  { name: "scanBand", label: "扫描光带", where: "09-erase" },
  { name: "ripple", label: "涟漪", where: "（备用）" },
  { name: "scanlines", label: "扫描线", where: "（备用）" },
];

/** 速度匹配时的最大位移（像素）：超过就认为「不是同一个元素」 */
const MATCH_MAX_PX = 420;

let _surface = null;

/** 初始化（loadBoards + 一个离屏面）。只调一次。 */
export async function initProbe() {
  if (_surface) return;
  await initEngine();
  _surface = createSurface();
}

export const clampFrame = (f) => Math.max(0, Math.min(ts.totalFrames - 1, Math.round(f)));
export const msToFrame = (ms) => clampFrame((ms / 1000) * ts.fps);
export const frameToMs = (ms) => ms;
export const timeLabel = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
};

// ---------------------------------------------------------------- 列表清洗

/** 同一画板里，同一个装置 + 同一坐标 + 同一文案 = 重复（比如同一处画了两遍） */
export function dedup(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const key = [e.board, e.device, e.x, e.y, e.text].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * 「一行一行的文字应该算一个元素」—— 把散落的 label 聚成块。
 *
 * 规则：同一画板 + 装置都是 label + x 相近（±40px）+ y 相邻（间隔 ≤ 46px）
 * 的连续行，合成**一个**元素，文本显示成「第一行 … N 行」。
 */
export function mergeLines(list) {
  const others = list.filter((e) => e.device !== "label");
  const labels = list.filter((e) => e.device === "label");

  const groups = new Map();
  for (const e of labels) {
    const bucket = e.board + "|" + Math.round(e.x / 40);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(e);
  }

  const merged = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.y - b.y);
    let cur = null;
    for (const e of arr) {
      if (cur && e.y - cur.lastY <= 46) {
        cur.items.push(e);
        cur.lastY = e.y;
        cur.y2 = Math.max(cur.y2, e.y);
      } else {
        if (cur) merged.push(finishGroup(cur));
        cur = { board: e.board, x: e.x, y: e.y, lastY: e.y, y2: e.y, items: [e] };
      }
    }
    if (cur) merged.push(finishGroup(cur));
  }
  return [...others, ...merged].sort((a, b) => a.board.localeCompare(b.board) || a.y - b.y);
}

function finishGroup(g) {
  const first = g.items[0];
  const n = g.items.length;
  const text = n === 1
    ? first.text
    : (first.text ? first.text + " … " + n + " 行" : n + " 行文字");
  return {
    board: g.board,
    device: "text",
    x: g.x,
    y: g.y,
    w: null,
    h: g.y2 - g.y + 20,
    text,
    lines: n,
  };
}

/** 给每个元素编号：画板#序号（按 y 排序，稳定） */
export function numberElems(list) {
  const byBoard = new Map();
  for (const e of list) {
    if (!byBoard.has(e.board)) byBoard.set(e.board, []);
    byBoard.get(e.board).push(e);
  }
  const out = [];
  for (const [board, arr] of byBoard) {
    arr.sort((a, b) => a.y - b.y || a.x - b.x);
    arr.forEach((e, i) => out.push({ ...e, id: board + "#" + String(i + 1).padStart(2, "0") }));
  }
  return out.sort((a, b) => a.board.localeCompare(b.board) || a.y - b.y);
}

// ---------------------------------------------------------------- 探针

/**
 * 探某一帧。
 * @returns {{frame,ms,sec,section,boards,fx,live,raw}}
 *   boards: 这一刻在场的画板（含 startMs/endMs/**env**）
 *   live:   去重 + 合并行 + 编号后的元素清单
 *   raw:    去重后的原始登记（未合并行、未编号）
 */
export function probeFrame(frame, opts = {}) {
  if (!_surface) throw new Error("probe.js 还没 initProbe()");
  const f = clampFrame(frame);
  const ms = (f * 1000) / ts.fps;

  const layer = {
    off: { desk: opts.desk === false },
    boards: opts.boards ?? null,
    fx: opts.fx ?? null,
  };
  const collected = [];
  renderFrame(_surface.ctx, f, {
    floor: opts.floor === false ? false : undefined,
    layers: layer,
    reg: collected,
  });

  const raw = dedup(collected);
  const live = numberElems(mergeLines(raw));

  const active = [];
  for (const b of boards) {
    const r = resolveRange(b.meta);
    if (ms < r.startMs || ms >= r.endMs) continue;
    active.push({
      file: b.file.replace(/\.js$/, ""),
      id: b.meta.id,
      startMs: r.startMs,
      endMs: r.endMs,
      z: b.meta.z ?? 0,
      env: envelope(ms, r.startMs, r.endMs, b.meta.fade ?? {}),
      fade: b.meta.fade ?? {},
    });
  }

  return {
    frame: f,
    ms,
    sec: ms / 1000,
    section: sectionAt(ms) ?? null,
    boards: active,
    fx: FX_LIST,
    live,
    raw,
  };
}

/**
 * 探针内部那块离屏面（`probeFrame` 刚渲染的那一帧就在它上面）。
 *
 * ⚠️ 这是**共享的可变引用**：下一次 `probeFrame/probeAt` 会把它**整个覆盖**。
 * 要留住某一帧的像素，必须在「探完这一帧之后、探下一帧之前」就 drawImage 走，
 * 不能先探完所有帧再统一取（那样每格都是最后一帧 —— 踩过）。
 */
export function probeSurface() {
  if (!_surface) throw new Error("probe.js 还没 initProbe()");
  return _surface;
}

/** 按秒探（会四舍五入到最近帧） */
export function probeAt(sec, opts = {}) {
  return probeFrame(Math.round(sec * ts.fps), opts);
}

/** 覆盖某点的元素（面板/文本块按包围盒；纯文字按锚点附近估算） */
export function hitTest(live, x, y) {
  const hits = [];
  for (const e of live) {
    if (e.x == null || e.y == null) continue;
    const w = e.w ?? 0;
    const h = e.h ?? 0;
    if (w > 0 && h > 0) {
      if (x >= e.x && x <= e.x + w && y >= e.y && y <= e.y + h) hits.push(e);
    } else {
      // 文字：宽度不明，按字数估；高度按合并块或一行
      const est = Math.min(900, Math.max(40, (e.text ? e.text.length : 4) * 13));
      const hh = h > 0 ? h : 24;
      if (x >= e.x - 4 && x <= e.x + est && y >= e.y - 6 && y <= e.y + hh) hits.push(e);
    }
  }
  return hits;
}

/**
 * 给 A 组元素挂上运动矢量：用 B（A 之后 dtMs 的一帧）按**同画板同装置 + 最近位置**配对。
 * 配对不上的标 null（那说明它不在场 / 换了装置）。
 */
export function attachVelocity(liveA, liveB, dtMs) {
  const used = new Set();
  const secs = Math.max(1e-6, dtMs / 1000);
  for (const a of liveA) {
    let best = null;
    let bestD = Infinity;
    if (a.x != null) {
      for (const b of liveB) {
        if (used.has(b)) continue;
        if (b.board !== a.board || b.device !== a.device || b.x == null) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    if (best && bestD <= MATCH_MAX_PX) {
      used.add(best);
      a.toX = best.x;
      a.toY = best.y;
      a.dx = best.x - a.x;
      a.dy = best.y - a.y;
      a.speed = Math.hypot(a.dx, a.dy) / secs;
      a.dirDeg = (((Math.atan2(a.dy, a.dx) * 180) / Math.PI) + 360) % 360;
    } else {
      a.toX = a.toY = a.dx = a.dy = a.speed = a.dirDeg = null;
    }
  }
  return liveA;
}

const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
/** 角度（屏幕坐标，y 向下）→ 八向箭头 */
export const dirArrow = (deg) => (deg == null ? "·" : ARROWS[Math.round(deg / 45) % 8]);

// ---------------------------------------------------------------- 出图（可选，给「必须看一眼」的时候）

/** 某一秒的 PNG。boxes=true 时叠上红框 + ID（和检查器一样）。 */
export function renderPNG(sec, opts = {}) {
  if (!_surface) throw new Error("probe.js 还没 initProbe()");
  const p = probeFrame(Math.round(sec * ts.fps), opts);
  const ctx = _surface.ctx;
  if (opts.boxes) {
    ctx.save();
    ctx.font = "13px monospace";
    for (const it of p.live) {
      if (it.x == null || it.y == null) continue;
      const w = it.w ?? 0;
      const h = it.h ?? 0;
      const risky = it.y < 96;
      ctx.strokeStyle = risky ? "rgba(255,196,0,0.95)" : "rgba(255,64,96,0.85)";
      ctx.lineWidth = 1;
      if (w > 0 && h > 0) {
        ctx.strokeRect(it.x - 1, it.y - 1, w + 2, h + 2);
      } else {
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
      ctx.fillStyle = risky ? "rgba(255,196,0,0.95)" : "rgba(255,64,96,0.92)";
      ctx.fillRect(tx, ty - 11, tw, 15);
      ctx.fillStyle = "#0a0a0c";
      ctx.fillText(tag, tx + 3, ty);
    }
    ctx.restore();
  }
  return { png: surfaceToPNG(_surface), probe: p };
}
