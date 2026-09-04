import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

describe("loadSettings", () => {
  it("空输入返回默认值", () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("合法字段覆盖默认值", () => {
    const s = loadSettings({ folder: "便签", globalHotkey: "Control+F9", defaultOpacity: 0.6 });
    expect(s.folder).toBe("便签");
    expect(s.globalHotkey).toBe("Control+F9");
    expect(s.defaultOpacity).toBe(0.6);
    expect(s.defaultColor).toBe(DEFAULT_SETTINGS.defaultColor);
  });

  it("非法类型字段回退默认值", () => {
    const s = loadSettings({
      folder: 123, defaultOpacity: "high", restoreOnStartup: "yes",
      defaultSize: { width: "wide", height: 360 },
      windows: "not-array",
    } as unknown as object);
    expect(s.folder).toBe(DEFAULT_SETTINGS.folder);
    expect(s.defaultOpacity).toBe(DEFAULT_SETTINGS.defaultOpacity);
    expect(s.restoreOnStartup).toBe(DEFAULT_SETTINGS.restoreOnStartup);
    expect(s.defaultSize).toEqual(DEFAULT_SETTINGS.defaultSize);
    expect(s.windows).toEqual([]);
  });

  it("windows 记录做逐条校验，坏记录被剔除", () => {
    const s = loadSettings({
      windows: [
        { file: "a.md", bounds: { x: 1, y: 2, width: 360, height: 360 }, pinned: true },
        { file: 42 },
        { file: "b.md", bounds: { x: "x" }, pinned: true },
      ],
    } as unknown as object);
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0].file).toBe("a.md");
    expect(s.windows[0].pinned).toBe(true);
  });

  it("opacity 超范围被 clamp 到 0.3–1.0", () => {
    expect(loadSettings({ defaultOpacity: 0.1 }).defaultOpacity).toBe(0.3);
    expect(loadSettings({ defaultOpacity: 2 }).defaultOpacity).toBe(1);
  });
});
