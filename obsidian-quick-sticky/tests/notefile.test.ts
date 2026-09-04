import { describe, it, expect, vi } from "vitest";
import { NoteFileService, STICKY_COLOR_KEY, STICKY_OPACITY_KEY } from "../src/NoteFileService";

function mockApp(vaultFiles: string[] = []) {
  const created: string[] = [];
  const frontmatterWrites: { file: string; updates: Record<string, unknown> }[] = [];
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (vaultFiles.includes(p) ? { path: p } : null),
      createFolder: vi.fn(async () => {}),
      create: vi.fn(async (p: string) => {
        created.push(p);
        vaultFiles.push(p);
        return { path: p };
      }),
    },
    fileManager: {
      processFrontMatter: vi.fn(async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
        const updates: Record<string, unknown> = {};
        fn(updates);
        frontmatterWrites.push({ file: file.path, updates });
      }),
      renameFile: vi.fn(async (file: { path: string }, newPath: string) => {
        const i = vaultFiles.indexOf(file.path);
        if (i >= 0) vaultFiles[i] = newPath;
        file.path = newPath;
      }),
    },
    metadataCache: {
      getFileCache: vi.fn(() => ({
        frontmatter: { [STICKY_COLOR_KEY]: "#ff0000", [STICKY_OPACITY_KEY]: 0.8 },
      })),
    },
  };
  return { app, created, frontmatterWrites };
}

describe("NoteFileService", () => {
  it("createNote：确保文件夹存在 + 命名冲突自动加序号", async () => {
    const { app, created } = mockApp(["StickyNotes/便签 X.md"]);
    const svc = new NoteFileService(app as never);
    const file = await svc.createNote("StickyNotes", "便签 X");
    expect(app.vault.createFolder).toHaveBeenCalledWith("StickyNotes");
    expect(created).toContain("StickyNotes/便签 X (2).md");
    expect(file.path).toBe("StickyNotes/便签 X (2).md");
  });

  it("createNote：folder 为空时落到 vault 根", async () => {
    const { app, created } = mockApp();
    const svc = new NoteFileService(app as never);
    await svc.createNote("", "便签 Y");
    expect(created).toEqual(["便签 Y.md"]);
  });

  it("createNote：文件夹已存在时不重复创建", async () => {
    const { app } = mockApp(["StickyNotes"]);
    const svc = new NoteFileService(app as never);
    await svc.createNote("StickyNotes", "便签 Z");
    expect(app.vault.createFolder).not.toHaveBeenCalled();
  });

  it("readStickyProps：从 metadataCache 读颜色/透明度", async () => {
    const { app } = mockApp();
    const svc = new NoteFileService(app as never);
    const props = await svc.readStickyProps({ path: "a.md" } as never);
    expect(props.color).toBe("#ff0000");
    expect(props.opacity).toBe(0.8);
  });

  it("writeStickyProps：processFrontMatter 写入两个 key", async () => {
    const { app, frontmatterWrites } = mockApp();
    const svc = new NoteFileService(app as never);
    await svc.writeStickyProps({ path: "a.md" } as never, { color: "#00ff00", opacity: 0.5 });
    expect(frontmatterWrites).toHaveLength(1);
    expect(frontmatterWrites[0].updates[STICKY_COLOR_KEY]).toBe("#00ff00");
    expect(frontmatterWrites[0].updates[STICKY_OPACITY_KEY]).toBe(0.5);
  });

  describe("moveNote", () => {
    it("移动到不存在的文件夹：先创建文件夹再 renameFile", async () => {
      const { app } = mockApp(["StickyNotes/便签 A.md"]);
      const svc = new NoteFileService(app as never);
      const file = { path: "StickyNotes/便签 A.md", basename: "便签 A" };
      const target = await svc.moveNote(file, "000_笔记白板/临时");
      expect(app.vault.createFolder).toHaveBeenCalledWith("000_笔记白板/临时");
      expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, "000_笔记白板/临时/便签 A.md");
      expect(target).toBe("000_笔记白板/临时/便签 A.md");
    });

    it("已在目标文件夹：no-op，不调 renameFile", async () => {
      const { app } = mockApp(["StickyNotes/便签 A.md"]);
      const svc = new NoteFileService(app as never);
      const file = { path: "StickyNotes/便签 A.md", basename: "便签 A" };
      const target = await svc.moveNote(file, "StickyNotes");
      expect(app.fileManager.renameFile).not.toHaveBeenCalled();
      expect(target).toBe("StickyNotes/便签 A.md");
    });

    it("目标文件夹有同名文件：追加序号避让", async () => {
      const { app } = mockApp(["StickyNotes/便签 A.md", "归档/便签 A.md"]);
      const svc = new NoteFileService(app as never);
      const file = { path: "StickyNotes/便签 A.md", basename: "便签 A" };
      const target = await svc.moveNote(file, "归档");
      expect(app.fileManager.renameFile).toHaveBeenCalledWith(file, "归档/便签 A (2).md");
      expect(target).toBe("归档/便签 A (2).md");
    });

    it("folder 为空：移动到 vault 根", async () => {
      const { app } = mockApp(["StickyNotes/便签 A.md"]);
      const svc = new NoteFileService(app as never);
      const file = { path: "StickyNotes/便签 A.md", basename: "便签 A" };
      const target = await svc.moveNote(file, "");
      expect(app.vault.createFolder).not.toHaveBeenCalled();
      expect(target).toBe("便签 A.md");
    });
  });
});
