import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { registerProjectFonts } from "../src/core/fonts.js";
import { loadBlocks } from "../src/scene/registry.js";
import { normalizeScene } from "../src/scene/format.js";
import { buildInfo, renderPage } from "../tools/lib/scene-view.js";
import { createSceneServer } from "../tools/lib/scene-server.js";

let server;
let base;

before(async () => {
  registerProjectFonts();
  await loadBlocks();
  const scene = normalizeScene({
    id: "t",
    durationMs: 1000,
    elements: [{ id: "a", block: "rect", at: { x: 960, y: 540 }, params: { w: 200, h: 200 } }],
  });
  const info = buildInfo(scene, {
    lyrics: { empty: true, lines: [] },
    sections: [],
    fps: 60,
    width: 1920,
    height: 1080,
  });
  server = createSceneServer({ scene, info, page: renderPage(info) });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  if (server) server.close();
});

test("/info 返回场景信息", async () => {
  const info = await (await fetch(`${base}/info`)).json();
  assert.equal(info.id, "t");
  assert.equal(info.durationMs, 1000);
  assert.equal(info.elements[0].id, "a");
});

test("/frame 返回 PNG，且同 ms 两次逐字节一致", async () => {
  const a = Buffer.from(await (await fetch(`${base}/frame?ms=500`)).arrayBuffer());
  const b = Buffer.from(await (await fetch(`${base}/frame?ms=500`)).arrayBuffer());
  assert.equal(a.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(a.equals(b), "同 ms 两次应逐字节一致");
});

test("/ 返回页面 HTML", async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /场景预览/);
});
