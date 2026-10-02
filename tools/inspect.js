/**
 * tools/inspect.js — 本地「元素检查器」（浏览器里用）
 *
 * 为什么有它：`tools/elements.js` 是命令行工具 —— 要记参数、要敲命令，
 * 对「我想指着画面说改哪个」这件事等于没用。这里把它变成一个网页：
 *
 *    npm run inspect
 *
 * 打开后你能做三件事：
 *   ① 拖时间滑块（或按 ← →）选任意时刻，画面实时更新
 *   ② 画面上每个「可被点名的元素」都画着红框 + ID
 *   ③ 右侧列出现场所有元素（ID / 装置 / 坐标），贴顶的会标红
 *
 * 纯 Node 自带 http，不装任何依赖。画面靠渲染引擎出 PNG。
 */

import { createServer } from "node:http";
import { ts } from "../src/core/render.js";
import { initProbe, probeAt, renderPNG, FX_LIST } from "./lib/probe.js";
import { lyrics } from "../src/core/lyrics.js";

const argv = process.argv.slice(2);
const PORT = Number(argv[argv.indexOf("--port") + 1]) || 7711;

await initProbe();

console.log("▶ 启动中（元素用运行时登记；探针逻辑与 tools/query.js 共用）");

/**
 * 渲染某一秒 → { png, live }。
 * 元素清洗（去重 / 合并行 / 编号）和标注框全在 `tools/lib/probe.js` ——
 * 网页检查器和命令行 `tools/query.js` 共用同一份，不会再出现两边不一致。
 */
function renderAt(sec, opts = {}) {
  const { png, probe } = renderPNG(sec, {
    desk: opts.desk !== false,
    floor: opts.floor !== false,
    boxes: opts.boxes !== false,
    boards: opts.boards ?? null,
    fx: opts.fx ?? null,
  });
  return { png, live: probe.live };
}

/**
 * 某时刻的歌词状态（给页面底部那条歌词栏用）。
 *   kind="line"          正在唱这一句：给出每个词的 start/end/progress
 *   kind="instrumental"  没有词在唱：报「间奏」还是「句间空拍」，以及下一句何时来
 */
function lyricAt(sec) {
  const ms = sec * 1000;
  if (lyrics.empty) return { kind: "none", reason: "assets/lyrics.json 是空的" };

  const line = lyrics.lineAt(ms);
  if (line) {
    return {
      kind: "line",
      text: line.text,
      start: line.start,
      end: line.end,
      singEnd: line.singEnd,
      charProgress: Number(lyrics.lineCharProgress(line, ms).toFixed(2)),
      words: line.words.map((w) => ({
        w: w.w,
        start: w.start,
        end: w.end,
        p: Number(lyrics.wordProgress(w, ms).toFixed(3)),
        active: ms >= w.start && ms < w.end,
        done: ms >= w.end,
      })),
    };
  }

  const prev = lyrics.lastLine(ms);
  const next = lyrics.nextLine(ms);
  const prevEnd = prev ? prev.end : null;
  const nextStart = next ? next.start : null;
  // 前后两句之间有多长空档 → 长的是间奏，短的是句间换气
  const gapMs = nextStart !== null && prevEnd !== null ? nextStart - prevEnd : null;
  // 三种「没有词在唱」：整曲第一句之前 = 前奏；最后一句之后 = 尾奏；中间 = 间奏 / 句间空拍
  const label =
    prevEnd === null ? "前奏（还没开唱）"
      : nextStart === null ? "尾奏（唱完了）"
      : (gapMs !== null && gapMs >= 1500 ? "间奏" : "句间空拍");
  return {
    kind: "instrumental",
    label,
    prev: prev ? prev.text : null,
    next: next ? next.text : null,
    nextStart,
    sincePrev: prevEnd === null ? null : Math.round(ms - prevEnd),
    untilNext: nextStart === null ? null : Math.round(nextStart - ms),
    gapMs: gapMs === null ? null : Math.round(gapMs),
  };
}

/** 全片登记过的元素数（抽 16 帧取并集；结果缓存，只算一次） */
let elementsCache = null;
function allElementCount() {
  if (elementsCache !== null) return elementsCache;
  const N = 16;
  const ids = new Set();
  for (let i = 0; i < N; i++) {
    const sec = ((ts.totalFrames - 1) / ts.fps) * (i / (N - 1));
    try {
      for (const it of probeAt(sec).live) ids.add(it.id);
    } catch {
      /* 单帧失败不影响计数 */
    }
  }
  elementsCache = ids.size;
  return elementsCache;
}

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>元素检查器 — world.execute(me);</title><style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height:100%; }
  body { margin:0; background:#0a0a0c; color:#e9e9ec;
         display:flex; flex-direction:column; overflow:hidden;
         font:13px/1.5 ui-monospace, Menlo, Consolas, monospace; }
  header { flex:0 0 auto; padding:10px 16px; border-bottom:1px solid #2a2a30; display:flex;
           gap:16px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:14px; margin:0; font-weight:600; }
  .hint { color:#8b8b93; }
  main { display:grid; grid-template-columns: 1fr 360px; flex:1 1 auto; min-height:0; }
  #stage { position:relative; overflow:auto; padding:12px; min-height:0; }
  #wrap { position:relative; border:1px solid #2a2a30; transform-origin: 0 0; }
  #view { width:100%; display:block; }
  #hl { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  aside { border-left:1px solid #2a2a30; overflow:auto; padding:12px; min-height:0; }
  .sec { margin:0 0 6px; color:#8b8b93; font-size:11px; letter-spacing:.08em;
         text-transform:uppercase; }
  .lyr { display:flex; align-items:center; gap:8px; padding:4px 6px; border-radius:4px;
         cursor:pointer; }
  .lyr:hover { background:#17171b; }
  .lyr input { accent-color:#ff6070; }
  .lyr.off .name { color:#5a5a62; text-decoration:line-through; }
  .lyr .sw { width:10px; height:10px; border-radius:2px; flex:0 0 auto; }
  .lyr .name { flex:1; }
  .lyr .tag2 { color:#5a5a62; font-size:11px; }
  hr { border:0; border-top:1px solid #2a2a30; margin:12px 0; }
  .row { padding:7px 9px; border-radius:5px; cursor:pointer;
         transition:background .08s; border:1px solid transparent; }
  .row:hover { background:#17171b; border-color:#2a2a30; }
  .row.sel { background:#26262e; border-color:#ff6070; }
  .row.risky { border-left:3px solid #ffc400; }
  .row .r1 { display:flex; align-items:baseline; gap:8px; }
  .row .rtext { color:#c8c8d0; margin-top:2px; overflow:hidden; text-overflow:ellipsis;
                white-space:nowrap; }
  .id { color:#ff6070; font-weight:600; }
  .dev { color:#8b8b93; margin-left:auto; font-size:11px; }
  .pos { color:#6b6b73; font-size:11px; margin-top:2px;
         font-variant-numeric: tabular-nums; }
  .warnTag { color:#ffc400; font-size:10px; border:1px solid #6b5a00;
             border-radius:3px; padding:0 4px; }
  #toast { position:fixed; left:50%; bottom:78px; transform:translateX(-50%) translateY(8px);
           background:#1e40d8; color:#fff; padding:7px 14px; border-radius:5px;
           opacity:0; pointer-events:none; transition:opacity .15s, transform .15s;
           font-size:12px; }
  #toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
  .zoom { color:#8b8b93; min-width:52px; text-align:right;
          font-variant-numeric: tabular-nums; }
  footer { flex:0 0 auto; padding:10px 16px; border-top:1px solid #2a2a30; display:flex;
           gap:14px; align-items:center; }
  /* ---- 歌词栏 ---- */
  #lyricbar { flex:0 0 auto; display:flex; align-items:center; gap:14px;
              padding:12px 18px; border-bottom:1px solid #2a2a30;
              background:linear-gradient(180deg,#101014,#0c0c10);
              min-height:62px; }
  #lyricKind { flex:0 0 auto; font-size:11px; padding:2px 9px; border-radius:10px;
               background:#222228; color:#8b8b93; letter-spacing:.06em; }
  #lyricKind.ok { background:#12331f; color:#5ce08a; }
  #lyricKind.ins { background:#33290f; color:#ffc400; }
  #lyricText { flex:1 1 auto; font-size:19px; line-height:1.35; color:#e9e9ec;
               overflow:hidden; text-overflow:ellipsis; }
  #lyricText .w { transition:color .08s; }
  #lyricText .w.act { color:#ff6070; text-shadow:0 0 12px rgba(255,96,112,.55); }
  #lyricText .w.done { color:#c8f0e8; }
  #lyricText .w.todo { color:#6b6b73; }
  #lyricMeta { flex:0 0 auto; font-size:11px; color:#6b6b73; text-align:right;
               font-variant-numeric:tabular-nums; max-width:34%; }
  input[type=range] { flex:1; }
  time { font-variant-numeric: tabular-nums; color:#c8f0e8; min-width:78px; }
  button { background:#1e40d8; color:#fff; border:0; border-radius:4px;
           padding:5px 12px; font:inherit; cursor:pointer; }
  button.ghost { background:#222228; }
  .badge { background:#222228; padding:2px 7px; border-radius:10px; color:#8b8b93; }
</style></head><body>
<header>
  <h1>元素检查器</h1>
  <span class="hint">拖滑块选时间 · 画面上的红框 = 可点名元素（<b style="color:#ffc400">黄色=贴顶风险</b>）</span>
  <span class="badge" id="count">—</span>
</header>
<div id="lyricbar">
  <span id="lyricKind">—</span>
  <div id="lyricText">—</div>
  <div id="lyricMeta"></div>
</div>
<main>
  <div id="stage">
    <div id="wrap">
      <img id="view" alt="frame">
      <canvas id="hl"></canvas>
    </div>
  </div>
  <aside>
    <div class="sec">图层</div>
    <div id="layers"></div>
    <hr>
    <div class="sec">这一帧的元素 <span id="elcount" class="tag2"></span></div>
    <div class="hint" style="font-size:11px;padding:0 6px 6px">左键选中高亮 · <b>右键复制</b>（ID+时刻+位置）</div>
    <div id="list"></div>
  </aside>
</main>
<footer>
  <time id="tlabel">0:00.00</time>
  <input type="range" id="scrub" min="0" max="${(ts.totalFrames - 1) / ts.fps}" step="0.05" value="0">
  <button class="ghost" id="prev">◀ 前 1s</button>
  <button class="ghost" id="next">后 1s ▶</button>
  <button class="ghost" id="zoomOut">−</button>
  <span class="zoom" id="zoomLabel">100%</span>
  <button class="ghost" id="zoomIn">＋</button>
  <button class="ghost" id="zoomFit">适应</button>
  <button id="copy">复制此刻清单</button>
</footer>
<div id="toast"></div>
<script>
const img = document.getElementById('view');
const hl = document.getElementById('hl');
const scrub = document.getElementById('scrub');
const tlabel = document.getElementById('tlabel');
const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
let live = [];
let timer = null;
let selected = null;   // 被选中的元素 id
let zoom = 1;          // 1 = 适应宽度；>1 放大
let baseW = 0;         // 适应宽度时图片的显示宽度（用于换算模型坐标）
// 图层开关状态
const LAYERS = { desk: true, floor: true, boxes: true };
const BOARD_OFF = new Set();  // 被关掉的画板文件名
const FX_OFF = new Set();     // 被关掉的特效名

/** 登记过的「帧内特效」（和 _ui.js 里的 fpOn 名字对应） */
const FX_LIST_PAGE = __FX_LIST__;
function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2);
}

/** HTML 转义：歌词里有 & < > 之类（比如 P(doom) 没事，但 & 会毁掉 DOM） */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 歌词栏：正在唱 → 逐词高亮；没词在唱 → 间奏 / 句间空拍 + 下一句倒计时 */
function renderLyric(L) {
  const kindEl = document.getElementById('lyricKind');
  const textEl = document.getElementById('lyricText');
  const metaEl = document.getElementById('lyricMeta');
  if (!L || L.kind === 'none') {
    kindEl.className = '';
    kindEl.textContent = '无歌词表';
    textEl.textContent = (L && L.reason) || '—';
    metaEl.textContent = '';
    return;
  }
  if (L.kind === 'line') {
    kindEl.className = 'ok';
    kindEl.textContent = '正在唱';
    textEl.innerHTML = L.words.map(function (w) {
      var cls = w.active ? 'act' : (w.done ? 'done' : 'todo');
      return '<span class="w ' + cls + '">' + esc(w.w) + '</span>';
    }).join(' ');
    const total = L.words.length;
    let wi = -1;
    for (let i = 0; i < total; i++) if (L.words[i].active) { wi = i; break; }
    let wordInfo;
    if (wi >= 0) {
      wordInfo = '第 ' + (wi + 1) + '/' + total + ' 词 · 词内 '
        + Math.round(L.words[wi].p * 100) + '%';
    } else {
      const doneN = L.words.filter(function (w) { return w.done; }).length;
      wordInfo = doneN >= total ? '本句唱完' : '第 ' + (doneN + 1) + '/' + total + ' 词（词间空拍）';
    }
    metaEl.innerHTML = '句 ' + fmt(L.start / 1000) + ' → ' + fmt(L.end / 1000)
      + '<br>' + wordInfo;
    return;
  }
  // 没词在唱
  kindEl.className = 'ins';
  kindEl.textContent = L.label || '间奏';
  textEl.innerHTML = '<span style="color:#6b6b73">（器乐 — 这段没有唱词）</span>';
  var bits = [];
  if (L.sincePrev !== null) bits.push('上句结束 ' + (L.sincePrev / 1000).toFixed(2) + 's 前');
  if (L.untilNext !== null) bits.push('下一句 ' + fmt(L.nextStart / 1000)
    + '（还有 ' + (L.untilNext / 1000).toFixed(2) + 's）');
  metaEl.innerHTML = bits.join('<br>')
    + (L.next ? '<br>即将：“' + esc(L.next) + '”' : '');
}

function refreshLyric(t) {
  fetch('/lyric?t=' + t.toFixed(2))
    .then(function (r) { return r.json(); })
    .then(renderLyric)
    .catch(function () { /* 歌词栏坏了不该影响其它 */ });
}

/** 应用缩放：改 wrap 的宽度，canvas 跟着 100% 铺满 */
function applyZoom() {
  const wrap = document.getElementById('wrap');
  const stage = document.getElementById('stage');
  if (!baseW) baseW = stage.clientWidth - 24; // 减去 padding
  const w = Math.round(baseW * zoom);
  wrap.style.width = w + 'px';
  document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
  // 尺寸变了，高亮重生
  if (selected) drawHighlight(selected, performance.now());
}

/**
 * 在覆盖层上画高亮。
 * 关键：框要**贴着**元素本身，不要用一个巨大的圆去盖住一个 20px 的字。
 * 文字类元素没有 w/h，就按「估算的字号」画一个窄框，并且**不打填充**
 * —— 填充会把下面的字盖掉，放大看时只剩一片红。
 */
function drawHighlight(sel, t) {
  if (!sel) { clearHL(); return; }
  const r = img.getBoundingClientRect();
  if (!r.width) return;
  hl.width = Math.round(r.width);
  hl.height = Math.round(r.height);
  const ctx = hl.getContext('2d');
  ctx.clearRect(0, 0, hl.width, hl.height);
  if (sel.x === null) return;

  // 脉冲：600ms 一轮，让框「呼吸」，一眼看得见
  const ph = (t % 620) / 620;
  const glow = 0.55 + 0.45 * Math.sin(ph * Math.PI * 2);

  const sx = r.width / 1920;
  const sy = r.height / 1080;
  const hasBox = (sel.w ?? 0) > 0 && (sel.h ?? 0) > 0;

  ctx.save();
  ctx.shadowColor = 'rgba(255,96,112,0.9)';
  ctx.shadowBlur = 14 * glow;
  ctx.strokeStyle = 'rgba(255,96,112,' + (0.7 + 0.3 * glow).toFixed(2) + ')';

  if (hasBox) {
    // 有尺寸的装置：框住即可，填充压到很淡
    const x = sel.x * sx;
    const y = sel.y * sy;
    const w = sel.w * sx;
    const h = sel.h * sy;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,96,112,0.07)';
    ctx.fillRect(x, y, w, h);
  } else {
    // 文字类：没有 w/h。按坐标点画一个**小十字 + 圈**，尺寸收紧到 9px，
    // 保证不遮住字；真正指示位置靠那根「引线 + 大标签」。
    const x = sel.x * sx;
    const y = sel.y * sy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 6 * sy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 6 * sy); ctx.lineTo(x + 16, y - 6 * sy);
    ctx.moveTo(x, y - 6 * sy - 16); ctx.lineTo(x, y - 6 * sy + 16);
    ctx.stroke();
  }

  // 标签：不压在被选元素上 —— 放在它上方 30px 的空白处，并拖一根引线
  const tag = sel.id;
  ctx.font = '600 14px monospace';
  const tw = ctx.measureText(tag).width + 12;
  const ax = sel.x * sx + (hasBox ? (sel.w * sx) / 2 : 0);
  const ay = sel.y * sy;
  let ty = ay - 34;
  if (ty < 22) ty = ay + (hasBox ? sel.h * sy : 0) + 40;
  const tx = Math.max(2, Math.min(hl.width - tw - 2, ax - tw / 2));

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,96,112,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay - 6 * sy);
  ctx.lineTo(ax, ty - 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,96,112,0.97)';
  ctx.fillRect(tx, ty - 17, tw, 21);
  ctx.fillStyle = '#0a0a0c';
  ctx.fillText(tag, tx + 6, ty - 2);
  ctx.restore();
}

function clearHL() {
  const ctx = hl.getContext('2d');
  ctx.clearRect(0, 0, hl.width, hl.height);
}

/** 循环动画：只在有选中时跑，省 CPU */
function tick() {
  if (selected) drawHighlight(selected, performance.now());
  requestAnimationFrame(tick);
}

function load() {
  const t = Number(scrub.value);
  tlabel.textContent = fmt(t);
  const qs = [];
  const off = [];
  for (const k of ["desk", "floor", "boxes"]) if (!LAYERS[k]) off.push(k);
  if (off.length) qs.push("off=" + off.join(","));
  if (BOARD_OFF.size) qs.push("boards=" + [...BOARD_OFF].join(","));
  if (FX_OFF.size) qs.push("fx=" + [...FX_OFF].join(","));
  img.src = "/frame?t=" + t.toFixed(2) + (qs.length ? "&" + qs.join("&") : "");
}

/** 图层面板：全局层 + 当前画板 + 特效 */
async function renderLayers() {
  const el = document.getElementById("layers");
  const t = Number(scrub.value);
  let liveBoards = [];
  try {
    const r = await fetch("/layers?t=" + t.toFixed(2));
    liveBoards = (await r.json()).boards;
  } catch (e) {
    liveBoards = [];
  }
  const rows = [];

  const mk = (key, label, checked, kind, extra) => {
    const offCls = checked ? "" : " off";
    return '<label class="lyr' + offCls + '" data-kind="' + kind + '" data-key="' + key + '">'
      + '<input type="checkbox" ' + (checked ? "checked" : "") + '>'
      + '<span class="name">' + label + '</span>'
      + '<span class="tag2">' + (extra || "") + '</span>'
      + '</label>';
  };

  rows.push('<div class="sec" style="margin-top:0">全局层</div>');
  rows.push(mk("desk", "背景 desk", LAYERS.desk, "global", "条纹/扫掠光"));
  rows.push(mk("floor", "地板 floor", LAYERS.floor, "global", "扫描带/浮尘"));
  rows.push(mk("boxes", "元素标注框", LAYERS.boxes, "global", "红框/ID"));
  rows.push('<div class="hint" style="padding:4px 6px;font-size:11px">'
    + '后期（颗粒/色散/暗角）由 ffmpeg 做，不在这里</div>');

  rows.push('<div class="sec">这一帧的画板</div>');
  if (!liveBoards.length) rows.push('<div class="hint" style="padding:4px 6px">（无）</div>');
  for (const b of liveBoards) {
    rows.push(mk(b.file, b.id, !BOARD_OFF.has(b.file), "board", b.file));
  }

  rows.push('<div class="sec">帧内特效</div>');
  for (const f of FX_LIST_PAGE) {
    rows.push(mk(f.name, f.label, !FX_OFF.has(f.name), "fx", f.where));
  }

  el.innerHTML = rows.join("");
  el.querySelectorAll(".lyr").forEach((row) => {
    const kind = row.dataset.kind;
    const key = row.dataset.key;
    row.onclick = (e) => {
      e.preventDefault();
      if (kind === "global") LAYERS[key] = !LAYERS[key];
      else if (kind === "board") BOARD_OFF.has(key) ? BOARD_OFF.delete(key) : BOARD_OFF.add(key);
      else FX_OFF.has(key) ? FX_OFF.delete(key) : FX_OFF.add(key);
      refreshAll();
    };
  });
}

/** 复制到剪贴板，并给个反馈 */
function copyText(text, btn) {
  navigator.clipboard.writeText(text);
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = "已复制 ✓";
  setTimeout(() => (btn.textContent = old), 1100);
}

/** 元素的一句话摘要：给复制用（也给 tooltip） */
function elSummary(it, t) {
  const pos = it.x === null ? "—" : it.x + "," + it.y + (it.w ? " " + it.w + "×" + it.h : "");
  return [
    "[" + it.id + "]",
    "时刻 " + fmt(t),
    "位置 " + pos,
    "装置 " + it.device,
    it.text ? "文案 “" + it.text + "”" : "",
    it.y !== null && it.y < 96 ? "⚠️ 贴顶" : "",
  ].filter(Boolean).join("  ");
}

/** 重新渲染 + 重新取图层清单（时间变了，在场的画板也会变） */
function refreshAll() {
  const t = Number(scrub.value);
  load();
  refreshList(t);
  renderLayers();
  refreshLyric(t);
}

fetch('/elements').then(r => r.json()).then(all => {
  countEl.textContent = (all && all.count != null ? all.count : '—') + ' 个元素（全片）';
});

function refreshList(t) {
  fetch('/live?t=' + t.toFixed(2)).then(r => r.json()).then(items => {
    live = items;
    // 换帧后，原来选中的元素可能已经不在场了
    if (selected && !items.some(x => x.id === selected.id)) selected = null;
    const cnt = document.getElementById('elcount');
    if (cnt) cnt.textContent = items.length ? '(' + items.length + ')' : '';
    if (!items.length) {
      listEl.innerHTML = '<div class="hint" style="padding:6px">这一帧没有登记的元素</div>';
      return;
    }
    listEl.innerHTML = items.map(it => {
      const pos = it.x === null ? '—' : it.x + ',' + it.y + (it.w ? '  ' + it.w + '×' + it.h : '');
      const risky = it.y !== null && it.y < 96;
      const sel = selected && selected.id === it.id;
      return '<div class="row' + (risky ? ' risky' : '') + (sel ? ' sel' : '') + '"'
        + ' data-id="' + it.id + '"'
        + ' title="' + elSummary(it, t) + '"'
        + '>'
        + '<div class="r1"><span class="id">' + it.id + '</span>'
        + '<span class="dev">' + it.device + '</span>'
        + (risky ? '<span class="warnTag">贴顶</span>' : '')
        + '</div>'
        + (it.text ? '<div class="rtext">“' + it.text + '”</div>' : '')
        + '<div class="pos">' + pos + '</div>'
        + '</div>';
    }).join('');

    listEl.querySelectorAll('.row').forEach(el => {
      const it = items.find(x => x.id === el.dataset.id);
      // 左键：选中 / 取消（并高亮）
      el.onclick = () => {
        const wasSel = selected && selected.id === it.id;
        selected = wasSel ? null : it;
        listEl.querySelectorAll('.row').forEach(r2 => r2.classList.remove('sel'));
        if (!wasSel) el.classList.add('sel');
        drawHighlight(selected, performance.now());
      };
      // 右键：复制这个元素的信息（ID / 时刻 / 位置 / 装置 / 文案）
      el.oncontextmenu = (e) => {
        e.preventDefault();
        el.classList.add('sel');
        selected = it;
        drawHighlight(it, performance.now());
        copyText(elSummary(it, t));
        const tip = document.getElementById('toast');
        tip.textContent = '已复制 ' + it.id + '（时刻 ' + fmt(t) + '，位置 '
          + (it.x === null ? '—' : it.x + ',' + it.y) + '）';
        tip.classList.add('show');
        clearTimeout(window.__toastT);
        window.__toastT = setTimeout(() => tip.classList.remove('show'), 1600);
      };
      el.onmouseenter = () => { if (!selected) drawHighlight(it, performance.now()); };
      el.onmouseleave = () => { if (!selected) drawHighlight(null, 0); };
    });
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { refreshAll(); }, 90);
}

scrub.addEventListener('input', () => {
  tlabel.textContent = fmt(Number(scrub.value));
  schedule();
});
document.getElementById('prev').onclick = () => { scrub.value = Math.max(0, Number(scrub.value) - 1); schedule(); };
document.getElementById('next').onclick = () => { scrub.value = Math.min(Number(scrub.max), Number(scrub.value) + 1); schedule(); };

// ---- 缩放 ----
function setZoom(z) {
  zoom = Math.max(0.25, Math.min(8, z));
  applyZoom();
}
document.getElementById('zoomIn').onclick = () => setZoom(zoom * 1.25);
document.getElementById('zoomOut').onclick = () => setZoom(zoom / 1.25);
document.getElementById('zoomFit').onclick = () => { zoom = 1; applyZoom(); };

// 滚轮缩放：在画面上滚 = 缩放；Ctrl/⌘ + 滚 = 也缩放（避免和页面滚动打架）
document.getElementById('stage').addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = zoom;
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoom = Math.max(0.25, Math.min(8, zoom * factor));
  // 让光标下的那一点尽量不动
  const stage = document.getElementById('stage');
  const rect = stage.getBoundingClientRect();
  const mx = e.clientX - rect.left + stage.scrollLeft;
  const my = e.clientY - rect.top + stage.scrollTop;
  const ratio = zoom / before;
  applyZoom();
  stage.scrollLeft = mx * ratio - (e.clientX - rect.left);
  stage.scrollTop = my * ratio - (e.clientY - rect.top);
}, { passive: false });

// 拖动画面平移（放大后很有用）
(function enablePan() {
  const stage = document.getElementById('stage');
  let down = false, sx0 = 0, sy0 = 0, sl = 0, st = 0;
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = true; sx0 = e.clientX; sy0 = e.clientY;
    sl = stage.scrollLeft; st = stage.scrollTop;
    stage.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    stage.scrollLeft = sl - (e.clientX - sx0);
    stage.scrollTop = st - (e.clientY - sy0);
  });
  window.addEventListener('mouseup', () => { down = false; stage.style.cursor = ''; });
})();
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { scrub.value = Math.max(0, Number(scrub.value) - (e.shiftKey ? 0.1 : 1)); schedule(); }
  if (e.key === 'ArrowRight') { scrub.value = Math.min(Number(scrub.max), Number(scrub.value) + (e.shiftKey ? 0.1 : 1)); schedule(); }
});
document.getElementById('copy').onclick = () => {
  const t = Number(scrub.value);
  const lines = ['时刻 ' + fmt(t) + ' 的元素：', ...live.map(it =>
    it.id + '  ' + it.device + '  (' + it.x + ',' + it.y + ')' + (it.w ? ' ' + it.w + '×' + it.h : '') +
    (it.text ? '  “' + it.text + '”' : ''))];
  navigator.clipboard.writeText(lines.join('\\n'));
  document.getElementById('copy').textContent = '已复制 ✓';
  setTimeout(() => document.getElementById('copy').textContent = '复制此刻清单', 1200);
};

// 支持 ?t=118.4 直接落在某一刻（链接可分享 / 方便截图）
(function initTime() {
  const q = new URLSearchParams(location.search).get('t');
  if (q !== null && isFinite(Number(q))) {
    scrub.value = Math.max(0, Math.min(Number(scrub.max), Number(q)));
  }
})();
tlabel.textContent = fmt(Number(scrub.value));
load(); refreshList(Number(scrub.value)); renderLayers(); refreshLyric(Number(scrub.value));
applyZoom();
tick();

// 图片换帧后，高亮要跟着重画（图片尺寸/内容变了）
img.addEventListener('load', () => {
  if (selected) drawHighlight(selected, performance.now());
});
window.addEventListener('resize', () => {
  baseW = 0;          // 重新量一次基准宽度
  applyZoom();
  if (selected) drawHighlight(selected, performance.now());
});
</script></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(PAGE.replace("__FX_LIST__", JSON.stringify(FX_LIST)));
    }
    if (url.pathname === "/elements") {
      // 全片元素数：抽 16 帧取并集（运行时登记，静态扫描数不准了）；结果缓存
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ note: "运行时登记·16 帧抽样并集", count: allElementCount() }));
    }
    if (url.pathname === "/lyric") {
      const sec = Number(url.searchParams.get("t")) || 0;
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(lyricAt(sec)));
    }
    if (url.pathname === "/live") {
      const sec = Number(url.searchParams.get("t")) || 0;
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(probeAt(sec).live));
    }
    if (url.pathname === "/layers") {
      // 这一帧的画板清单 + env + 段落（给图层面板用）
      const sec = Number(url.searchParams.get("t")) || 0;
      const p = probeAt(sec);
      const liveBoards = p.boards.map((b) => ({ file: b.file, id: b.id, env: b.env }));
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ boards: liveBoards, fx: FX_LIST, section: p.section }));
    }
    if (url.pathname === "/frame") {
      const sec = Number(url.searchParams.get("t")) || 0;
      // 图层开关从 query 传进来：off=desk,floor  boards=id1,id2  fx=name1,name2
      const offList = (url.searchParams.get("off") || "").split(",").filter(Boolean);
      const boardOff = (url.searchParams.get("boards") || "").split(",").filter(Boolean);
      const fxOff = (url.searchParams.get("fx") || "").split(",").filter(Boolean);
      const boards = {};
      for (const b of boardOff) boards[b] = false;
      const fx = {};
      for (const n of fxOff) fx[n] = true;
      const { png } = renderAt(sec, {
        desk: !offList.includes("desk"),
        floor: !offList.includes("floor"),
        boxes: !offList.includes("boxes"),
        boards: boardOff.length ? boards : null,
        fx: fxOff.length ? fx : null,
      });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      return res.end(png);
    }
    res.writeHead(404);
    res.end("not found");
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("渲染出错：" + e.message);
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("══════════════════════════════════════════════");
  console.log("  元素检查器已启动");
  console.log(`  在浏览器打开： http://localhost:${PORT}`);
  console.log("  拖时间滑块看任意时刻；黄色框 = 贴顶风险");
  console.log("  按 Ctrl+C 结束");
  console.log("══════════════════════════════════════════════");
});
