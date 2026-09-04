import { defineConfig } from "vitest/config";
import path from "node:path";

// obsidian npm 包是纯类型包（无 main/exports），vite 无法解析其入口。
// 单测一律走本地 stub；源码里 import "obsidian" 在运行时由 Obsidian 提供。
export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/mocks/obsidian.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
