import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createSurface } from "../../src/core/render.js";
import { normalizeScene } from "../../src/scene/format.js";
import { loadBlocks } from "../../src/scene/registry.js";
import { resolveElement, evaluateScene } from "../../src/scene/evaluate.js";

before(async () => { await loadBlocks(); });

function el(over) {
  return normalizeScene({
    id: "s",
    durationMs: 10000,
    elements: [{ id: "a", block: "rect", at: { x: 0, y: 0 }, ...over }],
  }).elements[0];
}

test("生命周期外不可见，内可见", () => {
  const e = el({ life: { inMs: 1000, outMs: 2000 } });
  assert.equal(resolveElement(e, 500).visible, false);
  assert.equal(resolveElement(e, 2500).visible, false);
  assert.equal(resolveElement(e, 1500).visible, true);
});

test("move 到点后保持", () => {
  const e = el({
    tracks: [{ kind: "move", path: "line", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, startMs: 0, durMs: 1000, ease: "linear" }],
  });
  assert.equal(resolveElement(e, 500).x, 50);
  assert.equal(resolveElement(e, 5000).x, 100);
});

test("fx 只在窗口内激活", () => {
  const e = el({ tracks: [{ kind: "fx", block: "glow", startMs: 1000, durMs: 500 }] });
  assert.equal(resolveElement(e, 500).fx.length, 0);
  assert.equal(resolveElement(e, 1250).fx.length, 1);
  assert.equal(resolveElement(e, 2000).fx.length, 0);
});

test("生命淡入让 alpha 在半个淡入时长处约 0.5", () => {
  const e = el({ life: { inMs: 0, outMs: 1000, fadeInMs: 100 } });
  const a = resolveElement(e, 50).alpha;
  assert.ok(a > 0.4 && a < 0.6, `alpha=${a}`);
});

test("生命淡出的起点 alpha=1，终点前趋近 0", () => {
  const e = el({ life: { inMs: 0, outMs: 1000, fadeOutMs: 200 } });
  assert.ok(resolveElement(e, 700).alpha > 0.99);
  assert.ok(resolveElement(e, 950).alpha > 0 && resolveElement(e, 950).alpha < 0.5);
});

test("scale 轨迹改变 scale", () => {
  const e = el({ tracks: [{ kind: "scale", from: 1, to: 4, startMs: 0, durMs: 1000, ease: "linear" }] });
  assert.equal(resolveElement(e, 500).scale, 2.5);
});

test("evaluateScene 求值崩溃时报错带元素 id 与毫秒", () => {
  const scene = normalizeScene({
    id: "s",
    durationMs: 10000,
    elements: [
      {
        id: "a",
        block: "rect",
        at: { x: 0, y: 0 },
        // move.line 缺 to：resolveElement 内部会抛错
        tracks: [{ kind: "move", path: "line", from: { x: 0, y: 0 }, startMs: 0, durMs: 1000 }],
      },
    ],
  });
  const surface = createSurface();
  assert.throws(() => evaluateScene(surface.ctx, scene, { ms: 500 }), /元素 "a".*ms .*崩溃/);
});
