import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createSurface } from "../../src/core/render.js";
import { registerProjectFonts } from "../../src/core/fonts.js";
import { loadBlocks } from "../../src/scene/registry.js";
import { normalizeScene } from "../../src/scene/format.js";
import { renderSceneFrame } from "../../src/scene/render.js";

before(async () => {
  registerProjectFonts();
  await loadBlocks();
});

function scene(bg) {
  return normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 960, y: 540 }, params: { w: 100, h: 100 } }],
    ...(bg ? { bgfx: bg } : {}),
  });
}

test("bgfx 段叠加在整帧上，并记入 used", () => {
  const plain = scene(null);
  const tinted = scene([{ startMs: 0, endMs: 1000, block: "tint", params: { color: "#ff0000", alpha: 0.5 } }]);
  const a = createSurface();
  const b = createSurface();
  renderSceneFrame(a.ctx, plain, 30, { floor: false });
  renderSceneFrame(b.ctx, tinted, 30, { floor: false });
  const da = a.ctx.getImageData(0, 0, 1920, 1080).data;
  const db = b.ctx.getImageData(0, 0, 1920, 1080).data;
  let diff = 0;
  for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++;
  assert.ok(diff > 100000, `tint 应改变大量像素（实际 ${diff}）`);

  const used = new Set();
  const c = createSurface();
  renderSceneFrame(c.ctx, tinted, 30, { floor: false, used });
  assert.ok(used.has("bgfx:tint"));
});

test("bgfx 段之外不生效", () => {
  const s = scene([{ startMs: 500, endMs: 1000, block: "invert" }]);
  const used = new Set();
  const a = createSurface();
  renderSceneFrame(a.ctx, s, 3, { floor: false, used }); // frame 3 = 50ms，在段外
  assert.ok(!used.has("bgfx:invert"));
});
