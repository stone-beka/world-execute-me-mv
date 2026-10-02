/**
 * scene-view.js — P1 只读预览器的纯函数部分（可测）
 *
 * buildInfo：把 scene + 歌词/段落（+ 画板区间）整理成页面需要的 JSON。
 * renderPage：把 info 变成一个自包含的 HTML（内联 CSS/JS，无外部依赖）。
 *
 * 页面只做两件事：拖时间轴 / 看画面与清单。**不能编辑**。
 */
import { ts } from "../../src/core/render.js";
import { lyrics } from "../../src/core/lyrics.js";
import { sections } from "../../src/core/timeline.js";

export function buildInfo(scene, opt = {}) {
  const lyr = opt.lyrics ?? lyrics;
  const secs = opt.sections ?? sections;
  const boardRanges = opt.boardRanges ?? null;

  const lyricMarkers = (lyr && !lyr.empty ? lyr.lines : []).map((l) => ({
    startMs: l.start,
    endMs: l.end,
    text: l.text,
  }));
  const sectionMarkers = (secs ?? []).map((s) => ({
    startMs: s.startMs,
    endMs: s.endMs,
    name: s.name ?? `s${s.index ?? ""}`,
  }));

  return {
    id: scene.id,
    title: scene.title,
    durationMs: scene.durationMs,
    fps: opt.fps ?? ts.fps,
    width: opt.width ?? ts.width,
    height: opt.height ?? ts.height,
    boards: (scene.boards ?? []).map((id) => {
      const r = boardRanges ? boardRanges.find((x) => x.id === id) : null;
      return { id, startMs: r ? r.startMs : null, endMs: r ? r.endMs : null };
    }),
    elements: scene.elements.map((e) => ({
      id: e.id,
      block: e.block,
      z: e.z,
      notes: e.notes,
      inMs: e.life.inMs,
      outMs: e.life.outMs,
    })),
    markers: { lyrics: lyricMarkers, sections: sectionMarkers },
  };
}

export function renderPage(info) {
  const data = JSON.stringify(info);
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>场景预览 — ${esc(info.title || info.id)}</title><style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:#0a0a0c;color:#e9e9ec;display:flex;flex-direction:column;
       overflow:hidden;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace}
  header{flex:0 0 auto;padding:9px 16px;border-bottom:1px solid #2a2a30;display:flex;
         gap:14px;align-items:center;flex-wrap:wrap}
  h1{font-size:14px;margin:0;font-weight:600}
  .badge{background:#222228;padding:2px 8px;border-radius:10px;color:#8b8b93}
  .now{display:flex;gap:14px;align-items:center;flex-wrap:wrap;color:#c8f0e8}
  .now .k{color:#6b6b73}
  main{display:grid;grid-template-columns:1fr 340px;flex:1 1 auto;min-height:0}
  #stage{display:flex;align-items:center;justify-content:center;padding:12px;min-height:0;background:#060608}
  #view{max-width:100%;max-height:100%;display:block;border:1px solid #2a2a30}
  aside{border-left:1px solid #2a2a30;overflow:auto;padding:12px;min-height:0}
  .sec{margin:12px 0 6px;color:#8b8b93;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  .sec:first-child{margin-top:0}
  .item{padding:6px 8px;border-radius:5px;border:1px solid transparent}
  .item.on{background:#15261c;border-color:#2f6b47}
  .item .id{color:#7ce0a8;font-weight:600}
  .item .meta{color:#6b6b73;font-size:11px}
  .item .note{color:#c8c8d0;margin-top:2px;white-space:pre-wrap}
  footer{flex:0 0 auto;padding:10px 16px;border-top:1px solid #2a2a30}
  #ticks{position:relative;height:12px;margin:0 0 6px}
  #ticks .tick{position:absolute;top:0;height:12px;width:1px;background:#3a3a44}
  #ticks .tick.s{background:#6b5a00}
  #ticks .tick.l{background:#2f6b47}
  .scrubrow{display:flex;gap:12px;align-items:center}
  input[type=range]{flex:1}
  time{font-variant-numeric:tabular-nums;color:#c8f0e8;min-width:78px}
  button{background:#222228;color:#fff;border:0;border-radius:4px;padding:5px 12px;font:inherit;cursor:pointer}
  .hint{color:#6b6b73;font-size:11px}
</style></head><body>
<header>
  <h1>场景预览 · ${esc(info.title || info.id)}</h1>
  <span class="badge">${esc(info.id)}</span>
  <span class="now"><span class="k">段落</span><span id="seclabel">—</span></span>
  <span class="now"><span class="k">歌词</span><span id="lyrlabel">—</span></span>
  <span class="hint">只读预览 · ← → 选帧（Shift 微调）· 服务端出帧</span>
</header>
<main>
  <div id="stage"><img id="view" alt="frame"></div>
  <aside>
    <div class="sec">画板层（旧片）<span id="bcount"></span></div>
    <div id="boards"></div>
    <div class="sec">声明式元素<span id="ecount"></span></div>
    <div id="elements"></div>
  </aside>
</main>
<footer>
  <div id="ticks"></div>
  <div class="scrubrow">
    <time id="tlabel">0:00.00</time>
    <input type="range" id="scrub" min="0" max="${info.durationMs}" step="1" value="0">
    <button id="b1">◀ 1s</button>
    <button id="b2">1s ▶</button>
  </div>
</footer>
<script>
window.__INFO__ = ${data};
(function () {
  var INFO = window.__INFO__;
  var img = document.getElementById('view');
  var slider = document.getElementById('scrub');
  var tlabel = document.getElementById('tlabel');
  var secEl = document.getElementById('seclabel');
  var lyrEl = document.getElementById('lyrlabel');
  var boardsEl = document.getElementById('boards');
  var elemsEl = document.getElementById('elements');
  var timer = null;

  function fmt(ms) {
    var s = ms / 1000, m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
  }
  function hit(list, ms) {
    for (var i = 0; i < list.length; i++) if (ms >= list[i].startMs && ms < list[i].endMs) return list[i];
    return null;
  }
  function activeBoard(b, ms) { return b.startMs != null && ms >= b.startMs && ms < b.endMs; }
  function activeEl(e, ms) { return ms >= e.inMs && ms < e.outMs; }

  function listHTML(items, activeFn, classify) {
    return items.map(function (it) {
      var cls = activeFn(it) ? ' on' : '';
      return '<div class="item' + cls + '" data-id="' + it.id + '">' +
        '<div><span class="id">' + it.id + '</span> <span class="meta">' + classify(it) + '</span></div>' +
        (it.notes ? '<div class="note">' + esc(it.notes) + '</div>' : '') + '</div>';
    }).join('');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildLists() {
    boardsEl.innerHTML = INFO.boards.length
      ? listHTML(INFO.boards, function (b) { return activeBoard(b, Number(slider.value)); },
          function (b) { return b.startMs == null ? '' : fmt(b.startMs) + '–' + fmt(b.endMs); })
      : '<div class="hint">（无画板层）</div>';
    elemsEl.innerHTML = INFO.elements.length
      ? listHTML(INFO.elements, function (e) { return activeEl(e, Number(slider.value)); },
          function (e) { return e.block + ' · z=' + e.z + ' · ' + fmt(e.inMs) + '–' + fmt(e.outMs); })
      : '<div class="hint">（无声明式元素）</div>';
    document.getElementById('bcount').textContent = INFO.boards.length ? ' (' + INFO.boards.length + ')' : '';
    document.getElementById('ecount').textContent = INFO.elements.length ? ' (' + INFO.elements.length + ')' : '';
  }

  function buildTicks() {
    var wrap = document.getElementById('ticks');
    var html = '';
    var D = INFO.durationMs || 1;
    INFO.markers.sections.forEach(function (s) {
      html += '<div class="tick s" style="left:' + (s.startMs / D * 100) + '%" title="' + esc(s.name) + '"></div>';
    });
    INFO.markers.lyrics.forEach(function (l) {
      html += '<div class="tick l" style="left:' + (l.startMs / D * 100) + '%" title="' + esc(l.text) + '"></div>';
    });
    wrap.innerHTML = html;
  }

  function render(path) {
    var ms = Number(slider.value);
    tlabel.textContent = fmt(ms);
    var sec = hit(INFO.markers.sections, ms);
    secEl.textContent = sec ? sec.name : '—';
    var lyr = hit(INFO.markers.lyrics, ms);
    lyrEl.textContent = lyr ? lyr.text : '（器乐 / 无词）';
    buildLists();
    img.src = '/frame?ms=' + ms;
  }

  function seek(ms) {
    ms = Math.max(0, Math.min(INFO.durationMs - 1, ms));
    slider.value = String(ms);
    render();
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 30);
  }

  slider.addEventListener('input', schedule);
  document.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 10 : Math.round(1000 / (INFO.fps || 60));
    if (e.key === 'ArrowLeft') { seek(Number(slider.value) - step); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { seek(Number(slider.value) + step); e.preventDefault(); }
  });
  document.getElementById('b1').onclick = function () { seek(Number(slider.value) - 1000); };
  document.getElementById('b2').onclick = function () { seek(Number(slider.value) + 1000); };
  document.getElementById('ticks').addEventListener('click', function (e) {
    var r = this.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width * INFO.durationMs);
  });

  buildTicks();
  render();
})();
</script>
</body></html>`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
