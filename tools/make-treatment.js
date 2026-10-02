/**
 * tools/make-treatment.js — 生成策划书骨架（docs/策划书.md）
 *
 * 干的活：把已经量好的东西（时间基准、段落候选、每段在唱的歌词、可用的效果词汇）
 * 填进模板，留空的是**只有你能决定**的部分（画什么、怎么动、不要什么）。
 *
 * 为什么用脚本而不是手打：时间和歌词从 assets/ 里读，不会抄错；
 * 以后段落重跑了、歌词改了，可以重新生成一份干净骨架。
 *
 * ⚠️ 默认**拒绝覆盖**已存在的 docs/策划书.md —— 那是你的东西，不能被脚本冲掉。
 *    真要重新生成：先自己备份，或显式 --force。
 *
 * 用法：
 *   npm run make:treatment
 *   node tools/make-treatment.js --out docs/策划书.md
 *   node tools/make-treatment.js --force
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { ROOT, config, MS_PER_BEAT, beatsPerBar, beatOffsetMs, durationMs, sections } from "../src/core/timeline.js";
import { lyrics } from "../src/core/lyrics.js";

const argv = process.argv.slice(2);
const getStr = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(`--${n}`);

const OUT = resolve(ROOT, getStr("out", "docs/策划书.md"));
if (existsSync(OUT) && !has("force")) {
  console.error(`❌ ${basename(OUT)} 已存在，拒绝覆盖。`);
  console.error("   它是你的东西。要重新生成请先自己备份，或加 --force。");
  process.exit(1);
}

// 实测值（有探针就用探针的）
let probe = null;
try {
  probe = JSON.parse(readFileSync(resolve(ROOT, "assets", "audio-probe.json"), "utf8"));
} catch {
  /* 没探针就用 config */
}
const measuredBpm = probe?.bpm ?? config.bpm;
const measuredOffset = probe?.beatOffsetMs ?? beatOffsetMs;
const bpmRow = probe?.bpmCandidates?.[0]?.bpm
  ? `${config.bpm}（自相关最高候选 ${probe.bpmCandidates[0].bpm}，且存在半速/倍速歧义、置信度低 → 以 config 的 ${config.bpm} 为准；首尾相位漂移小，说明它站得住）`
  : `${config.bpm}`;
const offsetRow = probe?.beatOffsetContrast
  ? `音频第 **${measuredOffset.toFixed(1)}ms**（锐度 ${probe.beatOffsetContrast.toFixed(2)}，已人耳确认）`
  : `音频第 **${measuredOffset.toFixed(1)}ms**`;

const fmt = (ms) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};
const bar = (ms) => ((ms - beatOffsetMs) / MS_PER_BEAT / beatsPerBar).toFixed(0);

const linesOf = (s) => lyrics.lines.filter((l) => l.start >= s.startMs - 250 && l.start < s.endMs);

const L = [];
const P = (t = "") => L.push(t);

P("# world.execute(me); MV 策划书");
P("");
P("> **这份是骨架。** 时间和歌词我已经替你填好了，留空的地方只有你能决定。");
P("> 用法：从头往下填，**填不了就留空**（留空我会来问你，比瞎填一个形容词省事）。");
P("> 先填第 3 节（段落表）就够了——那是我能开工的最低要求。");
P(">");
P("> - 第 3 节 **段落表** = 每块**一句话**（薄，先填这个）");
P("> - 第 4 节 **SHOT 清单** = 每块**怎么做**（厚，一次只填一块，不要一次填完）");
P("> - 两节是**同一批 14 块**，序号一一对应");
P(">");
P("> 效果词汇表见 [`docs/效果菜单.md`](效果菜单.md)：写「怎么动」的时候可以直接引用里面的说法");
P("> （错峰 / 拖尾 / 回声 / 擦除 / 卡拍跟鼓 / 上光晕 …）。");
P("");
P("### 三个已知的「待定」（写的时候不用管，我会处理）");
P("");
P("1. **小节号可能有 0–3 拍的偏移**（`config` 里 `barPhase` 还没定）。定法见文末。");
P("2. **段落名还是机器给的候选**（s1、s2…），你可以直接用序号指代，也可以在这里直接改成你要的名字。");
P("3. **词级时间是机器推的候选**（行时间来自你给的 LRC，词级和行尾是推的）。哪句偏了告诉我。");
P("");
P("---");
P("");
P("## 0. 一句话立意");
P("");
P("用一句人话说清：**这个 MV 到底在讲什么？** 不一定要有故事，但要有**一个贯穿全片的动机**。");
P("");
P("```");
P("（填这里）");
P("```");
P("");
P("---");
P("");
P("## 1. 视觉基调");
P("");
P("| 项 | 填什么 | 我给的起点（可改） |");
P("|---|---|---|");
P(`| 画面质感 | 像什么？ | 终端 / 代码 / 几何 / 单色辉光（现有配色 ${config.colors.bg} ${config.colors.fg} ${config.colors.accent}） |`);
P("| 主色 | 2~3 个 | 同上，要改就说 |");
P("| 参考 | 你说得出来就行 | （填这里） |");
P("| 明暗节奏 | 全片越来越暗还是越来越亮？ | （填这里） |");
P("");
P("**贯穿全片的母题**（一个东西反复出现，片子才不是合集）——参考项目用的是「火花+拖线」，写歌词 → 画曲线 → 变 K 线 → 弯成回形针 → 是引线 → 引爆。");
P("");
P("```");
P("（填这里：我们的「火花」是什么？）");
P("```");
P("");
P("---");
P("");
P("## 2. 时间基准（已量好，照抄即可）");
P("");
P("| 参数 | 值 |");
P("|---|---|");
P(`| BPM | ${bpmRow} |`);
P(`| 一拍 | ${MS_PER_BEAT.toFixed(2)}ms |`);
P(`| 一小节 | ${(MS_PER_BEAT * beatsPerBar).toFixed(2)}ms（${beatsPerBar} 拍） |`);
P(`| 第 1 拍 | ${offsetRow} |`);
P(`| 全片长度 | ${(durationMs / 1000).toFixed(3)}s（${fmt(durationMs)}） |`);
P(`| 分辨率 / 帧率 | ${config.width}×${config.height} @ ${config.fps}fps |`);
P(`| seed | ${config.seed} |`);
P("");
P(`> 换算小抄：**第 N 拍 = ${measuredOffset.toFixed(1)} + (N−1) × ${MS_PER_BEAT.toFixed(2)} ms**`);
P("> 写时间建议用**拍/小节**，比秒精确，而且我改不坏。");
P("");
P("---");
P("");
P("## 3. 段落表（全片骨架）★ 先填这一节就够开工");
P("");
P("**这是什么**：把 3 分半的歌切成 14 块，每块一句话说清「这块画面在做什么」。");
P("**不是让你分高潮/低沉**，也不是按情绪归类——是要一份**工作清单**，");
P("让我知道以后你说的「副歌」指哪几块。");
P("");
P("**你只需要做两件事**：");
P("");
P("1. 看我猜的「这是什么」对不对（**不对就改，拿不准就写「待定」**）");
P("2. 每行写**一句话**：这块画面在做什么（写不了就留空，我会来问你）");
P("");
P("颗粒度参考——一句话要具体到**能画出来**：");
P("");
P("> ✅ 「全屏只剩一行字，每拍放大一次，背景跟着鼓闪一下」");
P("> ✅ 「一条线从左往右长满，长到的地方数字变亮」");
P("> ❌ 「很燃」「很有科技感」「要高级一点」 ← 这种我读不懂，只能猜");
P("");
P("**响度**是机器量的（越高越「满」），可以帮你判断哪里是爆发，不用管它的绝对值。");
P("");
P("> 不用一次填完 14 行。**先标你最有感觉的 2~3 块**，我也能开工。");
P("");
P("| # | 时间 | 响度 | 这段在唱（第一句） | 这是什么（我猜的 → 你改） | 这块画面做什么（一句话） |");
P("|---|---|---|---|---|---|");
const GUESS = {
  1: "引子（机器刚通电）",
  2: "引子后半 + 标题句 world.execute(me);",
  3: "主歌 1",
  4: "副歌 1（If I can…）",
  5: "主歌 2 前半",
  6: "主歌 2 后半",
  7: "预副歌（Switch my…）",
  8: "预副歌后半",
  9: "副歌 2 / 桥段",
  10: "间奏（无歌词）",
  11: "Execution 段",
  12: "最后一段（唱得最多，33s）",
  13: "尾奏",
  14: "静音尾巴（建议忽略/删掉）",
};
for (const s of sections) {
  const ls = linesOf(s);
  const head = ls.length ? ls[0].text.replace(/\|/g, "/").slice(0, 32) : "（无歌词）";
  P(
    `| ${s.index} | ${fmt(s.startMs)}–${fmt(s.endMs)} | ${s.stats.db} dB | ${head} | ${GUESS[s.index] ?? ""} |  |`,
  );
}
P("");
P("（第 4、9、12 段是机器认为最响的几块；到底哪个是副歌，你说了算。）");
P("");
P("---");
P("");
P("## 4. 关键画面清单 ★ 核心");
P("");
P("**一节 = 一块画板 = 一个时间段**，就是第 3 节那 14 块（序号一一对应）。");
P("这块比第 3 节厚：**画什么 / 怎么动 / 怎么进出 / 不要什么**。");
P("**不要一次填完 14 块。** 先挑一块你最想先看到的填，我做完给你看，点头了再下一块。");
P("");

for (const s of sections) {
  const ls = linesOf(s);
  P(`### SHOT-${String(s.index).padStart(2, "0")}　${GUESS[s.index] ?? ""}`);
  P("");
  P(`- **时间**：${fmt(s.startMs)} – ${fmt(s.endMs)}（${(s.endMs - s.startMs) / 1000}s，约第 ${bar(s.startMs)} 小节起）`);
  P(`- **画什么**：`);
  P("- **怎么动**：");
  P("    · 整体：");
  P("    · 卡拍：");
  P("    · 细节：");
  P("- **怎么进出**：淡入？淡出？硬切？被下一个画面推开？");
  P("- **歌词对应**：");
  if (ls.length) {
    P(`    这段在唱 ${ls.length} 句（行时间来自 LRC，词级是我推的候选）：`);
    for (const l of ls) P(`      - ${fmt(l.start)}  ${l.text}`);
  } else {
    P("    （这段没有歌词 —— 纯器乐/间奏）");
  }
  P("- **依赖**：需要先有别的画面吗？");
  P("- **不要什么**：");
  P("");
}

P("---");
P("");
P("## 5. 全局规则（写一次，全片生效）");
P("");
P("```");
P("示例：");
P("- 转场：除了标了「硬切」的，一律 100ms 淡入淡出");
P("- 抖动：全片始终有一层极轻微的扫描线在缓慢下移（速度跟拍，不是跟秒）");
P("- 配色：琥珀色只在「出错/警告」时出现，其他时候一律绿色系");
P("- 文字：一律等宽字体，字号只有 3 档");
P("```");
P("");
P("---");
P("");
P("## 6. 明确不要的（比写你要什么更省事）");
P("");
P("```");
P("示例：");
P("- 不要真人画面、不要照片拼贴");
P("- 不要镜头推拉摇，画面永远是「平的」");
P("- 不要花哨的粒子爆炸");
P("```");
P("");
P("---");
P("");
P("## 7. 待定 / 还没想好的");
P("");
P("```");
P("示例：");
P("- 第 3 段我不知道放什么，但这段不能空着");
P("- 结尾想要「被删除」的感觉，具体怎么表现还没想好");
P("```");
P("");
P("---");
P("");
P("## 8. 开工前自检");
P("");
P("对着每个 SHOT 问 5 个问题：");
P("");
P("1. **有时间吗？** 拍号、秒数、或者「某个副歌」都行——但得有。");
P("2. **能画出来吗？** 是「屏幕上的图形/文字」吗？（本引擎是 Canvas 2D 画图形，不是实时 3D）");
P("3. **靠什么动？** 跟时间流、跟拍、还是被某个事件触发？");
P("4. **怎么接上一块？** 是「变过去」还是「切过去」？");
P("5. **有没有整块只是一个形容词？** 中一条就补一张具体画面。");
P("");
P("---");
P("");
P("## 附：还欠你三件事（定了我就去做）");
P("");
P("```");
P("1. 小节对齐（barPhase）：");
P("     npm run beat:check -- --bars      # 听 bar1/bar2/bar3/bar4，哪个重音像乐句开头");
P("     你回我「bar2」即可。定了 s.bar / s.barPhase 才有音乐意义，段落的小节号也会跟着挪。");
P("");
P("2. 段落名：把上面第 3 节的序号认一下（哪几段是副歌/主歌/桥段），我改进 assets/sections.json。");
P("");
P("3. 歌词同步：看 out/preview/lyric-lab.mp4（15–45s，带声音），哪句抢拍/拖拍告诉我。");
P("```");
P("");
P("---");
P("");
P("*本骨架由 `npm run make:treatment` 生成；填好之后它就是全片唯一的创作依据，我不自己加戏。*");
P("");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, L.join("\n"));
console.log(`✅ ${OUT}`);
console.log(
  `   ${sections.length} 段候选、${lyrics.lines.length} 句歌词已填好；` +
    `留空的是「画什么 / 怎么动 / 不要什么」。`,
);
console.log(`   时间基准用的是 ${probe ? "audio-probe.json（实测）" : "config"}。`);
