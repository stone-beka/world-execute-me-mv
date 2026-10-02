import { test } from "node:test";
import assert from "node:assert/strict";
import { resetBlocks, getElementBlock, loadBlocks, assertSceneBlocks } from "../../src/scene/registry.js";
import { normalizeScene } from "../../src/scene/format.js";

test("未加载时查询未知元素块会报错", () => {
  resetBlocks();
  assert.throws(() => getElementBlock("nope"), /未知元素块 "nope"/);
});

test("assertSceneBlocks 拒绝同元素同通道的时间窗重叠", async () => {
  resetBlocks();
  await loadBlocks();
  const scene = normalizeScene({
    id: "overlap",
    durationMs: 4000,
    elements: [
      {
        id: "a",
        block: "rect",
        at: { x: 0, y: 0 },
        tracks: [
          { kind: "move", path: "line", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, startMs: 0, durMs: 1000 },
          { kind: "move", path: "line", from: { x: 100, y: 0 }, to: { x: 200, y: 0 }, startMs: 500, durMs: 1000 },
        ],
      },
    ],
  });
  assert.throws(() => assertSceneBlocks(scene), /通道 "x" 时间窗重叠/);
});

test("assertSceneBlocks 接受同通道不重叠的轨迹", async () => {
  resetBlocks();
  await loadBlocks();
  const scene = normalizeScene({
    id: "ok",
    durationMs: 4000,
    elements: [
      {
        id: "a",
        block: "rect",
        at: { x: 0, y: 0 },
        tracks: [
          { kind: "move", path: "line", from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, startMs: 0, durMs: 1000 },
          { kind: "move", path: "line", from: { x: 100, y: 0 }, to: { x: 200, y: 0 }, startMs: 1000, durMs: 1000 },
        ],
      },
    ],
  });
  assert.doesNotThrow(() => assertSceneBlocks(scene));
});
