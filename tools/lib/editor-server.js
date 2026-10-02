/**
 * editor-server.js — P2 编辑器的 HTTP 服务器（可测）
 *
 *   GET  /            编辑器页面
 *   GET  /scene       当前场景 JSON
 *   GET  /blocks      块清单 + 参数 schema（驱动调色板/属性面板）
 *   GET  /resolve?ms= 每个元素在该时刻的解析结果（供选中/拖拽）
 *   GET  /frame?ms=   该时刻 PNG
 *   POST /save        写回场景文件（先备份 .bak）；校验失败返回 400 且不改文件
 */
import { createServer } from "node:http";
import { writeFileSync, copyFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { ts, createSurface, surfaceToPNG } from "../../src/core/render.js";
import { renderSceneFrame } from "../../src/scene/render.js";
import { resolveElement } from "../../src/scene/evaluate.js";
import { normalizeScene } from "../../src/scene/format.js";
import { assertSceneBlocks, getElementBlock } from "../../src/scene/registry.js";

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createEditorServer({ scenePath, scene, info, blocks, page, audioPath = null, onSceneChange }) {
  const surface = createSurface();
  const surfaces = new Map();
  const surfaceFor = (scale) => {
    const key = String(scale);
    let s = surfaces.get(key);
    if (!s) {
      s = createSurface(Math.round(ts.width * scale), Math.round(ts.height * scale));
      surfaces.set(key, s);
    }
    return s;
  };
  const fps = info.fps || 60;

  const frameCount = () => Math.max(1, Math.round((scene.durationMs / 1000) * fps));

  return createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      res.writeHead(400);
      res.end("bad request");
      return;
    }
    const json = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(obj));
    };

    try {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(page);
        return;
      }
      if (req.method === "GET" && url.pathname === "/scene") {
        json(200, scene);
        return;
      }
      if (req.method === "GET" && url.pathname === "/blocks") {
        json(200, blocks);
        return;
      }
      if (req.method === "GET" && url.pathname === "/resolve") {
        const ms = Number(url.searchParams.get("ms") ?? 0);
        const items = scene.elements.map((el) => {
          const r = resolveElement(el, ms);
          let size = null;
          try {
            const b = getElementBlock(el.block);
            if (typeof b.sizeOf === "function") size = b.sizeOf(el.params ?? {});
          } catch {
            size = null;
          }
          return {
            id: el.id,
            block: el.block,
            z: el.z,
            visible: r.visible,
            x: r.x,
            y: r.y,
            scale: r.scale,
            rot: r.rot,
            alpha: r.alpha,
            size,
          };
        });
        json(200, { ms, items });
        return;
      }
      if (req.method === "GET" && url.pathname === "/frame") {
        const ms = Number(url.searchParams.get("ms") ?? 0);
        const scale = Math.min(1, Math.max(0.1, Number(url.searchParams.get("scale") ?? 1)));
        const frame = Math.max(0, Math.min(frameCount() - 1, Math.round((ms / 1000) * fps)));
        let target = surface;
        if (scale !== 1) {
          target = surfaceFor(scale);
          const c = target.ctx;
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.clearRect(0, 0, target.canvas.width, target.canvas.height);
          c.save();
          c.scale(scale, scale);
          renderSceneFrame(c, scene, frame);
          c.restore();
        } else {
          renderSceneFrame(surface.ctx, scene, frame);
        }
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        res.end(surfaceToPNG(target));
        return;
      }
      if (req.method === "POST" && url.pathname === "/working") {
        const raw = await readBody(req);
        let next;
        try {
          next = normalizeScene(JSON.parse(raw));
          assertSceneBlocks(next);
        } catch (err) {
          json(400, { ok: false, error: err.message });
          return;
        }
        scene = next; // 只更新内存工作场景，不落盘
        json(200, { ok: true, elements: next.elements.length });
        return;
      }
      if (req.method === "POST" && url.pathname === "/save") {
        const raw = await readBody(req);
        let next;
        try {
          next = normalizeScene(JSON.parse(raw));
          assertSceneBlocks(next);
        } catch (err) {
          json(400, { ok: false, error: err.message });
          return;
        }
        if (existsSync(scenePath)) copyFileSync(scenePath, `${scenePath}.bak`);
        writeFileSync(scenePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
        scene = next;
        if (onSceneChange) onSceneChange(next);
        json(200, { ok: true, elements: next.elements.length });
        return;
      }
      if (req.method === "GET" && url.pathname === "/audio") {
        if (!audioPath || !existsSync(audioPath)) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("no audio");
          return;
        }
        const size = statSync(audioPath).size;
        const range = req.headers.range;
        const m = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
        if (m) {
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : size - 1;
          res.writeHead(206, {
            "content-type": "audio/wav",
            "accept-ranges": "bytes",
            "content-range": `bytes ${start}-${end}/${size}`,
            "content-length": end - start + 1,
          });
          createReadStream(audioPath, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { "content-type": "audio/wav", "accept-ranges": "bytes", "content-length": size });
          createReadStream(audioPath).pipe(res);
        }
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    } catch (err) {
      json(500, { ok: false, error: err.message });
    }
  });
}
