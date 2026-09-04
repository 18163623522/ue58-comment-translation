import type { NoteBounds, WindowRecord } from "./settings";
import { MarkdownView, Notice } from "obsidian";
import type { App, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StickyWindow } from "./StickyWindow";
import type { SaveLocationPanelHooks } from "./StickyWindow";
import type { ElectronBridgeAPI } from "./ElectronBridge";
import { NoteFileService, formatNoteName } from "./NoteFileService";
import type { StickySettings } from "./settings";

export interface DisplayWorkArea {
  workArea: NoteBounds;
}

// 拖动柄（左上角）至少落在某显示器可见区内，允许 40px 出界容差（dsn 模式）。
export function positionIsVisible(
  x: number,
  y: number,
  displays: DisplayWorkArea[],
): boolean {
  return displays.some(({ workArea }) =>
    x >= workArea.x - 40 &&
    x < workArea.x + workArea.width - 40 &&
    y >= workArea.y &&
    y < workArea.y + workArea.height - 30,
  );
}

// 恢复时位置已不在任何显示器（拔屏/换分辨率）→ clamp 到第一个可用 workArea 左上角。
export function clampToBounds(
  bounds: NoteBounds,
  displays: DisplayWorkArea[],
): NoteBounds {
  if (positionIsVisible(bounds.x, bounds.y, displays)) return { ...bounds };
  const first = displays[0]?.workArea;
  if (!first) return { ...bounds, x: 0, y: 0 };
  return {
    ...bounds,
    x: first.x,
    y: first.y,
  };
}

export interface RestoreAction {
  file: string;
  bounds: NoteBounds;
  pinned: boolean;
}

export interface RestorePlan {
  toOpen: RestoreAction[];
  toDrop: string[]; // 文件已不存在，需从 settings.windows 移除
}

// 恢复决策（纯函数）：live = 本会话已打开的便签路径（含 Obsidian 自己恢复出的）。
export function planRestore(
  saved: WindowRecord[],
  existingFiles: Set<string>,
  live: Set<string>,
): RestorePlan {
  const plan: RestorePlan = { toOpen: [], toDrop: [] };
  const seen = new Set<string>();
  for (const record of saved) {
    if (seen.has(record.file)) continue; // 脏数据去重
    seen.add(record.file);
    if (!existingFiles.has(record.file)) {
      plan.toDrop.push(record.file);
      continue;
    }
    if (live.has(record.file)) continue; // 已开，不重复
    plan.toOpen.push({ file: record.file, bounds: record.bounds, pinned: record.pinned });
  }
  return plan;
}

// —— 多便签编排（只做编排，DOM 细节全部在 StickyWindow） ——

interface WorkspaceLike {
  rootSplit: unknown;
  leftSplit: unknown;
  rightSplit: unknown;
  iterateAllLeaves(cb: (leaf: WorkspaceLeaf) => void): void;
  openPopoutLeaf(o: { size: { width: number; height: number } }): WorkspaceLeaf;
}

export class WindowManager {
  private byPath = new Map<string, StickyWindow>();
  private restoreTimer: number | null = null;
  private noteFiles: NoteFileService;

  constructor(
    private plugin: Plugin,
    private bridge: ElectronBridgeAPI,
    private getSettings: () => StickySettings,
    private setSettings: (updater: (s: StickySettings) => StickySettings) => Promise<void>,
  ) {
    this.noteFiles = new NoteFileService(plugin.app as never);
  }

  private get workspace(): WorkspaceLike {
    return (this.plugin.app as App & { workspace: WorkspaceLike }).workspace;
  }

  // —— 打开 ——

  /** 通用打开路径：已开 → 聚焦；否则新开（规格 §4.2 去重收养语义）。 */
  async openSticky(
    file: TFile,
    opts: { saved?: { bounds?: NoteBounds; pinned?: boolean }; background?: boolean } = {},
  ): Promise<StickyWindow | null> {
    const existing = this.byPath.get(file.path);
    if (existing) {
      if (!opts.background) existing.focus();
      return existing;
    }

    // 收养：Obsidian 自己恢复出的该文件 popout（无便签标记的）→ 直接接管
    const adopted = this.findUnclaimedPopout(file.path);
    if (adopted) {
      const win = await StickyWindow.open({
        file, leaf: adopted, settings: this.getSettings(),
        bridge: this.bridge, plugin: this.plugin, saved: opts.saved, background: opts.background,
        saveLocationHooks: this.saveLocationHooks(),
      });
      this.byPath.set(file.path, win);
      return win;
    }

    const settings = this.getSettings();
    const leaf = this.workspace.openPopoutLeaf({ size: settings.defaultSize });
    await leaf.openFile(file, { active: !opts.background });
    const win = await StickyWindow.open({
      file, leaf, settings, bridge: this.bridge, plugin: this.plugin,
      saved: opts.saved, background: opts.background,
      saveLocationHooks: this.saveLocationHooks(),
    });
    this.byPath.set(file.path, win);
    return win;
  }

  // 便签窗口「保存位置」的动作钩子（Menu + 模糊 Modal 触发，窗口实例直接传入）。
  private saveLocationHooks(): SaveLocationPanelHooks {
    return {
      onMove: async (win, folder) => {
        try {
          const oldPath = win.file.path;
          const newPath = await this.noteFiles.moveNote(
            win.file as unknown as { path: string; basename: string },
            folder,
          );
          if (newPath === oldPath) return; // 已在目标文件夹
          // renameFile 后 vault "rename" 事件会进 onFileRenamed 同步注册表，
          // 窗口标题 key 与 dataset 路径由 refreshAfterRename 刷新。
          win.refreshAfterRename(newPath);
          new Notice(`已移动到 ${newPath}`);
        } catch (e) {
          new Notice(`移动失败：${String(e)}`);
        }
      },
      onSetDefault: async (folder) => {
        await this.setSettings((s) => ({ ...s, folder }));
        new Notice(`新便签默认保存位置：${folder || "vault 根目录"}`);
      },
    };
  }

  /** 热键/命令路径：新建一张便签并聚焦。 */
  async createAndOpenSticky(): Promise<StickyWindow | null> {
    const settings = this.getSettings();
    const template = settings.nameTemplate || "便签 YYYY-MM-DD HH-mm";
    const baseName = formatNoteName(template, new Date()) || "便签";
    try {
      const file = await this.noteFiles.createNote(settings.folder, baseName);
      return await this.openSticky(file as TFile);
    } catch (e) {
      new Notice(`便签创建失败：${String(e)}`);
      return null;
    }
  }

  focusSticky(path: string): boolean {
    const win = this.byPath.get(path);
    if (!win) return false;
    win.focus();
    return true;
  }

  closeSticky(path: string): void {
    this.byPath.get(path)?.close();
  }

  isOpen(path: string): boolean {
    return this.byPath.has(path);
  }

  /** 便签窗口标题（列表面板显示"开启中"用）。 */
  openPaths(): string[] {
    return [...this.byPath.keys()];
  }

  // —— 注册表维护 ——

  untrack(path: string): void {
    const win = this.byPath.get(path);
    if (!win) return;
    win.destroy();
    this.byPath.delete(path);
  }

  untrackAll(): void {
    for (const path of [...this.byPath.keys()]) this.untrack(path);
  }

  // 找"打开了同一文件、但不是我们便签"的 popout leaf（恢复期收养用）。
  private findUnclaimedPopout(path: string): WorkspaceLeaf | null {
    let found: WorkspaceLeaf | null = null;
    const ws = this.workspace;
    ws.iterateAllLeaves((leaf) => {
      if (found) return;
      if (!(leaf.view instanceof MarkdownView)) return;
      if (leaf.view.file?.path !== path) return;
      const root = (leaf as unknown as { getRoot(): unknown }).getRoot();
      if (root === ws.rootSplit || root === ws.leftSplit || root === ws.rightSplit) return; // 主窗口
      const doc = leaf.view.containerEl.ownerDocument;
      if (doc.documentElement.classList.contains("quick-sticky-window")) return; // 已是便签
      found = leaf;
    });
    return found;
  }

  // —— 保存/恢复 ——

  /** 收集当前在开便签的 {file, bounds, pinned} 写入 settings（退出/卸载时调用）。 */
  async saveWindowsState(): Promise<void> {
    const records: WindowRecord[] = [];
    for (const [path, win] of this.byPath) {
      const bounds = win.getBounds();
      records.push({
        file: path,
        bounds: bounds ?? { ...this.getSettings().defaultSize, x: 0, y: 0 },
        pinned: win.pinned,
      });
    }
    await this.setSettings((s) => ({ ...s, windows: records }));
  }

  /**
   * 恢复编排（ssn 模式）：onLayoutReady 后多轮重试，obsidian 自己恢复的 popout 由
   * openSticky 的收养逻辑接管；每轮之间用 planRestore 的决策过滤。
   */
  async restoreAll(): Promise<void> {
    const settings = this.getSettings();
    if (!settings.restoreOnStartup || !settings.windows.length) return;

    const app = this.plugin.app as App;
    const existingFiles = new Set<string>();
    for (const r of settings.windows) {
      const f = app.vault.getAbstractFileByPath(r.file);
      if (f && (f as TFile).path) existingFiles.add(r.file);
    }
    const live = new Set(this.byPath.keys());
    const plan = planRestore(settings.windows, existingFiles, live);

    if (plan.toDrop.length) {
      await this.setSettings((s) => ({
        ...s,
        windows: s.windows.filter((w) => !plan.toDrop.includes(w.file)),
      }));
    }

    const displays = this.bridge.getDisplays();
    for (const action of plan.toOpen) {
      const file = app.vault.getAbstractFileByPath(action.file);
      if (!file) continue;
      const bounds = clampToBounds(action.bounds, displays);
      await this.openSticky(file as TFile, {
        saved: { bounds, pinned: action.pinned },
        background: true, // 恢复不打扰
      });
      await new Promise((r) => setTimeout(r, 250)); // 串行开窗，避免时序竞争
    }
  }

  scheduleRestore(): void {
    if (this.restoreTimer !== null) window.clearTimeout(this.restoreTimer);
    this.restoreTimer = window.setTimeout(() => {
      this.restoreTimer = null;
      void this.restoreAll();
    }, 750);
  }

  // —— vault 事件同步（main.ts 转发） ——

  onFileRenamed(oldPath: string, newPath: string): void {
    const win = this.byPath.get(oldPath);
    if (!win) return;
    this.byPath.delete(oldPath);
    this.byPath.set(newPath, win);
  }

  onFileDeleted(path: string): void {
    this.byPath.get(path)?.close();
    this.untrack(path);
  }
}
