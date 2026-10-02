/**
 * format.js — 场景格式校验 + 默认值
 *
 * 只管结构，不认识任何块（块名合法性由 registry.assertSceneBlocks 负责）。
 * 纯函数：normalizeScene(raw) 不修改入参，返回规整后的新对象。
 */

export class SceneFormatError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "SceneFormatError";
  }
}

const num = (v, d) => (Number.isFinite(v) ? v : d);

export function normalizeScene(raw) {
  if (!raw || typeof raw !== "object") throw new SceneFormatError("场景必须是一个对象");
  if (typeof raw.id !== "string" || !raw.id) throw new SceneFormatError("场景缺少字符串 id");
  if (!Number.isFinite(raw.durationMs) || raw.durationMs <= 0) {
    throw new SceneFormatError(`场景 "${raw.id}" 的 durationMs 必须是正数`);
  }
  if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
    throw new SceneFormatError(`场景 "${raw.id}" 的 elements 必须是非空数组`);
  }

  const seen = new Set();
  const elements = raw.elements.map((el, i) => normalizeElement(el, i, raw.durationMs, seen));
  elements.sort((a, b) => a.z - b.z);
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    durationMs: raw.durationMs,
    background: typeof raw.background === "string" ? raw.background : null,
    elements,
  };
}

function normalizeElement(el, i, durationMs, seen) {
  const where = `elements[${i}]`;
  if (!el || typeof el !== "object") throw new SceneFormatError(`${where} 必须是对象`);
  if (typeof el.id !== "string" || !el.id) throw new SceneFormatError(`${where} 缺少字符串 id`);
  if (seen.has(el.id)) throw new SceneFormatError(`元素 id 重复：${el.id}`);
  seen.add(el.id);
  if (typeof el.block !== "string" || !el.block) {
    throw new SceneFormatError(`元素 "${el.id}" 缺少字符串 block`);
  }
  if (!el.at || !Number.isFinite(el.at?.x) || !Number.isFinite(el.at?.y)) {
    throw new SceneFormatError(`元素 "${el.id}" 的 at.x/at.y 必须是数字`);
  }

  const inMs = num(el.life?.inMs, 0);
  const outMs = num(el.life?.outMs, durationMs);
  if (outMs <= inMs) {
    throw new SceneFormatError(`元素 "${el.id}" 的 life.outMs (${outMs}) 必须大于 inMs (${inMs})`);
  }

  const tracks = (Array.isArray(el.tracks) ? el.tracks : [])
    .map((seg, j) => normalizeTrack(seg, el.id, j))
    .sort((a, b) => a.startMs - b.startMs);

  return {
    id: el.id,
    block: el.block,
    params: el.params && typeof el.params === "object" ? el.params : {},
    at: {
      x: el.at.x,
      y: el.at.y,
      scale: num(el.at.scale, 1),
      rot: num(el.at.rot, 0),
      alpha: num(el.at.alpha, 1),
    },
    life: { inMs, outMs, fadeInMs: num(el.life?.fadeInMs, 0), fadeOutMs: num(el.life?.fadeOutMs, 0) },
    tracks,
    z: num(el.z, 0),
    notes: typeof el.notes === "string" ? el.notes : "",
  };
}

function normalizeTrack(seg, elId, j) {
  const where = `元素 "${elId}" 的 tracks[${j}]`;
  if (!seg || typeof seg !== "object") throw new SceneFormatError(`${where} 必须是对象`);
  if (typeof seg.kind !== "string" || !seg.kind) throw new SceneFormatError(`${where} 缺少字符串 kind`);
  const startMs = num(seg.startMs, 0);
  const durMs = num(seg.durMs, 0);
  if (startMs < 0) throw new SceneFormatError(`${where} 的 startMs 不能为负`);
  if (durMs < 0) throw new SceneFormatError(`${where} 的 durMs 不能为负`);
  return { ...seg, kind: seg.kind, startMs, durMs, ease: seg.ease ?? "inout" };
}
