/**
 * verify/lib/record-ctx.js — 录制式画布（recording canvas）
 *
 * 把真实的 CanvasRenderingContext2D 包一层 Proxy：
 *   · 每一个绘图调用照常转发给真 ctx —— 所以像素和平时一模一样
 *   · 同时把调用流记下来，数「落墨」的图元 (ink)
 *   · 追踪 save / restore 配对（漏 restore 会污染下一块画板的绘制状态）
 *
 * 为什么需要它：覆盖率如果只验证「画板注册了」，那对一个
 * 「每块画板都在抛异常、什么都没画」的版本也会报 100%。
 * 要验证「真的画出来了」，就必须看它到底往画布上落了多少图元。
 * 思路来自 Galen563/world.execute-me 的 `_tools/stub-env.js`；这里改成
 * 「包住真 ctx」而不是「假造一个 ctx」，因为我们本来就有真画布（@napi-rs/canvas）。
 */

/** 真正往画布上落墨的调用。beginPath/stroke/fill 只是壳，不算。 */
const INK_OPS = new Set([
  "moveTo",
  "lineTo",
  "quadraticCurveTo",
  "bezierCurveTo",
  "arc",
  "arcTo",
  "ellipse",
  "rect",
  "roundRect",
  "fillRect",
  "strokeRect",
  "fillText",
  "strokeText",
]);

/** 会改变后续绘制结果的样式属性：记下来，帧指纹才分得出「同一串调用但换了颜色」 */
const STYLE_PROPS = new Set([
  "fillStyle",
  "strokeStyle",
  "lineWidth",
  "font",
  "globalAlpha",
  "globalCompositeOperation",
  "textAlign",
  "textBaseline",
  "lineCap",
  "lineJoin",
  "lineDashOffset",
  "shadowBlur",
  "shadowColor",
  "filter",
  "miterLimit",
  "imageSmoothingEnabled",
]);

const num = (v) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v;

const fmt = (v) => {
  if (typeof v === "string") return v.length > 48 ? v.slice(0, 48) : v;
  return String(num(v));
};

/**
 * 在真 ctx 外套一层录制层。
 * @param {CanvasRenderingContext2D} realCtx
 * @returns {{ ctx, log, stats, reset, digest }}
 *   stats: { calls, ink, depth, maxDepth, unbalanced }
 */
export function createRecorder(realCtx) {
  const log = [];
  const stats = { calls: 0, ink: 0, depth: 0, maxDepth: 0, unbalanced: 0 };
  const wrappers = new Map();

  const wrap = (prop, fn) => {
    let w = wrappers.get(prop);
    if (w) return w;
    w = (...args) => {
      log.push(prop + "(" + args.map(fmt).join(",") + ")");
      stats.calls++;
      if (INK_OPS.has(prop)) stats.ink++;
      if (prop === "save") {
        stats.depth++;
        if (stats.depth > stats.maxDepth) stats.maxDepth = stats.depth;
      } else if (prop === "restore") {
        stats.depth--;
        if (stats.depth < 0) stats.unbalanced++;
      }
      return fn.apply(realCtx, args);
    };
    wrappers.set(prop, w);
    return w;
  };

  const ctx = new Proxy(realCtx, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target);
      if (typeof v === "function") return wrap(String(prop), v);
      return v;
    },
    set(target, prop, value) {
      target[prop] = value;
      const key = String(prop);
      if (STYLE_PROPS.has(key)) log.push(key + "=" + fmt(value));
      return true;
    },
  });

  return {
    ctx,
    log,
    stats,
    /** 清空记录（每个采样点之间调用），并把深度归零 */
    reset() {
      log.length = 0;
      stats.calls = 0;
      stats.ink = 0;
      stats.depth = 0;
      stats.maxDepth = 0;
      stats.unbalanced = 0;
    },
    /** 调用流的确定性指纹：两帧同指纹 = 同一幅画（结构层，不看像素） */
    digest() {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < log.length; i++) {
        const s = log[i];
        for (let k = 0; k < s.length; k++) {
          h ^= s.charCodeAt(k);
          h = Math.imul(h, 16777619) >>> 0;
        }
      }
      return h.toString(16).padStart(8, "0");
    },
  };
}
