import { test } from "node:test";
import assert from "node:assert/strict";
import { resetBlocks, getElementBlock } from "../../src/scene/registry.js";

test("未加载时查询未知元素块会报错", () => {
  resetBlocks();
  assert.throws(() => getElementBlock("nope"), /未知元素块 "nope"/);
});
