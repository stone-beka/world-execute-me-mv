# 场景引擎 P2 编辑器 v1 设计规格

- 日期：2026-10-03
- 状态：已实现（导演口头确认：v1 不含嵌套/组）
- 前置：P0（引擎）+ P1（预览器 + board 桥接）已合入 `master`

## 目标

让导演**不写代码**就能：放置元素、改属性/参数/生命期/备注、加轨迹与特效、拖时间轴实时看、保存回 JSON。

## 范围

**v1 做**：单层元素；放置 / 选中 / 拖动改位置 / 属性面板 / 参数面板 / 生命期 / 备注 / 增删轨迹（直线·环绕·曲线·缩放）/ 特效（辉光）/ 服务端出帧实时预览 / 保存写回（先备份 `.bak`）。

**v1 不做**：嵌套/组（P2.5）、画布上直接拖轨迹曲线、撤销/重做、多选、更多特效块（P3）。

## 架构

```
tools/scene-editor.js          CLI：加载场景 + 块 schema，起服务器
tools/lib/editor-server.js     HTTP：/ /scene /blocks /resolve /frame /save
tools/lib/editor-page.js       页面（内联 CSS/JS）
        ↑ 复用
tools/lib/scene-view.js        buildInfo（歌词/段落标记）
tools/lib/scene-server.js / src/scene/render.js   服务端出帧
src/scene/registry.js          blockSchemas()：块清单 + 参数 schema（驱动调色板/属性面板）
```

### 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 编辑器页面 |
| GET | `/scene` | 当前场景 JSON |
| GET | `/blocks` | 块清单 + `params` schema |
| GET | `/resolve?ms=` | 每个元素在该时刻的解析结果（x/y/scale/rot/alpha/size）→ 选中与拖拽 |
| GET | `/frame?ms=` | 该时刻 PNG（`renderSceneFrame`） |
| POST | `/save` | 校验（`normalizeScene` + `assertSceneBlocks`）后写回文件；非法 → 400 且不改文件；先备份 `.bak` |

### 页面

- 左：调色板（元素块，由 `blockSchemas` 生成）+ 加轨迹按钮。
- 中：画面（服务端出帧）+ 覆盖层（元素框、选中高亮、拖动）。
- 右：属性（at/参数/生命期/备注）+ 轨迹列表。
- 下：时间轴（歌词/段落刻度）。
- 拖动改 `at.x/y`；字段用 `change` 事件（不在打字时重绘，避免丢焦点）。

## 验收

- `tests/scene-editor.test.js`：`/blocks` schema、`/resolve` 位置、`/` 页面、`POST /save` 写盘、非法 400 不改文件、内联脚本语法合法。
- `npm test` 50/50；`npm run verify` 四关全绿。

## 风险

- 元素带 `move` 轨迹时，拖动改的是基础 `at`，当期轨迹会覆盖显示——v1 已知，轨迹在右侧面板改。
- 保存不校验「同通道时间窗重叠」以外的语义；编辑器不做自动整理。
