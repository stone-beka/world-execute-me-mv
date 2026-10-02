/** element.text.js — 文本元素块（在原点绘制；支持框宽换行、框高纵向排布） */

export default {
  name: "text",
  kind: "element",
  params: {
    text: { type: "string", default: "world.execute(me);" },
    size: { type: "number", default: 22 },
    weight: { type: "number", default: 400 },
    color: { type: "color", default: "#c8f0e8" },
    width: { type: "number", default: 0 },
    height: { type: "number", default: 0 },
    lineHeight: { type: "number", default: 1.35 },
    align: { type: "string", default: "center" },
  },
  sizeOf(p) {
    const size = p.size ?? 22;
    const lh = size * (p.lineHeight ?? 1.35);
    const maxW = p.width ?? 0;
    return { w: maxW > 0 ? maxW : naturalWidth(p, size), h: (p.height ?? 0) > 0 ? p.height : lineCount(p, size) * lh };
  },
  draw(ctx, s, p) {
    const size = p.size ?? 22;
    ctx.font = s.mono(size, p.weight ?? 400);
    ctx.textBaseline = "middle";
    ctx.textAlign = p.align ?? "center";
    ctx.fillStyle = p.color ?? s.colors.fg;
    const maxW = p.width ?? 0;
    const lines = maxW > 0 ? wrap(ctx, String(p.text ?? ""), maxW) : [String(p.text ?? "")];
    const lh = size * (p.lineHeight ?? 1.35);
    const totalH = lines.length * lh;
    const boxH = p.height ?? 0;
    const top = boxH > 0 ? -boxH / 2 + (boxH - totalH) / 2 : -totalH / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * lh + lh / 2));
  },
};

function lineCount(p, size) {
  const maxW = p.width ?? 0;
  const text = String(p.text ?? "");
  if (maxW <= 0) return 1;
  const est = Math.max(size * 0.6, 1);
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const wl = w.length * est;
    const add = cur === 0 ? wl : cur + est + wl;
    if (add > maxW && cur > 0) {
      lines++;
      cur = wl;
    } else cur = add;
  }
  return lines;
}

function naturalWidth(p, size) {
  const est = Math.max(size * 0.6, 1);
  return String(p.text ?? "").length * est;
}

/** 贪心按宽度换行（按空格断词；超长单词不拆） */
function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
