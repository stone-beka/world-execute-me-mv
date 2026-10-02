# 画板绘制配方（Canvas 2D / @napi-rs/canvas）

全部配方都遵守两条：**只用 `s` 提供的确定性来源**、**结果乘 `s.env`**。
`ctx` 是标准 Canvas 2D；`@napi-rs/canvas` 支持 `getImageData`、渐变、`roundRect`、
`globalCompositeOperation`，但**不支持** DOM / CSS / `requestAnimationFrame`。

## 1. 多层辉光（替代 ctx.filter）

```js
function glowCircle(ctx, cx, cy, r, hex, alpha) {
  for (const [mult, a] of [[2.6, 0.05], [1.7, 0.1], [1.0, 0.9]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * mult, 0, Math.PI * 2);
    ctx.fillStyle = rgba(hex, a * alpha);
    ctx.fill();
  }
}
```

## 2. 扫描线 / CRT

```js
const step = 4;
for (let y = 0; y < s.H; y += step) {
  ctx.fillStyle = `rgba(0,0,0,${0.10 + 0.05 * s.noise(y * 0.1, 3)})`;
  ctx.fillRect(0, y, s.W, 1.5);
}
// 缓慢下移的亮带
const band = (s.ms * 0.05) % (s.H + 200) - 100;
const g = ctx.createLinearGradient(0, band - 60, 0, band + 60);
g.addColorStop(0, rgba(s.colors.accent, 0));
g.addColorStop(0.5, rgba(s.colors.accent, 0.06 * s.env));
g.addColorStop(1, rgba(s.colors.accent, 0));
ctx.fillStyle = g; ctx.fillRect(0, band - 60, s.W, 120);
```

## 3. 打字机文字（按帧推进，不依赖真实时间）

```js
const text = "hello, world.execute(me);";
const cps = 24;                                  // 每秒出几个字
const n = Math.min(text.length, Math.floor(s.localMs / 1000 * cps));
ctx.font = "600 42px Consolas, monospace";
ctx.fillStyle = rgba(s.colors.fg, 0.95 * s.env);
ctx.fillText(text.slice(0, n), 120, s.H / 2);
if (n < text.length && Math.floor(s.ms / 250) % 2 === 0) ctx.fillText("█", 120 + ctx.measureText(text.slice(0, n)).width, s.H / 2);
```

## 4. 网格 / 透视地平线

```js
ctx.strokeStyle = rgba(s.colors.accent, 0.25 * s.env);
ctx.lineWidth = 1;
const horizon = s.H * 0.55;
for (let i = -20; i <= 20; i++) {
  const x = s.W / 2 + i * (s.W / 20);
  ctx.beginPath(); ctx.moveTo(s.W / 2 + i * 8, horizon); ctx.lineTo(x, s.H); ctx.stroke();
}
for (let k = 0; k < 14; k++) {
  const p = ((k / 14) + (s.ms * 0.00008)) % 1;
  const y = horizon + Math.pow(p, 2.2) * (s.H - horizon);
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s.W, y); ctx.stroke();
}
```

## 5. 波形（吃 onsets 就卡在真实音符上）

```js
// assets/onsets.js 默认导出 [[ms, pitch, velocity], ...]
import onsets from "../../../assets/onsets.js";
const near = onsets.filter(([ms]) => ms <= s.ms && ms > s.ms - 400);
for (const [ms, pitch, vel] of near) {
  const age = (s.ms - ms) / 400;                 // 0→1
  const x = s.W / 2 + (pitch - 60) * 26;
  const h = 40 + vel * 220 * (1 - age);
  ctx.fillStyle = rgba(s.colors.accent, (1 - age) * 0.8 * s.env);
  ctx.fillRect(x, s.H / 2 - h / 2, 6, h);
}
```

## 6. 粒子（无状态，索引当 key）

```js
const N = 120;
for (let i = 0; i < N; i++) {
  const bx = s.rnd(1, i) * s.W;                  // 固定基准位置
  const by = s.rnd(2, i) * s.H;
  const drift = s.fbm(s.frame * 0.01 + i * 0.3, 2, i);   // 平滑漂移
  const r = 1 + s.rnd(3, i) * 2.5;
  ctx.beginPath();
  ctx.arc(bx + (drift - 0.5) * 60, by - (s.ms * 0.02 * (0.2 + s.rnd(4, i))) % s.H, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(s.colors.fg, 0.4 * s.env);
  ctx.fill();
}
```

`%` 取模让粒子循环上升，**不要**给粒子存速度累加。

## 7. 闪白 / 冲击帧（硬切卡拍）

```js
if (s.beatPhase < 0.08) {
  ctx.fillStyle = rgba("#ffffff", (1 - s.beatPhase / 0.08) * 0.6 * s.env);
  ctx.fillRect(0, 0, s.W, s.H);
}
```

想要「无淡入的硬切」整块画板，就在 `draw` 里用 `hardCut(s.ms, s.startMs, s.endMs)` 取代 `s.env`，
让人一眼看出这是有意的。

## 8. 文字排版注意

- `ctx.textAlign` / `textBaseline` 记得显式设，别依赖默认值。
- 中文字形依赖字体文件；没有字体时优先画英文/符号或自绘几何。
- `ctx.measureText()` 可用；宽度算出来后再定位，避免硬编码。
