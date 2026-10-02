# assets/fonts —— 打包字体

这些字体**要进 git**（和 `assets/audio/` 不同）：字体是画面的一部分，
必须每台机器都一样，否则「同 seed + 同帧号 = 同像素」在换机器后就不成立。

## IBM Plex Mono

- 字体：IBM Plex Mono（Regular / Medium / SemiBold / Bold / Italic）
- 授权：SIL Open Font License 1.1，见 `LICENSE.txt`
- 来源：npm 包 `@ibm/plex` **6.4.1**，路径
  `IBM-Plex-Mono/fonts/complete/woff2/`
- 为什么用它：等宽、有机器感、字形完整（不是系统 monospace 那种换机器就变的东西）

重新获取（版本要一致，否则像素会变）：

```bash
npm i --no-save @ibm/plex@6.4.1
# 然后从 node_modules/@ibm/plex/IBM-Plex-Mono/fonts/complete/woff2/ 抄出上面那 5 个文件
```

注册在 `src/core/fonts.js`，引擎启动时自动加载，画板里用：

```js
ctx.font = s.mono(16);        // 400
ctx.font = s.mono(34, 700);   // 粗
```
