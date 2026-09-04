import { describe, it, expect } from "vitest";
import { planRestore } from "../src/WindowManager";
import type { WindowRecord } from "../src/settings";

const rec = (file: string, pinned = false): WindowRecord => ({
  file,
  bounds: { x: 10, y: 10, width: 360, height: 360 },
  pinned,
});

describe("planRestore", () => {
  it("文件存在且未打开 → toOpen", () => {
    const plan = planRestore([rec("a.md")], new Set(["a.md"]), new Set());
    expect(plan.toOpen).toHaveLength(1);
    expect(plan.toOpen[0].file).toBe("a.md");
    expect(plan.toDrop).toHaveLength(0);
  });

  it("本会话已活的便签 → 跳过（Obsidian 已恢复/用户已开）", () => {
    const plan = planRestore([rec("a.md")], new Set(["a.md"]), new Set(["a.md"]));
    expect(plan.toOpen).toHaveLength(0);
    expect(plan.toDrop).toHaveLength(0);
  });

  it("文件已删除 → toDrop（清理记录）", () => {
    const plan = planRestore([rec("gone.md")], new Set(), new Set());
    expect(plan.toOpen).toHaveLength(0);
    expect(plan.toDrop).toEqual(["gone.md"]);
  });

  it("同一文件多条记录（旧数据脏态）→ 只保留第一条", () => {
    const plan = planRestore(
      [rec("a.md"), rec("a.md", true)],
      new Set(["a.md"]),
      new Set(),
    );
    expect(plan.toOpen).toHaveLength(1);
    expect(plan.toOpen[0].pinned).toBe(false);
  });
});
