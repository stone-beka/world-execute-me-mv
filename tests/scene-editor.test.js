import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerProjectFonts } from "../src/core/fonts.js";
import { loadBlocks, blockSchemas } from "../src/scene/registry.js";
import { normalizeScene } from "../src/scene/format.js";
import { buildInfo } from "../tools/lib/scene-view.js";
import { renderEditorPage } from "../tools/lib/editor-page.js";
import { createEditorServer } from "../tools/lib/editor-server.js";

let server;
let base;
let scenePath;
let scene;
let pageHTML;

before(async () => {
  registerProjectFonts();
  await loadBlocks();
  scene = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 100, y: 100 }, params: { w: 50, h: 50 } }],
  });
  const info = buildInfo(scene, {
    lyrics: { empty: true, lines: [] },
    sections: [],
    fps: 60,
    width: 1920,
    height: 1080,
  });
  const blocks = blockSchemas();
  pageHTML = renderEditorPage({ scene, info, blocks });
  const dir = mkdtempSync(join(tmpdir(), "scene-edit-"));
  scenePath = join(dir, "scene.json");
  writeFileSync(scenePath, JSON.stringify(scene));
  server = createEditorServer({ scenePath, scene, info, blocks, page: pageHTML });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

test("编辑器页面内联脚本语法合法", () => {
  const m = pageHTML.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, "应能找到 <script> 块");
  assert.doesNotThrow(() => new Function(m[1]), "内联脚本不应有语法错误");
});

after(() => {
  if (server) server.close();
});

test("/blocks 返回块 schema", async () => {
  const b = await (await fetch(`${base}/blocks`)).json();
  assert.ok(b.elements.find((x) => x.name === "rect"), "elements 含 rect");
  assert.ok(b.tracks.find((x) => x.name === "move"), "tracks 含 move");
  assert.ok(b.fx.find((x) => x.name === "glow"), "fx 含 glow");
  assert.ok(b.elements[0].params && typeof b.elements[0].params === "object");
});

test("/resolve 返回元素解析位置", async () => {
  const d = await (await fetch(`${base}/resolve?ms=0`)).json();
  assert.equal(d.items[0].id, "a");
  assert.equal(d.items[0].x, 100);
  assert.equal(d.items[0].y, 100);
});

test("/ 返回编辑器页面", async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /场景编辑器/);
  assert.match(html, /window\.__DATA__/);
});

test("POST /save 写入文件", async () => {
  const next = JSON.parse(JSON.stringify(scene));
  next.elements[0].at.x = 500;
  const r = await (await fetch(`${base}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  })).json();
  assert.equal(r.ok, true);
  const onDisk = JSON.parse(readFileSync(scenePath, "utf8"));
  assert.equal(onDisk.elements[0].at.x, 500);
});

test("POST /working 更新内存工作场景但不落盘", async () => {
  const before = readFileSync(scenePath, "utf8");
  const next = JSON.parse(JSON.stringify(scene));
  next.elements.push({
    id: "b",
    block: "rect",
    params: { w: 30, h: 30 },
    at: { x: 200, y: 200 },
    life: { inMs: 0, outMs: 1000, fadeInMs: 0, fadeOutMs: 0 },
    tracks: [],
    z: 0,
    notes: "",
  });
  const r = await (await fetch(`${base}/working`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  })).json();
  assert.equal(r.ok, true);
  assert.equal(readFileSync(scenePath, "utf8"), before, "工作场景更新不应落盘");
  const d = await (await fetch(`${base}/resolve?ms=0`)).json();
  assert.ok(d.items.find((x) => x.id === "b"), "工作场景应含新元素 b");
});

test("POST /save 非法场景返回 400 且不改文件", async () => {
  const snapshot = readFileSync(scenePath, "utf8");
  const r = await fetch(`${base}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "bad" }),
  });
  assert.equal(r.status, 400);
  assert.equal(readFileSync(scenePath, "utf8"), snapshot);
});
