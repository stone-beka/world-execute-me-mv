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
