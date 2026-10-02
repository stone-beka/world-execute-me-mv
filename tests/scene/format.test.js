import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScene, SceneFormatError } from "../../src/scene/format.js";

test("normalizeScene 填默认值", () => {
  const s = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 10, y: 20 } }],
  });
  assert.equal(s.elements[0].at.scale, 1);
  assert.equal(s.elements[0].at.rot, 0);
  assert.equal(s.elements[0].at.alpha, 1);
  assert.equal(s.elements[0].life.inMs, 0);
  assert.equal(s.elements[0].life.outMs, 1000);
  assert.equal(s.elements[0].life.fadeInMs, 0);
  assert.deepEqual(s.elements[0].tracks, []);
  assert.equal(s.elements[0].z, 0);
  assert.equal(s.elements[0].notes, "");
});

test("tracks 按 startMs 升序稳定排序", () => {
  const s = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [
      {
        id: "a",
        block: "rect",
        at: { x: 0, y: 0 },
        tracks: [
          { kind: "move", startMs: 500, durMs: 100 },
          { kind: "scale", startMs: 100, durMs: 100 },
        ],
      },
    ],
  });
  assert.deepEqual(
    s.elements[0].tracks.map((t) => t.kind),
    ["scale", "move"],
  );
});

test("缺 durationMs 报错", () => {
  assert.throws(() => normalizeScene({ id: "t", elements: [] }), SceneFormatError);
});

test("elements 为空报错", () => {
  assert.throws(() => normalizeScene({ id: "t", durationMs: 100, elements: [] }), SceneFormatError);
});

test("元素 id 重复报错", () => {
  assert.throws(
    () =>
      normalizeScene({
        id: "t",
        durationMs: 100,
        elements: [
          { id: "a", block: "rect", at: { x: 0, y: 0 } },
          { id: "a", block: "rect", at: { x: 1, y: 1 } },
        ],
      }),
    /id 重复/,
  );
});

test("life.outMs <= inMs 报错", () => {
  assert.throws(
    () =>
      normalizeScene({
        id: "t",
        durationMs: 100,
        elements: [
          { id: "a", block: "rect", at: { x: 0, y: 0 }, life: { inMs: 50, outMs: 50 } },
        ],
      }),
    /outMs/,
  );
});

test("at.x/at.y 非数字报错", () => {
  assert.throws(
    () =>
      normalizeScene({
        id: "t",
        durationMs: 100,
        elements: [{ id: "a", block: "rect", at: { x: "0", y: 0 } }],
      }),
    /at\.x/,
  );
});

test("normalizeScene 浅拷贝 params，不与入参别名", () => {
  const params = { w: 10, h: 20 };
  const s = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 0, y: 0 }, params }],
  });
  assert.notEqual(s.elements[0].params, params);
  assert.deepEqual(s.elements[0].params, { w: 10, h: 20 });
  params.w = 999;
  assert.equal(s.elements[0].params.w, 10);
});

test("cuts 只保留生命区间内、去重、升序", () => {
  const s = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 0, y: 0 }, life: { inMs: 100, outMs: 900 }, cuts: { move: [500, 200, 500, 50, 950] } }],
  });
  assert.deepEqual(s.elements[0].cuts.move, [200, 500]);
  assert.deepEqual(s.elements[0].cuts.scale, []);
});

test("boards-only 场景合法（elements 可为空）", () => {
  const s = normalizeScene({ id: "t", durationMs: 1000, boards: ["shot-01", "shot-02"] });
  assert.deepEqual(s.boards, ["shot-01", "shot-02"]);
  assert.deepEqual(s.elements, []);
});

test("boards 元素必须是字符串", () => {
  assert.throws(
    () => normalizeScene({ id: "t", durationMs: 1000, boards: ["ok", 123] }),
    /boards\[1\]/,
  );
});

test("elements 与 boards 都空报错", () => {
  assert.throws(
    () => normalizeScene({ id: "t", durationMs: 1000, elements: [] }),
    /至少要有一个/,
  );
});
