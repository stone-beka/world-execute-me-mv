/**
 * 98-lyric-lab.js — 歌词同步试片（调试用，不是成片内容）
 *
 * 用途只有一个：把 assets/lyrics.json 的**逐词时间戳**画成肉眼能判断的东西。
 * 看它就能回答"这份时间戳到底准不准"，而不用听我说"应该差不多"。
 *
 * 画什么：
 *   · 当前句大字居中，**唱到哪就亮到哪**（逐词擦除）
 *   · 当前词下面一条细线 + 这个词自己的进度
 *   · 整句下方一条总进度条（逐字）
 *   · 上一句/下一句压暗显示，方便看"接得顺不顺"
 *   · 抬头报出 帧/秒/拍/段落/第几句（以及这个词是 lrc 还是 derived）
 *
 * 时间 15s~45s（正好接在 fx-lab 后面，不留空洞）：
 *   16.00s "world.execute(me);"   → 听这句对不对得上
 *   29.74s 起 "If I'm a set of points" → 一段密的，看词有没有抢拍/拖拍
 */

import { rgba } from "../core/fade.js";

export const meta = {
  id: "lyric-lab",
  z: 80,
  startMs: 15000,
  endMs: 45000,
  fade: { fadeInMs: 200, fadeOutMs: 400 },
  tags: ["debug", "lyric-lab"],
};

const SUNG = "#c8f0e8";
const DIM = "#3a4a48";

export function draw(ctx, s) {
  const L = s.lyrics;
  if (L.empty) {
    ctx.fillStyle = rgba(s.colors.warn, 0.9);
    ctx.font = s.mono(28, 600);
    ctx.fillText("no assets/lyrics.json — run: npm run align:lyrics", 80, 120);
    return;
  }

  ctx.save();
  ctx.globalAlpha = s.env;

  const active = L.lineAt(s.ms); // 真正「正在唱」的那句（空隙里是 null）
  const line = active ?? L.lastLine(s.ms); // 画面上要显示的那句（空隙里保持上一句）
  const cur = L.wordAt(s.ms);

  // ---- 抬头 ----
  ctx.font = s.mono(16);
  ctx.fillStyle = rgba(s.colors.fg, 0.5);
  ctx.fillText(
    `lyric-lab  f=${s.frame}  t=${s.t.toFixed(2)}s  beat=${s.beat.toFixed(2)}  ` +
      `sec=${s.section ? s.section.name : "-"}  line=${line ? line.i + 1 : "-"}/${L.lines.length}` +
      `${cur ? `  conf=${cur.conf ?? "-"}` : ""}`,
    80,
    60,
  );

  // ---- 上一句 / 下一句（压暗，看接续） ----
  if (active) {
    const prev = L.lines[active.i - 1];
    const next = L.lines[active.i + 1];
    ctx.font = s.mono(26);
    ctx.fillStyle = rgba(DIM, 0.55);
    if (prev) ctx.fillText(prev.text, 200, 300);
    if (next) ctx.fillText(next.text, 200, 860);

    // ---- 当前句：逐词擦除 ----
    const size = 62;
    ctx.font = s.mono(size, 700);
    const gap = ctx.measureText(" ").width;
    const widths = line.words.map((w) => ctx.measureText(w.w).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (line.words.length - 1);
    let x = (s.W - total) / 2;
    const y = 560;

    for (const [i, w] of line.words.entries()) {
      const p = L.wordProgress(w, s.ms);
      const wd = widths[i];

      // 底色（还没唱到的部分）
      ctx.fillStyle = rgba(DIM, 0.85);
      ctx.fillText(w.w, x, y);
      // 唱到的部分：按词的进度横向擦除
      if (p > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y - size, wd * p, size * 1.6);
        ctx.clip();
        ctx.fillStyle = rgba(SUNG, 1);
        ctx.fillText(w.w, x, y);
        ctx.restore();
      }
      // 当前词下划线 + 自己的进度
      if (cur && cur.gi === w.gi) {
        ctx.fillStyle = rgba(s.colors.accent, 0.9);
        ctx.fillRect(x, y + 22, wd, 4);
        ctx.fillRect(x, y + 32, wd * p, 10);
      }
      x += wd + gap;
    }

    // ---- 整句逐字总进度 ----
    const lp = L.lineCharProgress(line, s.ms) / Math.max(1, line.text.length);
    ctx.fillStyle = rgba(s.colors.fg, 0.18);
    ctx.fillRect(200, 700, s.W - 400, 6);
    ctx.fillStyle = rgba(s.colors.accent, 0.85);
    ctx.fillRect(200, 700, (s.W - 400) * lp, 6);
    ctx.font = s.mono(16);
    ctx.fillStyle = rgba(s.colors.fg, 0.45);
    ctx.fillText(
      `line ${(line.start / 1000).toFixed(2)}s → ${(line.singEnd / 1000).toFixed(2)}s` +
        `${line.end - line.singEnd > 200 ? `  (画面留到 ${(line.end / 1000).toFixed(2)}s)` : ""}` +
        `   charProgress ${(lp * 100).toFixed(0)}%`,
      200,
      740,
    );
  } else {
    // 句间空隙：把上一句、下一句、以及"还有多久"都摆在画面上
    const last = L.lastLine(s.ms);
    const next = L.nextLine(s.ms);
    const remain = next ? next.start - s.ms : 0;
    const totalGap = next && last ? Math.max(1, next.start - last.end) : 0;
    const p = totalGap > 0 ? Math.max(0, Math.min(1, 1 - remain / totalGap)) : 0;

    if (last) {
      ctx.font = s.mono(30);
      ctx.fillStyle = rgba(DIM, 0.5);
      ctx.fillText(last.text, 200, 400);
    }
    ctx.font = s.mono(96, 700);
    ctx.fillStyle = rgba(s.colors.warn, 0.5);
    ctx.fillText(`gap ${(remain / 1000).toFixed(2)}s`, 200, 600);
    if (next) {
      ctx.font = s.mono(56, 700);
      ctx.fillStyle = rgba(DIM, 0.85);
      ctx.fillText(next.text, 200, 780);
    }
    // 倒计时条：空隙走完就进下一句
    ctx.fillStyle = rgba(s.colors.fg, 0.14);
    ctx.fillRect(200, 860, s.W - 400, 8);
    ctx.fillStyle = rgba(s.colors.accent, 0.55);
    ctx.fillRect(200, 860, (s.W - 400) * p, 8);
  }

  ctx.restore();
}
