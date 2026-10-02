import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScene } from "../src/scene/format.js";
import { buildInfo, renderPage } from "../tools/lib/scene-view.js";

const scene = normalizeScene({
  id: "demo",
  title: "Demo",
  durationMs: 8000,
  boards: ["shot-01"],
  elements: [{ id: "a", block: "rect", at: { x: 1, y: 2 }, notes: "hi" }],
});

test("buildInfo 形状与标记", () => {
  const info = buildInfo(scene, {
    lyrics: { empty: false, lines: [{ start: 0, end: 1000, text: "hello" }] },
    sections: [{ startMs: 0, endMs: 4000, name: "s1" }],
    fps: 60,
    width: 1920,
    height: 1080,
    boardRanges: [{ id: "shot-01", startMs: 0, endMs: 12000 }],
  });
  assert.equal(info.id, "demo");
  assert.equal(info.boards[0].id, "shot-01");
  assert.equal(info.boards[0].endMs, 12000);
  assert.equal(info.elements[0].notes, "hi");
  assert.equal(info.elements[0].block, "rect");
  assert.equal(info.markers.lyrics[0].text, "hello");
  assert.equal(info.markers.sections[0].name, "s1");
});

test("renderPage 含时长、滑块、/frame、元素备注与标题", () => {
  const html = renderPage(
    buildInfo(scene, { lyrics: { empty: true, lines: [] }, sections: [], fps: 60, width: 1920, height: 1080 }),
  );
  assert.match(html, /max="8000"/);
  assert.match(html, /\/frame\?ms=/);
  assert.match(html, /hi/);
  assert.match(html, /场景预览/);
  assert.match(html, /window\.__INFO__/);
});
