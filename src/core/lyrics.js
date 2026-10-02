/**
 * lyrics.js — 歌词（词级时间戳）
 *
 * 数据来自 assets/lyrics.json，由 tools/align-lyrics.js 生成（见它的说明：
 * 有 LRC 时间戳就准，只有纯文本就是「机器估的候选」）。
 *
 * 设计上只认一个原则：**按内容找歌词，永远不写死秒**。
 *   const l = s.lyrics.get("we're not the same");   // 找不到会大声报错
 *   ctx.fillText(l.words[2].w, x, y);
 *   const p = s.lyrics.wordProgress(l.words[2], s.ms);   // 0..1 唱到哪了
 *
 * 文件不存在 = 空歌词（lines/words 都是空数组），画板不炸。
 *
 * typographic 标点：显示文本统一走 smart()（' → ’、" → “ ”、... → …），
 * 但 find()/get() 既能用直引号也能用弯引号查。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./timeline.js";

/** 打字机标点 → 排版标点。返回的字符串只用于显示。 */
export function smart(str) {
  const s = String(str);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") out += "\u2019";
    else if (c === '"') {
      const prev = i === 0 ? "" : s[i - 1];
      out += prev === "" || /[\s(\[\u2014-]/.test(prev) ? "\u201c" : "\u201d";
    } else out += c;
  }
  return out.replace(/\.\.\./g, "\u2026").replace(/--/g, "\u2014");
}

/** 归一化：只留字母数字，用于按内容匹配（忽略标点/大小写/引号形状） */
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function load() {
  try {
    const j = JSON.parse(readFileSync(resolve(ROOT, "assets", "lyrics.json"), "utf8"));
    return { source: j.source ?? "assets/lyrics.json", mode: j.mode ?? "unknown", raw: j };
  } catch {
    return { source: null, mode: "none", raw: null };
  }
}

function makeLyrics(data) {
  const lines = [];
  for (const [li, l] of (data.raw?.lines ?? []).entries()) {
    const words = [];
    for (const [wi, w] of (l.words ?? []).entries()) {
      words.push({
        w: smart(w.w),
        start: w.start,
        end: w.end,
        conf: w.conf ?? null,
        line: li,
        index: wi,
        gi: 0,
      });
    }
    lines.push({
      i: li,
      text: smart(l.text),
      start: l.start,
      // end = 这句"占着画面"的区间（相邻句首尾相接，不留缝）
      end: l.end,
      // singEnd = 真正在唱到哪（词就摊到这里）
      singEnd: l.singEnd ?? l.end,
      words,
    });
  }
  const words = lines.flatMap((l) => l.words);
  words.forEach((w, i) => (w.gi = i));

  const byNorm = new Map();
  for (const l of lines) {
    const k = norm(l.text);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(l);
  }

  return {
    source: data.source,
    mode: data.mode,
    lines,
    words,
    get empty() {
      return lines.length === 0;
    },

    /** 正在唱的那一句（句间空隙返回 null） */
    lineAt(ms) {
      for (const l of lines) if (ms >= l.start && ms < l.end) return l;
      return null;
    },
    /** 最近已经开始的句子（空隙里显示上一句用） */
    lastLine(ms) {
      let best = null;
      for (const l of lines) {
        if (l.start > ms) break;
        best = l;
      }
      return best;
    },
    nextLine(ms) {
      for (const l of lines) if (l.start > ms) return l;
      return null;
    },
    /** 包含 s 的所有句子（忽略标点/大小写） */
    find(s) {
      const q = norm(s);
      return lines.filter((l) => norm(l.text).includes(q));
    },
    /** 第一句包含 s 的；找不到就大声报错（写画板时别静默失败） */
    get(s, nth = 0) {
      const hit = this.find(s)[nth];
      if (!hit) throw new Error(`歌词里找不到："${s}"（第 ${nth + 1} 个匹配）`);
      return hit;
    },
    wordAt(ms) {
      for (const w of words) if (ms >= w.start && ms < w.end) return w;
      return null;
    },
    findWords(s) {
      const q = norm(s);
      return words.filter((w) => norm(w.w) === q);
    },

    /** 这个词唱到哪了：0 之前、1 之后，中间线性 */
    wordProgress(w, ms) {
      if (!w) return 0;
      if (ms <= w.start) return 0;
      if (ms >= w.end) return 1;
      return (ms - w.start) / Math.max(1e-3, w.end - w.start);
    },
    /** 整句唱到第几个字符（逐字擦除用），0..text.length */
    lineCharProgress(l, ms) {
      if (!l) return 0;
      let chars = 0;
      for (const w of l.words) {
        const p = this.wordProgress(w, ms);
        chars += p * w.w.length;
        if (p < 1) break;
        chars += 1; // 词间空格
      }
      return Math.min(chars, l.text.length);
    },
  };
}

export const lyrics = makeLyrics(load());
