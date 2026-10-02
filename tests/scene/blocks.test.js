import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createSurface, ts } from "../../src/core/render.js";
import { makeState } from "../../src/core/registry.js";
import { frameState } from "../../src/core/timeline.js";
import { registerProjectFonts } from "../../src/core/fonts.js";

import rect from "../../src/scene/blocks/element.rect.js";
import text from "../../src/scene/blocks/element.text.js";
import wireHeart from "../../src/scene/blocks/element.wireHeart.js";

before(() => registerProjectFonts());

/** 在原点画一块，统计「有落墨」的像素（alpha > 0）。
 *  注意：createSurface() 初始是全透明 [0,0,0,0]，不是底色——
 *  所以只能用 alpha 判定，不能用「非底色」判定（空画布会被误判成墨）。 */
function inkCount(block, params, s) {
  const surface = createSurface();
  const { ctx } = surface;
  ctx.save();
  ctx.translate(400, 300);
  block.draw(ctx, s, params);
  ctx.restore();
  const d = ctx.getImageData(0, 0, ts.width, ts.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) n++;
  return n;
}

const S = () => makeState(0, { ...ts, ...frameState(0) });

test("rect 落在原点附近", () => {
  assert.ok(inkCount(rect, { w: 120, h: 80 }, S()) > 1000);
});

test("text 落墨", () => {
  assert.ok(inkCount(text, { text: "world.execute(me);", size: 40 }, S()) > 200);
});

test("wireHeart 落墨", () => {
  assert.ok(inkCount(wireHeart, { size: 200 }, S()) > 300);
});

test("text 宽度触发换行（sizeOf 高度增加、宽度=设定值）", () => {
  const one = text.sizeOf({ text: "if i can give you all the stimulations", size: 40 });
  const wrapped = text.sizeOf({ text: "if i can give you all the stimulations", size: 40, width: 300 });
  assert.ok(wrapped.h > one.h, `换行后应更高：${wrapped.h} > ${one.h}`);
  assert.equal(wrapped.w, 300);
});

import move from "../../src/scene/blocks/track.move.js";
import scale from "../../src/scene/blocks/track.scale.js";
import glow from "../../src/scene/blocks/fx.glow.js";
import { createSurface as surface } from "../../src/core/render.js";
import { resetBlocks, loadBlocks, names } from "../../src/scene/registry.js";

test("六个块全部载入（Task 2 的完整回归）", async () => {
  resetBlocks();
  await loadBlocks();
  const n = names();
  assert.deepEqual(n.elements.slice().sort(), ["rect", "text", "wireHeart"]);
  assert.deepEqual(n.tracks.slice().sort(), ["move", "scale"]);
  assert.deepEqual(n.fx.slice().sort(), ["fragment", "glow", "jitter"]);
  assert.deepEqual(n.bgfx.slice().sort(), ["flash", "invert", "tint"]);
});

test("move.line 起点/终点/保持", () => {
  const seg = { path: "line", from: { x: 10, y: 20 }, to: { x: 110, y: 20 } };
  const st = { x: 0, y: 0 };
  move.apply(st, 0, seg);
  assert.equal(st.x, 10);
  move.apply(st, 1, seg);
  assert.equal(st.x, 110);
  move.apply(st, 0.5, seg);
  assert.equal(st.x, 60);
});

test("move.orbit 半圈到对侧", () => {
  const seg = { path: "orbit", center: { x: 0, y: 0 }, from: { x: 200, y: 0 }, sweep: 360 };
  const st = { x: 0, y: 0 };
  move.apply(st, 0.5, seg);
  assert.ok(Math.abs(st.x - -200) < 1e-6, `x=${st.x}`);
  assert.ok(Math.abs(st.y) < 1e-6, `y=${st.y}`);
});

test("move.curve 中点等于贝塞尔", () => {
  const seg = { path: "curve", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, via: { x: 50, y: 100 } };
  const st = { x: 0, y: 0 };
  move.apply(st, 0.5, seg);
  assert.equal(st.x, 50);
  assert.equal(st.y, 50);
});

test("move 缺字段抛错", () => {
  assert.throws(() => move.apply({}, 0.5, { path: "line", from: { x: 0, y: 0 } }), /move/);
});

test("scale 线性", () => {
  const st = { scale: 1 };
  scale.apply(st, 0.5, { from: 1, to: 3 });
  assert.equal(st.scale, 2);
});

test("glow 包裹器会多次调用 inner(s = 0 时至少画一次)", () => {
  const sv = surface();
  let calls = 0;
  glow.drawWrapped(sv.ctx, S(), () => { calls++; }, 1, { radius: 10 });
  assert.ok(calls >= 2, `calls=${calls}`);
});
