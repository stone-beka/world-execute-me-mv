/**
 * scene-server.js — P1 预览器的 HTTP 服务器（可测）
 *
 * 端点：GET / 页面 · GET /info JSON · GET /frame?ms= PNG
 * 服务端出帧（renderSceneFrame），所见即成片。
 */
import { createServer } from "node:http";
import { createSurface, surfaceToPNG } from "../../src/core/render.js";
import { renderSceneFrame } from "../../src/scene/render.js";

export function createSceneServer({ scene, info, page }) {
  const surface = createSurface();
  const fps = info.fps || 60;
  const sceneFrames = Math.max(1, Math.round((scene.durationMs / 1000) * fps));

  return createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      res.writeHead(400);
      res.end("bad request");
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page);
      return;
    }

    if (url.pathname === "/info") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(info));
      return;
    }

    if (url.pathname === "/frame") {
      const ms = Number(url.searchParams.get("ms") ?? 0);
      const frame = Math.max(0, Math.min(sceneFrames - 1, Math.round((ms / 1000) * fps)));
      try {
        renderSceneFrame(surface.ctx, scene, frame);
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        res.end(surfaceToPNG(surface));
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(`渲染失败：${err.message}`);
      }
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
}
