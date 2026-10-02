/**
 * registry.js — 块注册表
 *
 * 块分三类：element（画什么）、track（怎么动/缩放）、fx（加什么）。
 * AI 新增一个块 = 新增一个文件 + 在 MANIFEST 里加一行；编辑器的菜单将来从这里生成。
 */

const MANIFEST = [
  "./blocks/element.rect.js",
  "./blocks/element.text.js",
  "./blocks/element.wireHeart.js",
  "./blocks/track.move.js",
  "./blocks/track.scale.js",
  "./blocks/fx.glow.js",
];

const elements = new Map();
const tracks = new Map();
const fx = new Map();
let loaded = false;

export async function loadBlocks() {
  if (loaded) return;
  for (const rel of MANIFEST) {
    const mod = await import(new URL(rel, import.meta.url).href);
    const b = mod.default;
    if (!b || typeof b.name !== "string" || typeof b.kind !== "string") {
      throw new Error(`块文件 ${rel} 必须默认导出 { name, kind, ... }`);
    }
    const table = b.kind === "element" ? elements : b.kind === "track" ? tracks : b.kind === "fx" ? fx : null;
    if (!table) throw new Error(`块 ${b.name}（${rel}）的 kind 非法："${b.kind}"（只允许 element/track/fx）`);
    if (table.has(b.name)) throw new Error(`块名重复："${b.name}"`);
    table.set(b.name, b);
  }
  loaded = true;
}

export function getElementBlock(name) {
  const b = elements.get(name);
  if (!b) throw new Error(`未知元素块 "${name}"。可用：${[...elements.keys()].join(", ")}`);
  return b;
}

export function getTrackBlock(name) {
  const b = tracks.get(name);
  if (!b) throw new Error(`未知轨迹块 "${name}"。可用：${[...tracks.keys()].join(", ")}`);
  return b;
}

export function getFxBlock(name) {
  const b = fx.get(name);
  if (!b) throw new Error(`未知特效块 "${name}"。可用：${[...fx.keys()].join(", ")}`);
  return b;
}

export function names() {
  return { elements: [...elements.keys()], tracks: [...tracks.keys()], fx: [...fx.keys()] };
}

/** 遍历场景，逐个校验块存在（找不到会抛错并列出可用块） */
export function assertSceneBlocks(scene) {
  for (const el of scene.elements) {
    getElementBlock(el.block);
    for (const seg of el.tracks) {
      if (seg.kind === "fx") getFxBlock(seg.block);
      else getTrackBlock(seg.kind);
    }
  }
}

/** 仅供测试：清空注册表 */
export function resetBlocks() {
  elements.clear();
  tracks.clear();
  fx.clear();
  loaded = false;
}
