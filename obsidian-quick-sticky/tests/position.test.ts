import { describe, it, expect } from "vitest";
import { positionIsVisible, clampToBounds } from "../src/WindowManager";
import type { NoteBounds } from "../src/settings";

// 模拟双显示器：主屏 1920×1080 原点(0,0)，副屏 1280×1024 原点(1920,0)
const displays = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { workArea: { x: 1920, y: 0, width: 1280, height: 1024 } },
];

describe("positionIsVisible", () => {
  it("主屏内可见", () => {
    expect(positionIsVisible(100, 100, displays)).toBe(true);
  });
  it("副屏内可见", () => {
    expect(positionIsVisible(2500, 100, displays)).toBe(true);
  });
  it("负坐标副屏（未连接）不可见", () => {
    expect(positionIsVisible(-2500, 100, displays)).toBe(false);
  });
  it("允许标题栏部分出界（x-40 容差，可拖回）", () => {
    expect(positionIsVisible(-30, 100, displays)).toBe(true);
  });
  it("完全离屏不可见", () => {
    expect(positionIsVisible(99999, 99999, displays)).toBe(false);
  });
});

describe("clampToBounds", () => {
  it("屏内原样返回", () => {
    const b: NoteBounds = { x: 100, y: 100, width: 360, height: 360 };
    expect(clampToBounds(b, displays)).toEqual(b);
  });
  it("离屏窗口 clamp 到主屏左上角", () => {
    const b: NoteBounds = { x: -2500, y: -800, width: 360, height: 360 };
    const r = clampToBounds(b, displays);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
  it("显示器列表为空时回退 (0,0)", () => {
    const b: NoteBounds = { x: 500, y: 500, width: 360, height: 360 };
    expect(clampToBounds(b, []).x).toBe(0);
  });
});
