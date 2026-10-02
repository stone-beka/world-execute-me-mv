import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createSurface, ts } from "../../src/core/render.js";
import { registerProjectFonts } from "../../src/core/fonts.js";
import { loadBlocks } from "../../src/scene/registry.js";
import { normalizeScene } from "../../src/scene/format.js";
import { renderSceneFrame } from "../../src/scene/render.js";
import { ensureBoardsLoaded, validateBoardIds } from "../../src/scene/board-layer.js";

before(async () => {
  registerProjectFonts();
  await loadBlocks();
  await ensureBoardsLoaded();
});

/** 非底色像素数（场景底色 #05070a = 5,7,10，不透明） */
function inkAt(scene, sec) {
  const surface = createSurface();
  renderSceneFrame(surface.ctx, scene, Math.round(sec * ts.fps), { floor: false });
  const d = surface.ctx.getImageData(0, 0, ts.width, ts.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] !== 5 || d[i + 1] !== 7 || d[i + 2] !== 10) n++;
  }
  return n;
}

test("boards-only 场景合法：shot-01 时段内有落墨、时段外无", () => {
  const scene = normalizeScene({ id: "b", durationMs: 212000, boards: ["shot-01"] });
  assert.ok(inkAt(scene, 1) > 1000, "1s 应有落墨");
  assert.equal(inkAt(scene, 20), 0, "20s 在 shot-01 (0.02–12.93s) 之外 → 应无落墨");
});

test("used 记录 board:<id>", () => {
  const scene = normalizeScene({ id: "b", durationMs: 212000, boards: ["shot-01"] });
  const surface = createSurface();
  const used = new Set();
  renderSceneFrame(surface.ctx, scene, Math.round(1 * ts.fps), { floor: false, used });
  assert.ok(used.has("board:shot-01"));
});

test("未知画板 id 报错", () => {
  assert.throws(() => validateBoardIds(["nope"]), /未知画板/);
});

test("同帧两次逐字节一致（含画板）", () => {
  const scene = normalizeScene({ id: "b", durationMs: 212000, boards: ["shot-03"] });
  const a = createSurface();
  const b = createSurface();
  const f = Math.round(45 * ts.fps);
  renderSceneFrame(a.ctx, scene, f, { floor: false });
  renderSceneFrame(b.ctx, scene, f, { floor: false });
  const h = (x) =>
    createHash("sha1").update(x.ctx.getImageData(0, 0, ts.width, ts.height).data).digest("hex");
  assert.equal(h(a), h(b));
});
