/**
 * editor-page.js — P2 编辑器页面（自包含 HTML，内联 CSS/JS）
 *
 * v1：拖框创建元素 / 选中高亮 / 拖动改位置 / 角柄二次调整大小 /
 *     属性·参数·生命期·备注 / 增删轨迹与特效 / 拖时间轴实时看 / 保存。
 * 不含嵌套/组；不含泳道（下一步）。
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
  button.on{outline:2px solid #39ff88}
  .grow{flex:1}
  main{display:grid;grid-template-columns:180px 1fr 300px;flex:1 1 auto;min-height:0}
  .col{min-height:0;overflow:auto;padding:10px}
  .left{border-right:1px solid #2a2a30}
  .right{border-left:1px solid #2a2a30}
  #stage{position:relative;display:flex;align-items:center;justify-content:center;padding:10px;background:#060608;min-height:0;cursor:crosshair}
  #wrap{position:relative;line-height:0}
  #view{max-width:100%;max-height:100%;display:block;border:1px solid #2a2a30}
  #ov{position:absolute;left:0;top:0}
  .sec{margin:10px 0 5px;color:#8b8b93;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
  .sec:first-child{margin-top:0}
  .tpl{display:block;width:100%;text-align:left;margin:3px 0}
  .row{display:flex;gap:6px;align-items:center;margin:3px 0}
  .row label{flex:0 0 62px;color:#8b8b93}
  .row input,.row select,.row textarea{flex:1;min-width:0;background:#141418;border:1px solid #2a2a30;color:#e9e9ec;border-radius:4px;padding:3px 5px;font:inherit}
  .row input[type=color]{padding:0;height:22px}
  .track{border:1px solid #2a2a30;border-radius:5px;padding:6px;margin:5px 0;background:#101014}
  .track .h{display:flex;align-items:center;gap:6px;margin-bottom:4px}
  .track .h b{color:#7ce0a8;font-size:11px}
  footer{flex:0 0 auto;padding:8px 14px;border-top:1px solid #2a2a30}
  #ticks{position:relative;height:10px;margin-bottom:5px}
  #ticks .t{position:absolute;top:0;height:10px;width:1px;background:#3a3a44}
  #ticks .t.s{background:#6b5a00}
  #ticks .t.l{background:#2f6b47}
  .scrubrow{display:flex;gap:10px;align-items:center}
  input[type=range]{flex:1}
  time{font-variant-numeric:tabular-nums;color:#c8f0e8;min-width:74px}
  .hint{color:#6b6b73;font-size:11px}
  #mode{color:#39ff88}
  #toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:#1e40d8;color:#fff;padding:6px 14px;border-radius:5px;opacity:0;transition:opacity .15s;pointer-events:none}
  #toast.show{opacity:1}
  #toast.bad{background:#7a1a2a}
</style></head><body>
<header>
  <h1>场景编辑器 · ${esc(info.title || info.id)}</h1>
  <span class="badge">${esc(info.id)}</span>
  <span id="mode"></span>
  <span class="hint" id="selInfo">未选中</span>
  <span class="grow"></span>
  <span class="hint">段落 <b id="seclabel">—</b> · 歌词 <b id="lyrlabel">—</b></span>
  <button class="p" id="save">保存</button>
</header>
<main>
  <div class="col left">
    <div class="sec">加元素</div>
    <div id="palette"></div>
    <div id="trackTools" style="display:none">
      <div class="sec">给选中元素加轨迹</div>
      <div id="addTracks"></div>
    </div>
    <div class="sec">说明</div>
    <div class="hint">① 点模板 → 在画面上从一角拖到另一角画框，松手即创建。<br>② 点元素选中（红框），拖框内改位置，拖四角改大小。</div>
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
  var ms = 0, sel = null, resolved = [], drag = null, resize = null, box = null, pending = null, timer = null;

  var img = document.getElementById('view');
  var ov = document.getElementById('ov');
  var slider = document.getElementById('scrub');
  var stage = document.getElementById('stage');

  function fmt(t){var s=t/1000,m=Math.floor(s/60),r=s-m*60;return m+':'+(r<10?'0':'')+r.toFixed(2);}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function byId(id){for(var i=0;i<SCENE.elements.length;i++)if(SCENE.elements[i].id===id)return SCENE.elements[i];return null;}
  function curEl(){return sel?byId(sel):null;}
  function setPath(o,p,v){var a=p.split('.');for(var i=0;i<a.length-1;i++){if(o[a[i]]==null)o[a[i]]={};o=o[a[i]];}o[a[a.length-1]]=v;}
  function toast(m,b){var t=document.getElementById('toast');t.textContent=m;t.className=b?'show bad':'show';setTimeout(function(){t.className='';},1400);}
  function uid(p){var n=1,b=p;while(byId(b)){n++;b=p+'-'+n;}return b;}
  function currentSection(t){for(var i=0;i<INFO.markers.sections.length;i++){var s=INFO.markers.sections[i];if(t>=s.startMs&&t<s.endMs)return s;}return null;}
  function currentLyric(t){for(var i=0;i<INFO.markers.lyrics.length;i++){var l=INFO.markers.lyrics[i];if(t>=l.startMs&&t<l.endMs)return l;}return null;}
  function blockDef(n){for(var i=0;i<BLOCKS.elements.length;i++)if(BLOCKS.elements[i].name===n)return BLOCKS.elements[i];return null;}
  function defaultParams(n){var b=blockDef(n),p={};if(b&&b.params)Object.keys(b.params).forEach(function(k){if(b.params[k].default!=null)p[k]=b.params[k].default;});return p;}

  // ---- 元素框（画布坐标，未乘显示缩放）----
  function elementBox(el) {
    var r=null; for(var i=0;i<resolved.length;i++) if(resolved[i].id===el.id) r=resolved[i];
    if (r && r.size && r.size.w) return { x: r.x-r.size.w*(r.scale||1)/2, y: r.y-r.size.h*(r.scale||1)/2, w: r.size.w*(r.scale||1), h: r.size.h*(r.scale||1) };
    var w=200,h=120,p=el.params||{};
    if (el.block==='rect'){w=p.w||200;h=p.h||120;}
    else if (el.block==='wireHeart'){w=h=p.size||160;}
    else if (el.block==='text'){w=p.width||((p.text||'').length*(p.size||22)*0.6);h=(p.size||22)*1.35;}
    return { x: el.at.x-w/2, y: el.at.y-h/2, w: w, h: h };
  }
  function applyBox(el, b) {
    var w=Math.max(4,Math.abs(b.w)), h=Math.max(4,Math.abs(b.h));
    el.at.x=Math.round(b.x+w/2); el.at.y=Math.round(b.y+h/2);
    var p=el.params||(el.params={});
    if (el.block==='rect'){p.w=Math.round(w);p.h=Math.round(h);}
    else if (el.block==='text'){p.width=Math.round(w);}
    else if (el.block==='wireHeart'){p.size=Math.round(Math.min(w,h));}
    else { if('w' in p)p.w=Math.round(w); if('h' in p)p.h=Math.round(h); if('size' in p)p.size=Math.round(Math.min(w,h)); }
  }

  // ---- 覆盖层 ----
  function syncSize(){var r=img.getBoundingClientRect();if(!r.width)return false;ov.width=Math.round(r.width);ov.height=Math.round(r.height);ov.style.width=r.width+'px';ov.style.height=r.height+'px';return true;}
  function S(){return { sx: ov.width/INFO.width, sy: ov.height/INFO.height };}
  function drawOverlay() {
    if(!syncSize())return;
    var sc=S(), sx=sc.sx, sy=sc.sy, ctx=ov.getContext('2d');
    ctx.clearRect(0,0,ov.width,ov.height);
    resolved.forEach(function(it){
      if(!it.visible)return;
      ctx.save();
      ctx.lineWidth=it.id===sel?2.5:1;
      ctx.strokeStyle=it.id===sel?'rgba(255,96,112,.95)':'rgba(120,200,160,.30)';
      var x=it.x*sx,y=it.y*sy;
      if(it.size&&it.size.w){var w=it.size.w*it.scale*sx,h=it.size.h*it.scale*sy;ctx.strokeRect(x-w/2,y-h/2,w,h);}
      else{ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();}
      if(it.id===sel){ctx.fillStyle='rgba(255,96,112,.97)';ctx.font='600 12px monospace';var tw=ctx.measureText(it.id).width+8;ctx.fillRect(x+8,y-24,tw,16);ctx.fillStyle='#0a0a0c';ctx.fillText(it.id,x+12,y-12);}
      ctx.restore();
    });
    // 选中元素的四角手柄
    var el=curEl();
    if(el){
      var b=elementBox(el), hx=b.x*sx, hy=b.y*sy, hw=b.w*sx, hh=b.h*sy;
      ctx.save();ctx.strokeStyle='rgba(255,96,112,.5)';ctx.lineWidth=1;ctx.setLineDash([5,4]);ctx.strokeRect(hx,hy,hw,hh);ctx.restore();
      [[hx,hy],[hx+hw,hy],[hx,hy+hh],[hx+hw,hy+hh]].forEach(function(pt){
        ctx.save();ctx.fillStyle='#ff6070';ctx.fillRect(pt[0]-5,pt[1]-5,10,10);ctx.strokeStyle='#0a0a0c';ctx.lineWidth=1;ctx.strokeRect(pt[0]-5,pt[1]-5,10,10);ctx.restore();
      });
    }
    // 正在拖出的创建框
    if(box){
      var x0=Math.min(box.x0,box.x1)*sx,y0=Math.min(box.y0,box.y1)*sy,w=Math.abs(box.x1-box.x0)*sx,h=Math.abs(box.y1-box.y0)*sy;
      ctx.save();ctx.strokeStyle='#39ff88';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.strokeRect(x0,y0,w,h);ctx.fillStyle='rgba(57,255,136,.10)';ctx.fillRect(x0,y0,w,h);ctx.restore();
    }
  }
  function toCanvas(cx,cy){var r=img.getBoundingClientRect();return {x:(cx-r.left)/r.width*INFO.width,y:(cy-r.top)/r.height*INFO.height};}
  function hitTest(x,y){
    var hits=resolved.filter(function(it){if(!it.visible)return false;var hw=it.size&&it.size.w?it.size.w*it.scale/2:40,hh=it.size&&it.size.h?it.size.h*it.scale/2:40;return x>=it.x-hw&&x<=it.x+hw&&y>=it.y-hh&&y<=it.y+hh;});
    hits.sort(function(a,b){return (a.z||0)-(b.z||0);});return hits.length?hits[hits.length-1].id:null;
  }
  function handleAt(x,y){
    var el=curEl(); if(!el)return null;
    var b=elementBox(el), r=14/ (ov.width/INFO.width || 1);
    var corners={ tl:{x:b.x,y:b.y}, tr:{x:b.x+b.w,y:b.y}, bl:{x:b.x,y:b.y+b.h}, br:{x:b.x+b.w,y:b.y+b.h} };
    for(var k in corners){var c=corners[k];if(Math.abs(x-c.x)<r&&Math.abs(y-c.y)<r)return k;}
    return null;
  }

  // ---- 创建 / 选中 / 拖动 / 缩放 ----
  stage.addEventListener('mousedown', function(e){
    var c=toCanvas(e.clientX,e.clientY);
    if(pending){ box={ block:pending, x0:c.x,y0:c.y,x1:c.x,y1:c.y }; drawOverlay(); return; }
    var hk=handleAt(c.x,c.y);
    if(hk){ var b=elementBox(curEl()); resize={ id:sel, corner:hk, box:b, fixed: fixedCorner(b,hk) }; return; }
    var hit=hitTest(c.x,c.y);
    if(hit){ sel=hit; renderProps(); renderTracks(); renderTools(); var el=byId(hit); drag={id:hit,sx:c.x,sy:c.y,ax:el.at.x,ay:el.at.y,moved:false}; drawOverlay(); }
    else { sel=null; renderProps(); renderTracks(); renderTools(); drawOverlay(); }
  });
  function fixedCorner(b,k){ return { tl:{x:b.x+b.w,y:b.y+b.h}, tr:{x:b.x,y:b.y+b.h}, bl:{x:b.x+b.w,y:b.y}, br:{x:b.x,y:b.y} }[k]; }
  document.addEventListener('mousemove', function(e){
    if(!ov.width)return;
    var c=toCanvas(e.clientX,e.clientY);
    if(box){ box.x1=c.x; box.y1=c.y; drawOverlay(); return; }
    if(resize){ var el=byId(resize.id); if(!el)return; var fx=resize.fixed.x, fy=resize.fixed.y;
      resize.box={ x:Math.min(fx,c.x), y:Math.min(fy,c.y), w:Math.abs(c.x-fx), h:Math.abs(c.y-fy) };
      applyBox(el, resize.box); syncResolved(el); drawOverlay(); return; }
    if(drag){ var el2=byId(drag.id); if(!el2)return; el2.at.x=Math.round(drag.ax+(c.x-drag.sx)); el2.at.y=Math.round(drag.ay+(c.y-drag.sy)); syncResolved(el2); drawOverlay(); return; }
  });
  document.addEventListener('mouseup', function(){
    if(box){ var b=box; box=null; pending=null; setMode();
      var w=Math.abs(b.x1-b.x0), h=Math.abs(b.y1-b.y0);
      if(w<6||h<6){ toast('框太小，已取消',true); drawOverlay(); return; }
      createFromBox(b.block, b.x0,b.y0,b.x1,b.y1); return; }
    if(resize){ resize=null; refreshFrame(); renderProps(); return; }
    if(drag){ var moved=drag.moved; drag=null; if(moved){ renderProps(); refreshFrame(); } }
  });
  function syncResolved(el){ resolved.forEach(function(it){ if(it.id===el.id){ it.x=el.at.x; it.y=el.at.y; } }); }

  function createFromBox(block, x0,y0,x1,y1){
    var b={ x:Math.min(x0,x1), y:Math.min(y0,y1), w:Math.abs(x1-x0), h:Math.abs(y1-y0) };
    var el={ id:uid(block), block:block, params:defaultParams(block), at:{x:Math.round(b.x+b.w/2),y:Math.round(b.y+b.h/2),scale:1,rot:0,alpha:1},
             life:{inMs:0,outMs:SCENE.durationMs,fadeInMs:200,fadeOutMs:200}, tracks:[], z:0, notes:'' };
    applyBox(el, b);
    SCENE.elements.push(el); sel=el.id; renderProps(); renderTracks(); renderTools(); refreshFrame();
  }

  // ---- 属性 ----
  function numRow(label,elId,f,val,ti){return '<div class="row"><label>'+label+'</label><input type="number" step="any" data-el="'+elId+'" '+(ti!=null?'data-ti="'+ti+'" ':'')+'data-f="'+f+'" value="'+val+'"></div>';}
  function textRow(label,elId,f,val,ti){return '<div class="row"><label>'+label+'</label><input type="text" data-el="'+elId+'" '+(ti!=null?'data-ti="'+ti+'" ':'')+'data-f="'+f+'" value="'+esc(val)+'"></div>';}
  function colorRow(label,elId,f,val,ti){return '<div class="row"><label>'+label+'</label><input type="color" data-el="'+elId+'" '+(ti!=null?'data-ti="'+ti+'" ':'')+'data-f="'+f+'" value="'+(val||'#ffffff')+'"></div>';}
  function paramRows(el,block,ti){var out='',sc=block&&block.params?block.params:{};Object.keys(sc).forEach(function(k){var d=sc[k],v=el.params&&el.params[k]!=null?el.params[k]:d.default;if(d.type==='color')out+=colorRow(k,el.id,'params.'+k,v,ti);else if(d.type==='string')out+=textRow(k,el.id,'params.'+k,v,ti);else out+=numRow(k,el.id,'params.'+k,(v==null?'':v),ti);});return out;}
  function renderProps(){
    var p=document.getElementById('props'),el=curEl();
    if(!el){p.innerHTML='<div class="hint">（选一个元素）</div>';document.getElementById('selInfo').textContent='未选中';return;}
    document.getElementById('selInfo').textContent='选中 '+el.id+'（'+el.block+'）';
    var h='';
    h+='<div class="row"><label>id</label><input type="text" data-el="'+el.id+'" data-f="id" value="'+esc(el.id)+'"></div>';
    h+=numRow('x',el.id,'at.x',el.at.x)+numRow('y',el.id,'at.y',el.at.y);
    h+=numRow('scale',el.id,'at.scale',el.at.scale)+numRow('rot',el.id,'at.rot',el.at.rot)+numRow('alpha',el.id,'at.alpha',el.at.alpha)+numRow('z',el.id,'z',el.z);
    h+='<div class="sec">参数</div>'+paramRows(el,blockDef(el.block),null);
    h+='<div class="sec">生命期</div>'+numRow('inMs',el.id,'life.inMs',el.life.inMs)+numRow('outMs',el.id,'life.outMs',el.life.outMs)+numRow('fadeIn',el.id,'life.fadeInMs',el.life.fadeInMs)+numRow('fadeOut',el.id,'life.fadeOutMs',el.life.fadeOutMs);
    h+='<div class="row"><button class="sm" id="lifeIn">进场=此刻</button><button class="sm" id="lifeOut">退场=此刻</button></div>';
    h+='<div class="sec">备注（给我看）</div><div class="row"><textarea data-el="'+el.id+'" data-f="notes" rows="2">'+esc(el.notes)+'</textarea></div>';
    h+='<div class="row"><button class="x" id="delEl">删除元素</button></div>';
    p.innerHTML=h;
    var li=document.getElementById('lifeIn'),lo=document.getElementById('lifeOut'),de=document.getElementById('delEl');
    if(li)li.onclick=function(){el.life.inMs=Math.round(ms);renderProps();refreshFrame();};
    if(lo)lo.onclick=function(){el.life.outMs=Math.round(ms);renderProps();refreshFrame();};
    if(de)de.onclick=function(){SCENE.elements=SCENE.elements.filter(function(x){return x.id!==el.id;});sel=null;renderProps();renderTracks();renderTools();refreshFrame();};
  }
  function fxSchema(n){for(var i=0;i<BLOCKS.fx.length;i++)if(BLOCKS.fx[i].name===n)return BLOCKS.fx[i];return null;}
  function renderTracks(){
    var c=document.getElementById('tracks'),el=curEl();
    if(!el){c.innerHTML='<div class="hint">（未选中）</div>';return;}
    var h='';
    el.tracks.forEach(function(tr,i){
      h+='<div class="track"><div class="h"><b>'+(tr.kind==='fx'?('fx:'+tr.block):tr.kind)+'</b><span class="grow"></span><button class="sm x" data-del-tr="'+i+'">删</button></div>';
      if(tr.kind==='move'){
        h+='<div class="row"><label>path</label><select data-el="'+el.id+'" data-ti="'+i+'" data-f="path">'+['line','orbit','curve'].map(function(x){return '<option value="'+x+'"'+(tr.path===x?' selected':'')+'>'+x+'</option>';}).join('')+'</select></div>';
        h+=numRow('from.x',el.id,'from.x',tr.from?tr.from.x:0,i)+numRow('from.y',el.id,'from.y',tr.from?tr.from.y:0,i)+numRow('to.x',el.id,'to.x',tr.to?tr.to.x:0,i)+numRow('to.y',el.id,'to.y',tr.to?tr.to.y:0,i);
        if(tr.path==='orbit'){h+=numRow('center.x',el.id,'center.x',tr.center?tr.center.x:0,i)+numRow('center.y',el.id,'center.y',tr.center?tr.center.y:0,i)+numRow('sweep',el.id,'sweep',tr.sweep!=null?tr.sweep:360,i);}
        if(tr.path==='curve'){h+=numRow('via.x',el.id,'via.x',tr.via?tr.via.x:0,i)+numRow('via.y',el.id,'via.y',tr.via?tr.via.y:0,i);}
      }
      if(tr.kind==='scale'){h+=numRow('from',el.id,'from',tr.from,i)+numRow('to',el.id,'to',tr.to,i);}
      h+=numRow('startMs',el.id,'startMs',tr.startMs,i)+numRow('durMs',el.id,'durMs',tr.durMs,i);
      if(tr.kind!=='fx')h+='<div class="row"><label>ease</label><select data-el="'+el.id+'" data-ti="'+i+'" data-f="ease">'+['linear','in','out','inout','quint','expo','back'].map(function(e){return '<option value="'+e+'"'+(tr.ease===e?' selected':'')+'>'+e+'</option>';}).join('')+'</select></div>';
      if(tr.kind==='fx'){var s=fxSchema(tr.block);if(s)h+=paramRows({id:el.id,params:tr.params},s,i);}
      h+='</div>';
    });
    c.innerHTML=h||'<div class="hint">（无轨迹）</div>';
    c.querySelectorAll('[data-del-tr]').forEach(function(b){b.onclick=function(){el.tracks.splice(Number(b.dataset.delTr),1);renderTracks();refreshFrame();};});
  }
  function addTrack(kind,path){
    var el=curEl();if(!el){toast('先选一个元素',true);return;}
    if(kind==='move')el.tracks.push({kind:'move',path:path,from:{x:el.at.x,y:el.at.y},to:{x:el.at.x+300,y:el.at.y},center:{x:el.at.x+150,y:el.at.y+120},via:{x:el.at.x+150,y:el.at.y-160},sweep:360,startMs:Math.round(ms),durMs:1000,ease:'linear'});
    else if(kind==='scale')el.tracks.push({kind:'scale',from:1,to:0.5,startMs:Math.round(ms),durMs:1000,ease:'linear'});
    else if(kind==='fx')el.tracks.push({kind:'fx',block:(BLOCKS.fx[0]&&BLOCKS.fx[0].name)||'glow',startMs:Math.round(ms),durMs:1000,params:{}});
    renderTracks();refreshFrame();
  }

  // ---- 左侧栏 ----
  function renderPalette(){
    var p=document.getElementById('palette');
    p.innerHTML=BLOCKS.elements.map(function(b){return '<button class="tpl" data-add="'+b.name+'">＋ '+b.name+'</button>';}).join('');
    p.querySelectorAll('[data-add]').forEach(function(btn){btn.onclick=function(){pending=btn.dataset.add;setMode();toast('在画面上从一角拖到另一角画框');};});
    var t=document.getElementById('addTracks');
    t.innerHTML='<button class="tpl" id="tm-line">＋ 轨迹（直线）</button><button class="tpl" id="tm-scale">＋ 缩放</button><button class="tpl" id="tm-fx">＋ 特效</button>';
    document.getElementById('tm-line').onclick=function(){addTrack('move','line');};
    document.getElementById('tm-scale').onclick=function(){addTrack('scale');};
    document.getElementById('tm-fx').onclick=function(){addTrack('fx');};
  }
  function renderTools(){ document.getElementById('trackTools').style.display = curEl() ? '' : 'none'; }
  function setMode(){ document.getElementById('mode').textContent = pending ? ('拖框创建：'+pending) : ''; }

  // ---- 字段编辑 ----
  document.addEventListener('change', function(e){
    var t=e.target,f=t.dataset&&t.dataset.f;if(!f)return;var el=byId(t.dataset.el);if(!el)return;
    var v=t.type==='number'?Number(t.value):t.value;
    if(t.dataset.ti!=null)setPath(el.tracks[Number(t.dataset.ti)],f,v);else{setPath(el,f,v);if(f==='id')sel=el.id;}
    refreshFrame();
  });

  // ---- 刷新 ----
  function refreshResolve(cb){fetch('/resolve?ms='+Math.round(ms)).then(function(r){return r.json();}).then(function(d){resolved=d.items;if(cb)cb();}).catch(function(){});}
  function refreshFrame(){img.src='/frame?ms='+Math.round(ms);document.getElementById('tlabel').textContent=fmt(ms);var s=currentSection(ms),l=currentLyric(ms);document.getElementById('seclabel').textContent=s?s.name:'—';document.getElementById('lyrlabel').textContent=l?l.text:'（器乐）';refreshResolve(drawOverlay);}
  function rebuild(){renderProps();renderTracks();renderTools();refreshFrame();}

  // ---- 时间轴 ----
  function seek(t){t=Math.max(0,Math.min(INFO.durationMs-1,t));slider.value=String(t);ms=t;refreshFrame();}
  slider.addEventListener('input',function(){ms=Number(slider.value);if(timer)clearTimeout(timer);timer=setTimeout(refreshFrame,30);});
  document.addEventListener('keydown',function(e){var step=e.shiftKey?10:Math.round(1000/fps);if(e.key==='ArrowLeft'){seek(ms-step);e.preventDefault();}else if(e.key==='ArrowRight'){seek(ms+step);e.preventDefault();}});
  document.getElementById('b1').onclick=function(){seek(ms-1000);};
  document.getElementById('b2').onclick=function(){seek(ms+1000);};
  function buildTicks(){var w=document.getElementById('ticks'),h='',D=INFO.durationMs||1;INFO.markers.sections.forEach(function(s){h+='<div class="t s" style="left:'+(s.startMs/D*100)+'%" title="'+esc(s.name)+'"></div>';});INFO.markers.lyrics.forEach(function(l){h+='<div class="t l" style="left:'+(l.startMs/D*100)+'%" title="'+esc(l.text)+'"></div>';});w.innerHTML=h;}
  document.getElementById('ticks').addEventListener('click',function(e){var r=this.getBoundingClientRect();seek((e.clientX-r.left)/r.width*INFO.durationMs);});

  // ---- 保存 ----
  document.getElementById('save').onclick=function(){fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(SCENE)}).then(function(r){return r.json();}).then(function(d){if(d.ok)toast('已保存 ✓');else toast('保存失败：'+d.error,true);}).catch(function(e){toast('保存失败：'+e.message,true);});};

  renderPalette(); buildTicks(); setMode(); rebuild();
})();
</script>
</body></html>`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
