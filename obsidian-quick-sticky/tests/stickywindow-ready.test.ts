import { describe, it, expect } from "vitest";
import { isPopoutReady } from "../src/StickyWindow";

describe("isPopoutReady（popout 加载就绪谓词）", () => {
  it("doc 含 .app-container .workspace-leaf 且 containerEl 已连接 → ready", () => {
    const doc = {
      querySelector: (sel: string) => (sel === ".app-container .workspace-leaf" ? {} : null),
    };
    expect(isPopoutReady(doc, { isConnected: true })).toBe(true);
  });
  it("缺 .workspace-leaf → 未就绪", () => {
    const doc = { querySelector: () => null };
    expect(isPopoutReady(doc, { isConnected: true })).toBe(false);
  });
  it("containerEl 未连接 → 未就绪", () => {
    const doc = { querySelector: () => ({}) };
    expect(isPopoutReady(doc, { isConnected: false })).toBe(false);
  });
});
