/**
 * editor-page.js — P2 编辑器页面（自包含 HTML，内联 CSS/JS）
 *
 * 能力（v1）：放置元素 / 选中 / 拖动改位置 / 改属性·参数·生命期·备注 /
 *            增删轨迹（直线·环绕·曲线·缩放）与特效（辉光）/ 拖时间轴实时看 / 保存。
 * 不含嵌套/组（P2.5）。
 */
export function renderEditorPage({ scene, info, blocks }) {
  const data = JSON.stringify({ scene, info, blocks });
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>场景编辑器 — ${esc(info.title || info.id)}</title><style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:#0a0a0c;color:#e9e9ec;display:flex;flex-direction:column;
       overflow:hidden;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace}
  header{flex:0 0 auto;padding:8px 14px;border-bottom:1px solid #2a2a30;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  h1{font-size:13px;margin:0;font-weight:600}
  .badge{background:#222228;padding:2px 8px;border-radius:10px;color:#8b8b93}
  button{background:#222228;color:#fff;border:0;border-radius:4px;padding:4px 10px;font:inherit;cursor:pointer}
  button.p{background:#1e40d8}
  button.p:hover{background:#2a52f0}
  button.sm{padding:2px 7px}
  button.x{background:#3a1a22;color:#ff9aa8}
  .grow{flex:1}
  main{display:grid;grid-template-columns:170px 1fr 300px;flex:1 1 auto;min-height:0}
  .col{min-height:0;overflow:auto;padding:10px}
  .left{border-right:1px solid #2a2a30}
  .right{border-left:1px solid #2a2a30}
  #stage{position:relative;display:flex;align-items:center;justify-content:center;padding:10px;background:#060608;min-height:0}
  #wrap{position:relative;line-height:0}
  #view{max-width:100%;max-height:100%;display:block;border:1px solid #2a2a30}
  #ov{position:absolute;left:0;top:0;pointer-events:none}
  .sec{margin:10px 0 5px;color:#8b8b93;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
  .sec:first-child{margin-top:0}
  .tpl{display:block;width:100%;text-align:left;margin:3px 0}
  .row{display:flex;gap:6px;align-items:center;margin:3px 0}
  .row label{flex:0 0 62px;color:#8b8b93}
  .row input,.row select{flex:1;min-width:0;background:#141418;border:1px solid #2a2a30;color:#e9e9ec;
                         border-radius:4px;padding:3px 5px;font:inherit}
  .row input[type=color]{padding:0;height:22px}
  .track{border:1px solid #2a2a30;border-radius:5px;padding:6px;margin:5px 0;background:#101014}
  .track .h{display:flex;align-items:center;gap:6px;margin-bottom:4px}
  .track .h b{color:#7ce0a8;font-size:11px}
  .note{color:#c8c8d0;white-space:pre-wrap}
  footer{flex:0 0 auto;padding:8px 14px;border-top:1px solid #2a2a30}
  #ticks{position:relative;height:10px;margin-bottom:5px}
  #ticks .t{position:absolute;top:0;height:10px;width:1px;background:#3a3a44}
  #ticks .t.s{background:#6b5a00}
  #ticks .t.l{background:#2f6b47}
  .scrubrow{display:flex;gap:10px;align-items:center}
  input[type=range]{flex:1}
  time{font-variant-numeric:tabular-nums;color:#c8f0e8;min-width:74px}
  .hint{color:#6b6b73;font-size:11px}
  #toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);
         background:#1e40d8;color:#fff;padding:6px 14px;border-radius:5px;opacity:0;
         transition:opacity .15s;pointer-events:none}
  #toast.show{opacity:1}
  #toast.bad{background:#7a1a2a}
</style></head><body>
<header>
  <h1>场景编辑器 · ${esc(info.title || info.id)}</h1>
  <span class="badge">${esc(info.id)}</span>
  <span class="hint" id="selInfo">未选中</span>
  <span class="grow"></span>
  <span class="hint">段落 <b id="seclabel">—</b> · 歌词 <b id="lyrlabel">—</b></span>
  <button class="p" id="save">保存</button>
</header>
<main>
  <div class="col left">
    <div class="sec">加元素</div>
    <div id="palette"></div>
    <div class="sec">加轨迹（选中元素）</div>
    <div id="addTracks"></div>
    <div class="sec">说明</div>
    <div class="hint">点模板 → 在画面点一下放下。点元素选中，拖动画面改位置。改完点保存。</div>
  </div>
  <div id="stage">
    <div id="wrap"><img id="view" alt="frame"><canvas id="ov"></canvas></div>
  </div>
  <div class="col right">
    <div class="sec">属性</div>
    <div id="props"><div class="hint">（选一个元素）</div></div>
    <div class="sec">轨迹 / 特效</div>
    <div id="tracks"><div class="hint">（未选中）</div></div>
  </div>
</main>
<footer>
  <div id="ticks"></div>
  <div class="scrubrow">
    <time id="tlabel">0:00.00</time>
    <input type="range" id="scrub" min="0" max="${info.durationMs}" step="1" value="0">
    <button class="sm" id="b1">◀1s</button>
    <button class="sm" id="b2">1s▶</button>
  </div>
</footer>
<div id="toast"></div>
<script>
window.__DATA__ = ${data};
(function () {
  var D = window.__DATA__;
  var SCENE = D.scene, INFO = D.info, BLOCKS = D.blocks;
  var fps = INFO.fps || 60;
  var ms = 0, sel = null, resolved = [], drag = null, pending = null;

  var img = document.getElementById('view');
  var ov = document.getElementById('ov');
  var slider = document.getElementById('scrub');

  function fmt(t) { var s = t / 1000, m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function byId(id) { for (var i=0;i<SCENE.elements.length;i++) if (SCENE.elements[i].id===id) return SCENE.elements[i]; return null; }
  function curEl() { return sel ? byId(sel) : null; }
  function setPath(o, path, v) { var p = path.split('.'); for (var i=0;i<p.length-1;i++) { if (o[p[i]]==null) o[p[i]]={}; o=o[p[i]]; } o[p[p.length-1]]=v; }
  function toast(msg, bad) { var t=document.getElementById('toast'); t.textContent=msg; t.className=bad?'show bad':'show'; setTimeout(function(){t.className='';},1400); }
  function uid(prefix) { var n=1, base=prefix; while (byId(base)) { n++; base=prefix+'-'+n; } return base; }

  function currentSection(t){ for(var i=0;i<INFO.markers.sections.length;i++){var s=INFO.markers.sections[i]; if(t>=s.startMs&&t<s.endMs) return s;} return null; }
  function currentLyric(t){ for(var i=0;i<INFO.markers.lyrics.length;i++){var l=INFO.markers.lyrics[i]; if(t>=l.startMs&&t<l.endMs) return l;} return null; }

  // ---- 覆盖层：元素框 + 选中高亮 ----
  function syncOverlaySize() {
    var r = img.getBoundingClientRect();
    if (!r.width) return false;
    ov.width = Math.round(r.width); ov.height = Math.round(r.height);
    ov.style.width = r.width + 'px'; ov.style.height = r.height + 'px';
    return true;
  }
  function drawOverlay() {
    if (!syncOverlaySize()) return;
    var sx = ov.width / INFO.width, sy = ov.height / INFO.height;
    var ctx = ov.getContext('2d');
    ctx.clearRect(0,0,ov.width,ov.height);
    resolved.forEach(function (it) {
      if (!it.visible) return;
      ctx.save();
      ctx.lineWidth = it.id===sel ? 2.5 : 1;
      ctx.strokeStyle = it.id===sel ? 'rgba(255,96,112,.95)' : 'rgba(120,200,160,.35)';
      var x = it.x*sx, y = it.y*sy;
      if (it.size && it.size.w) {
        var w = it.size.w*it.scale*sx, h = it.size.h*it.scale*sy;
        ctx.strokeRect(x-w/2, y-h/2, w, h);
      } else {
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI*2); ctx.stroke();
      }
      if (it.id===sel) {
        ctx.fillStyle='rgba(255,96,112,.97)'; ctx.font='600 12px monospace';
        var tw=ctx.measureText(it.id).width+8;
        ctx.fillRect(x+8, y-24, tw, 16); ctx.fillStyle='#0a0a0c';
        ctx.fillText(it.id, x+12, y-12);
      }
      ctx.restore();
    });
  }
  function toCanvas(clientX, clientY) {
    var r = img.getBoundingClientRect();
    return { x: (clientX - r.left)/r.width*INFO.width, y: (clientY - r.top)/r.height*INFO.height };
  }
  function hitTest(cx, cy) {
    var hits = resolved.filter(function (it) {
      if (!it.visible) return false;
      var hw = it.size && it.size.w ? it.size.w*it.scale/2 : 40;
      var hh = it.size && it.size.h ? it.size.h*it.scale/2 : 40;
      return cx >= it.x-hw && cx <= it.x+hw && cy >= it.y-hh && cy <= it.y+hh;
    });
    hits.sort(function (a,b){ return (a.z||0)-(b.z||0); });
    return hits.length ? hits[hits.length-1].id : null;
  }

  // ---- 属性面板 ----
  function numRow(label, elId, f, val, ti) {
    return '<div class="row"><label>'+label+'</label><input type="number" step="any" '+
      'data-el="'+elId+'" '+(ti!=null?'data-ti="'+ti+'" ':'')+'data-f="'+f+'" value="'+val+'"></div>';
  }
  function textRow(label, elId, f, val, ti) {
    return '<div class="row"><label>'+label+'</label><input type="text" '+
      'data-el="'+elId+'" '+(ti!=null?'data-ti="'+ti+'" ':'')+'data-f="'+f+'" value="'+esc(val)+'"></div>';
  }
  function colorRow(label, elId, f, val, ti) {
    return '<div class="row"><label>'+label+'</label><input type="color" '+
      'data-el="'+elId+'" '+(ti!=null?'data-ti="'+ti+'" ':'')+'data-f="'+f+'" value="'+(val||'#ffffff')+'"></div>';
  }
  function paramRows(el, block, ti) {
    var out = '', schema = block && block.params ? block.params : {};
    Object.keys(schema).forEach(function (k) {
      var d = schema[k], v = el.params && el.params[k] != null ? el.params[k] : d.default;
      if (d.type === 'color') out += colorRow(k, el.id, 'params.'+k, v, ti);
      else if (d.type === 'string') out += textRow(k, el.id, 'params.'+k, v, ti);
      else out += numRow(k, el.id, 'params.'+k, (v==null?'':v), ti);
    });
    return out;
  }
  function renderProps() {
    var p = document.getElementById('props');
    var el = curEl();
    if (!el) { p.innerHTML = '<div class="hint">（选一个元素）</div>'; document.getElementById('selInfo').textContent='未选中'; return; }
    document.getElementById('selInfo').textContent = '选中 ' + el.id + '（' + el.block + '）';
    var block = null;
    for (var i=0;i<BLOCKS.elements.length;i++) if (BLOCKS.elements[i].name===el.block) block=BLOCKS.elements[i];
    var h = '';
    h += '<div class="row"><label>id</label><input type="text" data-el="'+el.id+'" data-f="id" value="'+esc(el.id)+'"></div>';
    h += '<div class="hint">block = '+esc(el.block)+'</div>';
    h += numRow('x', el.id, 'at.x', el.at.x);
    h += numRow('y', el.id, 'at.y', el.at.y);
    h += numRow('scale', el.id, 'at.scale', el.at.scale);
    h += numRow('rot', el.id, 'at.rot', el.at.rot);
    h += numRow('alpha', el.id, 'at.alpha', el.at.alpha);
    h += numRow('z', el.id, 'z', el.z);
    h += '<div class="sec">参数</div>' + paramRows(el, block, null);
    h += '<div class="sec">生命期</div>';
    h += numRow('inMs', el.id, 'life.inMs', el.life.inMs);
    h += numRow('outMs', el.id, 'life.outMs', el.life.outMs);
    h += numRow('fadeIn', el.id, 'life.fadeInMs', el.life.fadeInMs);
    h += numRow('fadeOut', el.id, 'life.fadeOutMs', el.life.fadeOutMs);
    h += '<div class="row"><button class="sm" id="lifeIn">进场=此刻</button><button class="sm" id="lifeOut">退场=此刻</button></div>';
    h += '<div class="sec">备注（给我看）</div>';
    h += '<div class="row"><textarea data-el="'+el.id+'" data-f="notes" rows="2" style="width:100%;background:#141418;border:1px solid #2a2a30;color:#e9e9ec;border-radius:4px;font:inherit">'+esc(el.notes)+'</textarea></div>';
    h += '<div class="row"><button class="x" id="delEl">删除元素</button></div>';
    p.innerHTML = h;
    var li=document.getElementById('lifeIn'), lo=document.getElementById('lifeOut');
    if (li) li.onclick=function(){ el.life.inMs=Math.round(ms); renderProps(); refreshFrame(); };
    if (lo) lo.onclick=function(){ el.life.outMs=Math.round(ms); renderProps(); refreshFrame(); };
    var de=document.getElementById('delEl');
    if (de) de.onclick=function(){ SCENE.elements = SCENE.elements.filter(function(x){return x.id!==el.id;}); sel=null; renderProps(); renderTracks(); refreshFrame(); };
  }

  // ---- 轨迹 ----
  function fxSchema(name){ for(var i=0;i<BLOCKS.fx.length;i++) if(BLOCKS.fx[i].name===name) return BLOCKS.fx[i]; return null; }
  function renderTracks() {
    var c = document.getElementById('tracks');
    var el = curEl();
    if (!el) { c.innerHTML = '<div class="hint">（未选中）</div>'; return; }
    var h = '';
    el.tracks.forEach(function (tr, i) {
      h += '<div class="track"><div class="h"><b>'+(tr.kind==='fx'?('fx:'+tr.block):tr.kind)+'</b><span class="grow"></span>'+
           '<button class="sm x" data-del-tr="'+i+'">删</button></div>';
      if (tr.kind === 'fx') { h += '<div class="hint">特效块 '+esc(tr.block)+'</div>'; }
      if (tr.kind === 'move') {
        h += '<div class="row"><label>path</label><select data-el="'+el.id+'" data-ti="'+i+'" data-f="path">'+
             ['line','orbit','curve'].map(function(p){return '<option value="'+p+'"'+(tr.path===p?' selected':'')+'>'+p+'</option>';}).join('')+'</select></div>';
        h += numRow('from.x', el.id, 'from.x', tr.from?tr.from.x:0, i);
        h += numRow('from.y', el.id, 'from.y', tr.from?tr.from.y:0, i);
        h += numRow('to.x', el.id, 'to.x', tr.to?tr.to.x:0, i);
        h += numRow('to.y', el.id, 'to.y', tr.to?tr.to.y:0, i);
        if (tr.path==='orbit') { h += numRow('center.x', el.id, 'center.x', tr.center?tr.center.x:0, i); h += numRow('center.y', el.id, 'center.y', tr.center?tr.center.y:0, i); h += numRow('sweep', el.id, 'sweep', tr.sweep!=null?tr.sweep:360, i); }
        if (tr.path==='curve') { h += numRow('via.x', el.id, 'via.x', tr.via?tr.via.x:0, i); h += numRow('via.y', el.id, 'via.y', tr.via?tr.via.y:0, i); }
      }
      if (tr.kind === 'scale') { h += numRow('from', el.id, 'from', tr.from, i); h += numRow('to', el.id, 'to', tr.to, i); }
      h += numRow('startMs', el.id, 'startMs', tr.startMs, i);
      h += numRow('durMs', el.id, 'durMs', tr.durMs, i);
      if (tr.kind !== 'fx') h += '<div class="row"><label>ease</label><select data-el="'+el.id+'" data-ti="'+i+'" data-f="ease">'+
        ['linear','in','out','inout','quint','expo','back'].map(function(e){return '<option value="'+e+'"'+(tr.ease===e?' selected':'')+'>'+e+'</option>';}).join('')+'</select></div>';
      if (tr.kind === 'fx') { var s=fxSchema(tr.block); if (s) h += paramRows({id:el.id, params:tr.params}, s, i).replace(/data-f="params\./g,'data-f="params.'); }
      h += '</div>';
    });
    c.innerHTML = h || '<div class="hint">（无轨迹）</div>';
    c.querySelectorAll('[data-del-tr]').forEach(function (b) {
      b.onclick = function () { el.tracks.splice(Number(b.dataset.delTr),1); renderTracks(); refreshFrame(); };
    });
  }
  function addTrack(kind, path) {
    var el = curEl(); if (!el) { toast('先选一个元素', true); return; }
    if (kind === 'move') el.tracks.push({ kind:'move', path:path, from:{x:el.at.x,y:el.at.y}, to:{x:el.at.x+300,y:el.at.y}, center:{x:el.at.x+150,y:el.at.y+120}, via:{x:el.at.x+150,y:el.at.y-160}, sweep:360, startMs:Math.round(ms), durMs:1000, ease:'inout' });
    else if (kind === 'scale') el.tracks.push({ kind:'scale', from:1, to:0.5, startMs:Math.round(ms), durMs:1000, ease:'out' });
    else if (kind === 'fx') el.tracks.push({ kind:'fx', block:(BLOCKS.fx[0]&&BLOCKS.fx[0].name)||'glow', startMs:Math.round(ms), durMs:1000, params:{} });
    renderTracks(); refreshFrame();
  }

  // ---- 调色板 ----
  function renderPalette() {
    var p = document.getElementById('palette'); var lastAdd = null;
    p.innerHTML = BLOCKS.elements.map(function (b) { return '<button class="tpl" data-add="'+b.name+'">＋ '+b.name+'</button>'; }).join('');
    p.querySelectorAll('[data-add]').forEach(function (btn) { btn.onclick = function () { pending = btn.dataset.add; toast('在画面点一下放下「'+pending+'」'); }; });
    var t = document.getElementById('addTracks');
    t.innerHTML = '<button class="tpl" id="tm-line">＋ 直线轨迹</button><button class="tpl" id="tm-orbit">＋ 环绕轨迹</button><button class="tpl" id="tm-curve">＋ 曲线轨迹</button><button class="tpl" id="tm-scale">＋ 缩放</button><button class="tpl" id="tm-fx">＋ 特效</button>';
    document.getElementById('tm-line').onclick=function(){addTrack('move','line');};
    document.getElementById('tm-orbit').onclick=function(){addTrack('move','orbit');};
    document.getElementById('tm-curve').onclick=function(){addTrack('move','curve');};
    document.getElementById('tm-scale').onclick=function(){addTrack('scale');};
    document.getElementById('tm-fx').onclick=function(){addTrack('fx');};
  }
  function addElement(blockName, cx, cy) {
    var b=null; for(var i=0;i<BLOCKS.elements.length;i++) if(BLOCKS.elements[i].name===blockName) b=BLOCKS.elements[i];
    var params={}; if(b&&b.params) Object.keys(b.params).forEach(function(k){ if(b.params[k].default!=null) params[k]=b.params[k].default; });
    var el={ id:uid(blockName), block:blockName, params:params, at:{x:Math.round(cx),y:Math.round(cy),scale:1,rot:0,alpha:1},
             life:{inMs:0,outMs:SCENE.durationMs,fadeInMs:200,fadeOutMs:200}, tracks:[], z:0, notes:'' };
    SCENE.elements.push(el); sel=el.id; renderProps(); renderTracks(); refreshFrame();
  }

  // ---- 刷新 ----
  function refreshResolve(cb) {
    fetch('/resolve?ms='+Math.round(ms)).then(function(r){return r.json();}).then(function(d){ resolved=d.items; if(cb)cb(); }).catch(function(){});
  }
  function refreshFrame() {
    img.src='/frame?ms='+Math.round(ms);
    document.getElementById('tlabel').textContent=fmt(ms);
    var s=currentSection(ms), l=currentLyric(ms);
    document.getElementById('seclabel').textContent = s? s.name:'—';
    document.getElementById('lyrlabel').textContent = l? l.text:'（器乐）';
    refreshResolve(drawOverlay);
  }
  function rebuild() { renderProps(); renderTracks(); refreshFrame(); }

  // ---- 字段编辑（change 事件，避免打字丢焦点）----
  document.addEventListener('change', function (e) {
    var t=e.target; var f=t.dataset && t.dataset.f; if(!f) return;
    var el=byId(t.dataset.el); if(!el) return;
    var v = t.type==='number' ? Number(t.value) : t.value;
    if (t.dataset.ti != null) { setPath(el.tracks[Number(t.dataset.ti)], f, v); }
    else { setPath(el, f, v); if (f==='id') { sel=el.id; } }
    refreshFrame();
  });

  // ---- 画布交互 ----
  document.getElementById('stage').addEventListener('mousedown', function (e) {
    var c=toCanvas(e.clientX,e.clientY);
    if (pending) { addElement(pending, c.x, c.y); pending=null; return; }
    var hit=hitTest(c.x,c.y);
    if (hit) {
      sel=hit; renderProps(); renderTracks();
      var el=byId(hit); drag={ id:hit, sx:c.x, sy:c.y, ax:el.at.x, ay:el.at.y, moved:false };
      drawOverlay();
    } else { sel=null; renderProps(); renderTracks(); drawOverlay(); }
  });
  document.addEventListener('mousemove', function (e) {
    if (!drag) return;
    var c=toCanvas(e.clientX,e.clientY);
    var el=byId(drag.id); if(!el) return;
    el.at.x=Math.round(drag.ax + (c.x-drag.sx));
    el.at.y=Math.round(drag.ay + (c.y-drag.sy));
    drag.moved=true;
    // 同步 resolved，让框跟着走
    resolved.forEach(function(it){ if(it.id===drag.id){ it.x=el.at.x; it.y=el.at.y; } });
    drawOverlay();
  });
  document.addEventListener('mouseup', function () {
    if (!drag) return; var moved=drag.moved; drag=null;
    if (moved) { if (sel) { renderProps(); } refreshFrame(); }
  });

  // ---- 时间轴 ----
  function seek(t){ t=Math.max(0,Math.min(INFO.durationMs-1,t)); slider.value=String(t); ms=t; refreshFrame(); }
  slider.addEventListener('input', function(){ ms=Number(slider.value); if(pending===undefined){} if(timer)clearTimeout(timer); timer=setTimeout(refreshFrame,30); });
  var timer=null;
  document.addEventListener('keydown', function(e){ var step=e.shiftKey?10:Math.round(1000/fps); if(e.key==='ArrowLeft'){seek(ms-step);e.preventDefault();} else if(e.key==='ArrowRight'){seek(ms+step);e.preventDefault();} });
  document.getElementById('b1').onclick=function(){seek(ms-1000);};
  document.getElementById('b2').onclick=function(){seek(ms+1000);};

  function buildTicks(){ var w=document.getElementById('ticks'), h='', D=INFO.durationMs||1;
    INFO.markers.sections.forEach(function(s){h+='<div class="t s" style="left:'+(s.startMs/D*100)+'%" title="'+esc(s.name)+'"></div>';});
    INFO.markers.lyrics.forEach(function(l){h+='<div class="t l" style="left:'+(l.startMs/D*100)+'%" title="'+esc(l.text)+'"></div>';});
    w.innerHTML=h; }
  document.getElementById('ticks').addEventListener('click',function(e){var r=this.getBoundingClientRect(); seek((e.clientX-r.left)/r.width*INFO.durationMs);});

  // ---- 保存 ----
  document.getElementById('save').onclick=function(){
    fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(SCENE)})
      .then(function(r){return r.json();}).then(function(d){ if(d.ok) toast('已保存 ✓'); else toast('保存失败：'+d.error,true); })
      .catch(function(e){ toast('保存失败：'+e.message,true); });
  };

  // ---- 启动 ----
  renderPalette(); buildTicks(); rebuild();
})();
</script>
</body></html>`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
