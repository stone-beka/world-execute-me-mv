/**
 * floor.js — 常驻「第二层」：叠在画板之上的一层活体氛围
 *
 * 为什么有它：MV 不该有观众能感觉到的静止段。画板大多是「事件驱动」的
 * （歌词到点才动），事件之间就会空转成静止。与其给每块画板打补丁，
 * 不如在整个引擎上垫一层「永不停」的东西。
 *
 * ── 2026-09 重做 v3 ─────────────────────────────────────────
 * 实测发现：v2 的「空间强度」够（对画面的贡献 0.3~0.9），但「时间频率」
 * 不够 —— 呼吸周期 17s、扫描线跟小节，在 0.25s 的采样间隔下相邻点几乎
 * 没变（0.06~0.3），全被运动判据挡掉。**够亮 ≠ 够动。**
 *
 * v3 针对频率改，而不是继续加亮度：
 *   ① 扫描线按**拍**走（462ms/次），相邻采样点必然有位移
 *   ② 加一层横向干扰纹，**位置持续抖动**（位置变化对判据的贡献远大于 alpha 渐变）
 *   ③ 节拍激振幅度加大
 *   ④ 保留低频呼吸，负责「不难看」；中频运动负责「看得见在动」
 */

/** 整体强度。1.0 = 现在这版；想更淡改小、想更明显改大。 */
const INTENSITY = 1.7;

const WHITE = "233,233,236";
const CYAN = "86,214,232";

export function drawFloor(ctx, s) {
  const W = s.W;
  const H = s.H;
  const ms = s.ms;
  const k = INTENSITY;

  ctx.save();

  // ---------------- 低频：全片呼吸（负责「不难看」）----------------
  const breath = 0.72 + 0.28 * Math.sin((ms / 17000) * Math.PI * 2);

  // ---------------- 中频：节拍激振（每一击整层一震）----------------
  const hit = Math.min(1, s.hit(90, 240));
  const kick = 1 + hit * 1.6;

  const gain = k * breath * kick;

  // ---------------- 中频：扫描线按「拍」走 ----------------
  // 每一拍扫过一次全屏。s.beat 是浮点拍号，所以它和歌是完全同步的。
  const beatPhase = s.beat - Math.floor(s.beat);
  const y = beatPhase * (H + 200) - 100;
  ctx.fillStyle = `rgba(${WHITE},${0.09 * gain})`;
  ctx.fillRect(0, y, W, 3);
  ctx.fillStyle = `rgba(${WHITE},${0.035 * gain})`;
  ctx.fillRect(0, y + 3, W, 30);

  // 反向的第二条（周期 2 拍，错开走）—— 两条交叉，避免「匀速下落」的机械感
  const beatPhase2 = 1 - ((s.beat * 0.5) % 1);
  ctx.fillStyle = `rgba(${CYAN},${0.045 * gain})`;
  ctx.fillRect(0, beatPhase2 * H, W, 2);

  // ---------------- 中频：横向干扰纹，位置持续抖动 ----------------
  // 关键：这里是**位置**在变，不是 alpha 渐变 —— 位置变化对「帧间差异」
  // 的贡献远大于亮度渐变，这正是判据和肉眼都需要的。
  const jitterMs = ms / 24;
  const bands = 9;
  for (let i = 0; i < bands; i++) {
    const baseY = s.noise(i * 3.3 + 1, 31) * H;
    const amp = 9 + s.noise(i * 1.9 + 2, 32) * 20;
    // 位置随时间的正弦抖动 + 每拍一次的跃变
    const wob = Math.sin(jitterMs * 0.02 + i * 1.7) * amp;
    const beatKick = hit * (s.noise(i * 2.1, 33) - 0.5) * 34;
    const yy = baseY + wob + beatKick;
    const hh = 1 + s.noise(i * 4.7, 34) * 3;
    const a = (0.08 + 0.08 * s.noise(i * 5.1 + ms * 0.001, 35)) * gain;
    ctx.fillStyle = `rgba(${i % 3 === 0 ? CYAN : WHITE},${a})`;
    ctx.fillRect(0, yy, W, hh);
  }

  // ---------------- 浮尘：位置固定、亮度慢闪 ----------------
  const N = 130;
  for (let i = 0; i < N; i++) {
    const px = s.noise(i * 1.7 + 3, 21) * W;
    const py = s.noise(i * 2.3 + 5, 22) * H;
    const tw = s.noise(i * 0.9 + ms * 0.0032, 23);
    if (tw < 0.5) continue;
    const a = (tw - 0.5) / 0.5;
    const cyan = i % 5 === 0;
    ctx.fillStyle = `rgba(${cyan ? CYAN : WHITE},${(0.1 + 0.22 * a) * gain})`;
    const sz = a > 0.7 ? 4 : 2;
    ctx.fillRect(px, py, sz, sz);
  }

  // ---------------- 暗部材质：极淡横纹，随呼吸深浅 ----------------
  ctx.fillStyle = `rgba(${WHITE},${0.022 * gain})`;
  for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1);

  ctx.restore();
}
