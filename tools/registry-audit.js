/**
 * tools/registry-audit.js — 「装置漏登记」检测
 *
 * 为什么有它（接 2026-09-29 检查器交接）：
 * 检查器的元素清单已经改成**运行时登记**（装置画的时候自己 reg() 报名），
 * 这解决了「循环里画的 / 坐标算出来的」静态扫不到的问题。但它带来一个新风险：
 * **某个装置忘了写 reg()，或者某个画板的分支根本没被跑到** ——
 * 检查器会**静默少列**一个元素，而你看不出来少的是什么。
 *
 * 这个检查就是那道网。它做三件事：
 *   ① 装置自检：_ui.js 里每个「会画东西」的函数（第一个参数是 ctx），
 *      要么有 reg()，要么在**免登记名单**里有明确理由（背景/全屏/特效/投影）。
 *   ② 静态调用 × 运行时登记：静态只认「装置名」（不认坐标），所以变量坐标也能覆盖；
 *      运行时把全片密采样一遍，看这个装置到底有没有真的报名。叫了却从没登记 = 可疑。
 *   ③ 按画板点名：指出是**哪一块**画板漏了。
 *
 * 用法：
 *   node tools/registry-audit.js              # 全片采样（默认每 0.5s 一帧）
 *   node tools/registry-audit.js --step 250   # 采样更密（ms）
 *   node tools/registry-audit.js --json       # 机器可读 Result
 *
 * 退出码：0 = 没有漏登记；1 = 有（非免登记名单里的漏项）。
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ts, initEngine, createSurface, renderFrame } from "../src/core/render.js";
import { ROOT } from "../src/core/timeline.js";

const BOARD_DIR = resolve(ROOT, "src", "boards");
const UI_FILE = join(BOARD_DIR, "_ui.js");

/**
 * 免登记名单：这些「会画东西」的装置**故意**不登记（登记了只是往清单里灌噪音）。
 * 每一条都必须有理由 —— 没理由就不许进这张表，否则这道网自己就漏了。
 */
const NO_REG = {
  desk: "全局背景层（图层面板里单独开关）",
  gridBg: "全屏背景网格",
  chessFloor: "全屏背景棋盘（透视地板，跨 shot-01/02）",
  redAlarm: "全屏告警色块（占满整屏，登记成一个框没意义）",
  blueScreen: "全屏蓝屏",
  shadow: "面板投影（panel 身体的一部分，不是独立元素）",
  glitchSlice: "帧内特效（fxOn 开关，归「帧内特效」图层）",
  flashWhite: "帧内特效",
  radarSweep: "帧内特效",
  ripple: "帧内特效",
  scanBand: "帧内特效",
  scanlines: "帧内特效",
};

// ---------------------------------------------------------------- 源码解析

/**
 * 把 _ui.js 里每个顶层 `export function name(...)` 切成 { name, line, body }。
 * 收尾规则：遇到下一个顶层声明（export/function/const/let 或分区注释横幅）就算结束。
 */
function exportedFunctions(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let cur = null;
  const isTopDecl = (l) => /^(export |function |const |let |\/\/ ---)/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const m = /^export function (\w+)\s*\(/.exec(lines[i]);
    if (m) {
      if (cur) out.push(cur);
      cur = { name: m[1], line: i + 1, body: [lines[i]] };
      continue;
    }
    if (cur) {
      if (isTopDecl(lines[i])) {
        out.push(cur);
        cur = null;
      } else {
        cur.body.push(lines[i]);
      }
    }
  }
  if (cur) out.push(cur);
  return out.map((f) => ({ name: f.name, line: f.line, body: f.body.join("\n") }));
}

/** 取函数声明的参数表（到第一个 `)` 为止），判断第一个参数是不是 ctx */
function firstParam(fnBody) {
  const open = fnBody.indexOf("(");
  const close = fnBody.indexOf(")", open);
  return fnBody.slice(open + 1, close).split(",")[0].trim();
}

/** 去掉块注释和行注释（粗粒度即可，这里的源码没有 URL） */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 从 reg(s, 'xxx', …) 里抠出所有已登记的装置名 */
function registeredNames(src) {
  const out = new Set();
  const re = /\breg\(\s*s\s*,\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

/** 某段源码调用了哪些装置（按名字匹配，变量坐标也拦得住） */
function devicesCalledIn(src, names) {
  const code = stripComments(src);
  const out = new Set();
  for (const n of names) {
    if (new RegExp("\\b" + n + "\\s*\\(").test(code)) out.add(n);
  }
  return out;
}

// ---------------------------------------------------------------- 主流程

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const STEP_MS = Math.max(50, Number(getStr("step", 500)));

await initEngine();

// ---- ① 装置自检 --------------------------------------------------
const uiSrc = readFileSync(UI_FILE, "utf8");
const fns = exportedFunctions(uiSrc);
const registered = registeredNames(uiSrc);

const drawers = fns.filter((f) => firstParam(f.body) === "ctx");
const gaps = [];      // 会画、没 reg、也不在免登记名单 → 真漏
const exempt = [];    // 会画、没 reg、但在名单里 → 有意为之
for (const f of drawers) {
  if (registered.has(f.name)) continue;
  if (NO_REG[f.name]) exempt.push({ name: f.name, reason: NO_REG[f.name] });
  else gaps.push({ name: f.name, line: f.line });
}

// ---- 画板源码 & 静态调用 --------------------------------------
const boardFiles = readdirSync(BOARD_DIR)
  .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
  .sort();
const vocabulary = [...new Set([...registered, ...drawers.map((f) => f.name)])];
const staticByBoard = new Map(); // board → Set(device)
for (const f of boardFiles) {
  const board = f.replace(/\.js$/, "");
  staticByBoard.set(board, devicesCalledIn(readFileSync(join(BOARD_DIR, f), "utf8"), vocabulary));
}

// ---- ② 运行时采样：全片密采样，收集每块画板真的登记了哪些装置 ----
const surface = createSurface();
const runtimeByBoard = new Map(); // board → Set(device)
const runtimeHits = new Map();    // "board|device" → 出现帧数
let sampled = 0;
for (let ms = 0; ms < ts.durationMs; ms += STEP_MS) {
  const frame = Math.max(0, Math.min(ts.totalFrames - 1, Math.round((ms / 1000) * ts.fps)));
  const reg = {
    push(e) {
      let set = runtimeByBoard.get(e.board);
      if (!set) runtimeByBoard.set(e.board, (set = new Set()));
      set.add(e.device);
      const key = e.board + "|" + e.device;
      runtimeHits.set(key, (runtimeHits.get(key) ?? 0) + 1);
    },
  };
  renderFrame(surface.ctx, frame, { reg });
  sampled++;
}

// ---- ③ 比对 ----------------------------------------------------
// 3a. 装置级：静态被调用，但运行时**任何**画板都没登记它。
//     免登记名单里的装置本来就该是空的，不算问题。
const deviceLevel = [];
for (const name of vocabulary) {
  if (NO_REG[name] && !registered.has(name)) continue;
  const staticBoards = [...staticByBoard.entries()].filter(([, s]) => s.has(name)).map(([b]) => b);
  if (!staticBoards.length) continue;
  const runtimeBoards = [...runtimeByBoard.entries()].filter(([, s]) => s.has(name)).map(([b]) => b);
  if (runtimeBoards.length === 0) deviceLevel.push({ device: name, calledBy: staticBoards });
}
const neverRegistered = new Set(deviceLevel.map((d) => d.device));

// 3b. 画板级：这块画板静态调了某装置，但从头到尾没登记它。
//     装置级已经报过的（整片从没登记）不再逐块重列，只留「部分画板漏」。
const boardLevel = [];
for (const [board, statics] of staticByBoard) {
  const rt = runtimeByBoard.get(board) ?? new Set();
  for (const d of statics) {
    if (rt.has(d)) continue;
    if (NO_REG[d] && !registered.has(d)) continue; // 有意不登记的，跳过
    if (neverRegistered.has(d)) continue;
    boardLevel.push({ board, device: d });
  }
}

// ---- 报告 ------------------------------------------------------
const line = "══════════════════════════════════════════════════";
const problems = gaps.length + deviceLevel.length + boardLevel.length;

if (has("json")) {
  console.log(JSON.stringify({
    registered: [...registered].sort(),
    exempt, gaps, deviceLevel, boardLevel,
    sampledFrames: sampled, stepMs: STEP_MS,
  }, null, 2));
} else {
  console.log(line);
  console.log(" registry-audit   装置漏登记检测");
  console.log(line);
  console.log("");
  console.log(`① 装置自检（_ui.js ${drawers.length} 个会画 ctx 的函数）`);
  console.log(`   已登记 ${registered.size} 个：${[...registered].sort().join(" ")}`);
  console.log(`   免登记 ${exempt.length} 个：`);
  for (const e of exempt) console.log(`     · ${e.name.padEnd(12)} ${e.reason}`);
  if (gaps.length) {
    console.log(`   ❌ 漏登记 ${gaps.length} 个：`);
    for (const g of gaps) console.log(`     · ${g.name}（_ui.js:${g.line}）会画东西却既没 reg() 也不在免登记名单`);
  } else {
    console.log("   ✅ 没有漏登记");
  }

  console.log("");
  console.log(`② 静态调用 × 运行时登记（采样 ${sampled} 帧，每 ${STEP_MS}ms）`);
  if (!deviceLevel.length) {
    console.log("   ✅ 每个被调用的装置都在运行时登记过");
  } else {
    for (const d of deviceLevel) {
      console.log(`   ❌ ${d.device.padEnd(12)} 从未登记 —— ${d.calledBy.length} 块画板调用：${d.calledBy.join(", ")}`);
    }
  }

  console.log("");
  console.log("③ 按画板点名");
  if (!boardLevel.length) {
    console.log("   ✅ 每块画板的静态调用都对应到了运行时登记");
  } else {
    for (const b of boardLevel) {
      console.log(`   ${b.board}  调用了 ${b.device}，但整段都没登记它${b.inNoReg ? "（免登记，忽略）" : ""}`);
    }
  }

  console.log("");
  console.log(line);
  if (problems) {
    console.log(`❌ registry-audit 发现 ${problems} 处漏登记（见上）`);
  } else {
    console.log("✅ registry-audit 通过：没有装置漏登记");
  }
  console.log(line);
}

process.exit(problems ? 1 : 0);
