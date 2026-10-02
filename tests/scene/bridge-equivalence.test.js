import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { initEngine, createSurface, renderFrame, ts } from "../../src/core/render.js";
import { boards } from "../../src/core/registry.js";
import { normalizeScene } from "../../src/scene/format.js";
import { renderSceneFrame } from "../../src/scene/render.js";

let fullScene;

before(async () => {
  await initEngine(); // 注册字体 + 加载 14 块画板
  const ids = boards.map((b) => b.meta.id);
  fullScene = normalizeScene({ id: "full-mv", durationMs: 212000, boards: ids });
});

function hash(surface) {
  return createHash("sha1").update(surface.ctx.getImageData(0, 0, ts.width, ts.height).data).digest("hex");
}

test("桥接：boards-only 场景与旧引擎逐字节等价", () => {
  for (const sec of [1, 15, 45, 100, 200]) {
    const f = Math.round(sec * ts.fps);
    const a = createSurface();
    const b = createSurface();
    renderFrame(a.ctx, f); // 旧引擎（core/render.js）
    renderSceneFrame(b.ctx, fullScene, f); // 场景引擎（boards 桥接）
    assert.equal(hash(a), hash(b), `t=${sec}s 渲染结果不一致`);
  }
});
