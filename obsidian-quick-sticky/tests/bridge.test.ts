import { describe, it, expect, vi } from "vitest";
import { createElectronBridge } from "../src/ElectronBridge";

// @electron/remote 的结构化 mock —— 工厂注入，不真装 Electron。
function mockRemote(windows: { title: string; destroyed?: boolean }[] = []) {
  return {
    BrowserWindow: {
      getAllWindows: () =>
        windows.map((w) => ({
          getTitle: () => w.title,
          isDestroyed: () => !!w.destroyed,
          setAlwaysOnTop: vi.fn(),
          isAlwaysOnTop: () => false,
        })),
    },
    globalShortcut: {
      register: vi.fn(() => true),
      unregister: vi.fn(),
      isRegistered: vi.fn(() => false),
    },
    screen: {
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    },
  };
}

describe("createElectronBridge", () => {
  it("remote 可用时 available=true 且能按标题找窗口", () => {
    const remote = mockRemote([{ title: "A" }, { title: "B" }]);
    const bridge = createElectronBridge(remote as never);
    expect(bridge.available).toBe(true);
    expect(bridge.findWindowByTitle("B")?.getTitle()).toBe("B");
    expect(bridge.findWindowByTitle("C")).toBeNull();
  });

  it("已销毁窗口不会被返回", () => {
    const remote = mockRemote([{ title: "A", destroyed: true }]);
    const bridge = createElectronBridge(remote as never);
    expect(bridge.findWindowByTitle("A")).toBeNull();
  });

  it("remote 缺失/抛错时降级 available=false，所有操作安全无异常", () => {
    const bridge = createElectronBridge(undefined as never, () => {
      throw new Error("no electron");
    });
    expect(bridge.available).toBe(false);
    expect(bridge.findWindowByTitle("A")).toBeNull();
    expect(bridge.getDisplays()).toEqual([]);
    expect(bridge.registerGlobalShortcut("Super+F10", () => {})).toBe(false);
    expect(() => bridge.unregisterGlobalShortcut("Super+F10")).not.toThrow();
  });

  it("热键注册：先 isRegistered 再 unregister 旧回调再 register（防重载残留）", () => {
    const remote = mockRemote();
    remote.globalShortcut.isRegistered = vi.fn(() => true);
    const bridge = createElectronBridge(remote as never);
    const cb = () => {};
    bridge.registerGlobalShortcut("Super+F10", cb);
    expect(remote.globalShortcut.unregister).toHaveBeenCalledWith("Super+F10");
    expect(remote.globalShortcut.register).toHaveBeenCalledWith("Super+F10", cb);
  });
});
