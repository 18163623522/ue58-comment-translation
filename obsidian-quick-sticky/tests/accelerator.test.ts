import { describe, it, expect } from "vitest";
import { acceleratorForEvent, displayAccelerator } from "../src/settings";

const keyEvent = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) =>
  ({
    code,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
    getModifierState: (m: string) =>
      m === "Control" ? !!mods.ctrl : m === "Alt" ? !!mods.alt : m === "Shift" ? !!mods.shift : m === "Meta" ? !!mods.meta : false,
  }) as KeyboardEvent;

describe("acceleratorForEvent（Windows 语义）", () => {
  it("字母键带修饰", () => {
    expect(acceleratorForEvent(keyEvent("KeyN", { ctrl: true, shift: true }))).toBe("Control+Shift+N");
  });
  it("数字/F 键", () => {
    expect(acceleratorForEvent(keyEvent("Digit1", { alt: true }))).toBe("Alt+1");
    expect(acceleratorForEvent(keyEvent("F10", { meta: true }))).toBe("Super+F10");
  });
  it("方向键与标点", () => {
    expect(acceleratorForEvent(keyEvent("ArrowUp", { ctrl: true }))).toBe("Control+Up");
    expect(acceleratorForEvent(keyEvent("Minus", { ctrl: true }))).toBe("Control+-");
  });
  it("无修饰的裸键返回 null（防误触单键全局热键）", () => {
    expect(acceleratorForEvent(keyEvent("KeyN"))).toBeNull();
  });
  it("小键盘数字", () => {
    expect(acceleratorForEvent(keyEvent("Numpad3", { ctrl: true }))).toBe("Control+num3");
  });
});

describe("displayAccelerator（Windows 显示）", () => {
  it("Super 显示为 Win", () => {
    expect(displayAccelerator("Super+F10")).toBe("Win + F10");
  });
  it("Control 显示为 Ctrl", () => {
    expect(displayAccelerator("Control+Shift+N")).toBe("Ctrl + Shift + N");
  });
  it("空串显示 Disabled", () => {
    expect(displayAccelerator("")).toBe("Disabled");
  });
});
