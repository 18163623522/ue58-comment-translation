import { describe, it, expect } from "vitest";
import { formatNoteName, noteStickyTitle, windowTitleKey } from "../src/NoteFileService";

describe("formatNoteName（Moment 子集 token）", () => {
  const now = new Date(2026, 8, 5, 14, 7, 3); // 2026-09-05 14:07

  it("默认模板完整展开", () => {
    expect(formatNoteName("便签 YYYY-MM-DD HH-mm", now)).toBe("便签 2026-09-05 14-07");
  });
  it("单个 token 也可用", () => {
    expect(formatNoteName("YYYY", now)).toBe("2026");
    expect(formatNoteName("MM/DD", now)).toBe("09/05");
  });
  it("模板为空返回空串（由调用方回退默认模板）", () => {
    expect(formatNoteName("", now)).toBe("");
  });
  it("非 token 字母原样保留", () => {
    expect(formatNoteName("note YYYYxx", now)).toBe("note 2026xx");
  });
});

describe("窗口标题 key", () => {
  it("含文件名与不可见分隔的 path 编码", () => {
    const key = windowTitleKey("StickyNotes/便签 A.md", "便签 A");
    expect(key.startsWith("便签 — 便签 A\u2063")).toBe(true);
    expect(key.endsWith(encodeURIComponent("StickyNotes/便签 A.md"))).toBe(true);
  });
  it("noteStickyTitle 解析回 path", () => {
    const path = "StickyNotes/便签 A.md";
    expect(noteStickyTitle(windowTitleKey(path, "便签 A"))).toBe(path);
  });
});
