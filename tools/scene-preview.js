/**
 * tools/scene-preview.js — P1 只读预览器
 *
 *   npm run scene:preview                       # 默认预览 scenes/p0-demo.json
 *   npm run scene:preview -- --file scenes/full-mv.json
 *   npm run scene:preview -- --file scenes/full-mv.json --port 7712
 *
 * 纯 node http，无依赖；服务端出帧。页面只读：拖时间轴 / ← → 看场景。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, fps, sections } from "../src/core/timeline.js";
import { ts } from "../src/core/render.js";
import { registerProjectFonts } from "../src/core/fonts.js";
import { lyrics } from "../src/core/lyrics.js";
import { boards, resolveRange } from "../src/core/registry.js";
import { normalizeScene, SceneFormatError } from "../src/scene/format.js";
import { loadBlocks, assertSceneBlocks } from "../src/scene/registry.js";
import { ensureBoardsLoaded, validateBoardIds } from "../src/scene/board-layer.js";
import { buildInfo, renderPage } from "./lib/scene-view.js";
import { createSceneServer } from "./lib/scene-server.js";

const argv = process.argv.slice(2);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};

const FILE = getStr("file", "scenes/p0-demo.json");
const PORT = Number(getStr("port", 7712));

registerProjectFonts();
await loadBlocks();

let scene;
try {
  scene = normalizeScene(JSON.parse(readFileSync(resolve(ROOT, FILE), "utf8")));
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
const page = renderPage(info);

createSceneServer({ scene, info, page }).listen(PORT, () => {
  console.log(`▶ 场景预览：http://localhost:${PORT}  （${FILE}）`);
  console.log("  只读 · 拖时间轴 / ← → 选帧（Shift 微调）");
});
