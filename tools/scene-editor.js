/**
 * tools/scene-editor.js — P2 场景编辑器（本地网页）
 *
 *   npm run scene:edit                                  # 默认 scenes/p0-demo.json
 *   npm run scene:edit -- --file scenes/full-mv.json
 *   npm run scene:edit -- --file scenes/p0-demo.json --port 7713
 *
 * 复用服务端出帧；可放置/选中/拖动元素、改属性·参数·生命期·备注、增删轨迹与特效、保存回 JSON。
 * v1 不含嵌套/组。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, fps, sections } from "../src/core/timeline.js";
import { ts } from "../src/core/render.js";
import { registerProjectFonts } from "../src/core/fonts.js";
import { lyrics } from "../src/core/lyrics.js";
import { boards, resolveRange } from "../src/core/registry.js";
import { normalizeScene, SceneFormatError } from "../src/scene/format.js";
import { loadBlocks, assertSceneBlocks, blockSchemas } from "../src/scene/registry.js";
import { ensureBoardsLoaded, validateBoardIds } from "../src/scene/board-layer.js";
import { buildInfo } from "./lib/scene-view.js";
import { renderEditorPage } from "./lib/editor-page.js";
import { createEditorServer } from "./lib/editor-server.js";

const argv = process.argv.slice(2);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};

const FILE = getStr("file", "scenes/p0-demo.json");
const PORT = Number(getStr("port", 7713));
const scenePath = resolve(ROOT, FILE);

registerProjectFonts();
await loadBlocks();

let scene;
try {
  scene = normalizeScene(JSON.parse(readFileSync(scenePath, "utf8")));
  assertSceneBlocks(scene);
  if (scene.boards.length) {
    await ensureBoardsLoaded();
    validateBoardIds(scene.boards);
  }
} catch (err) {
  if (err instanceof SceneFormatError) console.error(`❌ 场景格式错误：${err.message}`);
  else console.error(`❌ 加载场景失败：${err.message}`);
  process.exit(1);
}

const boardRanges = scene.boards.map((id) => {
  const b = boards.find((x) => x.meta.id === id);
  const r = resolveRange(b.meta);
  return { id, startMs: r.startMs, endMs: r.endMs };
});

const info = buildInfo(scene, {
  lyrics,
  sections,
  fps,
  width: ts.width,
  height: ts.height,
  boardRanges,
});
const blocks = blockSchemas();
const page = renderEditorPage({ scene, info, blocks });

createEditorServer({ scenePath, scene, info, blocks, page }).listen(PORT, () => {
  console.log(`▶ 场景编辑器：http://localhost:${PORT}  （${FILE}）`);
  console.log("  点模板→画面点一下放下 · 点元素选中/拖动 · 改完点保存（会写回 JSON，先备份 .bak）");
});
