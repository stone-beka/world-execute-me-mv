import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createSurface, ts } from "../../src/core/render.js";
import { registerProjectFonts } from "../../src/core/fonts.js";
import { loadBlocks } from "../../src/scene/registry.js";
import { normalizeScene } from "../../src/scene/format.js";
import { renderSceneFrame } from "../../src/scene/render.js";

before(async () => { registerProjectFonts(); await loadBlocks(); });

const scene = normalizeScene({
  id: "t",
  durationMs: 1000,
  elements: [{ id: "a", block: "rect", at: { x: 900, y: 500 }, params: { w: 200, h: 120 } }],
});

const hash = (surface) => createHash("sha1").update(surface.ctx.getImageData(0, 0, ts.width, ts.height).data).digest("hex");

test("渲染出非底色像素（关地板）", () => {
  const s = createSurface();
  renderSceneFrame(s.ctx, scene, 0, { floor: false });
  const d = s.ctx.getImageData(0, 0, ts.width, ts.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] !== 5 || d[i + 1] !== 7 || d[i + 2] !== 10) n++;
  assert.ok(n > 1000, `非底色像素 ${n}`);
});

test("同帧两次逐字节一致", () => {
  const a = createSurface();
  const b = createSurface();
  renderSceneFrame(a.ctx, scene, 12, { floor: false, samples: 4 });
  renderSceneFrame(b.ctx, scene, 12, { floor: false, samples: 4 });
  assert.equal(hash(a), hash(b));
});

test("evaluateScene 记录用到的块", () => {
  const s = createSurface();
  const used = new Set();
  renderSceneFrame(s.ctx, scene, 0, { floor: false, used });
  assert.ok(used.has("element:rect"));
});
