/**
 * fonts.js — 打包字体
 *
 * 为什么要有这个文件：
 *   AGENTS 的第一条铁律是「同 seed + 同帧号 = 同像素」。系统 monospace
 *   换台机器就换一副字，中文还会渲染成豆腐块 —— 像素承诺当场就破了。
 *   所以字体必须像画板代码一样进版本库。
 *
 * 打包的是 IBM Plex Mono（SIL OFL 1.1，见 assets/fonts/LICENSE.txt），
 * 来源和重新获取方式写在 assets/fonts/README.md。
 *
 * 用法（画板里）：
 *   ctx.font = s.mono(16);         // 400
 *   ctx.font = s.mono(34, 700);    // 粗体
 * 需要直接 import 的场合（比如自己造 ctx）：
 *   import { mono, FONT_MONO } from "../core/fonts.js";
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { GlobalFonts } from "@napi-rs/canvas";
import { ROOT } from "./timeline.js";

export const FONT_MONO = "IBM Plex Mono";
export const FONT_STACK = `"${FONT_MONO}", Consolas, monospace`;

const FACES = [
  "IBMPlexMono-Regular.woff2",
  "IBMPlexMono-Medium.woff2",
  "IBMPlexMono-SemiBold.woff2",
  "IBMPlexMono-Bold.woff2",
  "IBMPlexMono-Italic.woff2",
];

let registered = null;

/**
 * 注册 assets/fonts/ 里的字体。幂等；缺文件不报错（退回系统字体，但会在
 * 控制台提醒一句，免得悄悄退化成「换机器就不一样」的状态）。
 */
export function registerProjectFonts() {
  if (registered) return registered;
  registered = { family: FONT_MONO, faces: [], missing: [] };
  for (const f of FACES) {
    const p = resolve(ROOT, "assets", "fonts", f);
    if (!existsSync(p)) {
      registered.missing.push(f);
      continue;
    }
    try {
      GlobalFonts.registerFromPath(p, FONT_MONO);
      registered.faces.push(f);
    } catch (err) {
      registered.missing.push(`${f} (${err.message})`);
    }
  }
  if (registered.faces.length === 0) {
    console.warn("⚠️  assets/fonts/ 里没有可用字体，退回系统 monospace —— 换机器像素会变");
  } else if (registered.missing.length) {
    console.warn(`⚠️  有字体文件没加载上：${registered.missing.join(", ")}`);
  }
  return registered;
}

/** 造 ctx.font 字符串：mono(16) / mono(34, 700) */
export function mono(px, weight = 400) {
  return `${weight} ${px}px ${FONT_STACK}`;
}
