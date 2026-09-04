import { Notice, Platform, Plugin, TAbstractFile, TFile } from "obsidian";
import { createElectronBridge } from "./ElectronBridge";
import { QuickStickySettingTab, displayAccelerator, loadSettings } from "./settings";
import type { StickySettings } from "./settings";
import { WindowManager } from "./WindowManager";
import { STICKY_LIST_VIEW_TYPE, StickyListView } from "./StickyListView";

export default class QuickStickyPlugin extends Plugin {
  declare settings: StickySettings;
  bridge = createElectronBridge();
  windows!: WindowManager;
  private registeredHotkey: string | null = null;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.windows = new WindowManager(
      this, this.bridge,
      () => this.settings,
      async (update) => {
        this.settings = update(this.settings);
        await this.saveData(this.settings);
      },
    );

    // —— 命令 ——
    this.addCommand({
      id: "create-sticky",
      name: "新建便签",
      callback: () => void this.windows.createAndOpenSticky(),
    });
    this.addCommand({
      id: "open-current-as-sticky",
      name: "当前文件作为便签打开",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.windows.openSticky(file);
        return true;
      },
    });
    this.addCommand({
      id: "hide-current-sticky",
      name: "关闭当前文件的便签",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.windows.isOpen(file.path)) return false;
        if (!checking) this.windows.closeSticky(file.path);
        return true;
      },
    });
    this.addCommand({
      id: "open-sticky-list",
      name: "打开便签列表面板",
      callback: () => {
        void this.app.workspace.getLeaf(true).setViewState({
          type: STICKY_LIST_VIEW_TYPE,
        });
      },
    });

    // —— 入口 ——
    this.addRibbonIcon("sticky-note", "新建便签", () => void this.windows.createAndOpenSticky());

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof TFile)) return;
      menu.addItem((item) => item
        .setTitle("作为便签打开")
        .setIcon("sticky-note")
        .onClick(() => void this.windows.openSticky(file)));
    }));

    // —— vault 事件同步 ——
    this.registerEvent(this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
      if (file instanceof TFile) this.windows.onFileRenamed(oldPath, file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", (file: TAbstractFile) => {
      if (file instanceof TFile) this.windows.onFileDeleted(file.path);
    }));

    // popout 被用户直接点 X 关闭 → 清注册表
    this.registerEvent(this.app.workspace.on("window-close", (win) => {
      const path = win.doc.documentElement.dataset.quickStickyPath;
      if (path) this.windows.untrack(path);
    }));

    // —— 恢复 ——
    this.app.workspace.onLayoutReady(async () => {
      // Obsidian 自己恢复 popout 有时序竞争：多轮重试（ssn 模式）
      await this.windows.restoreAll();
      window.setTimeout(() => void this.windows.restoreAll(), 2000);
      window.setTimeout(() => void this.windows.restoreAll(), 5000);
    });
    let layoutTimer: number | undefined;
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      if (layoutTimer) window.clearTimeout(layoutTimer);
      layoutTimer = window.setTimeout(() => void this.windows.restoreAll(), 750);
    }));

    // —— 其他 ——
    this.registerView(STICKY_LIST_VIEW_TYPE, (leaf) => new StickyListView(leaf, this));
    this.addSettingTab(new QuickStickySettingTab(this.app, this));
    this.registerGlobalHotkey();
  }

  async onunload(): Promise<void> {
    this.unregisterGlobalHotkey();
    await this.windows.saveWindowsState();
    this.windows.untrackAll();
    void this.app.workspace.requestSaveLayout();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // —— 全局热键 ——

  private registerGlobalHotkey(): void {
    this.unregisterGlobalHotkey();
    if (!Platform.isDesktopApp) return;
    const acc = this.settings.globalHotkey.trim();
    if (!acc) return;
    const ok = this.bridge.registerGlobalShortcut(acc, () => void this.windows.createAndOpenSticky());
    if (ok) {
      this.registeredHotkey = acc;
    } else {
      new Notice(`便签热键注册失败（可能被占用）：${displayAccelerator(acc)}`);
    }
  }

  private unregisterGlobalHotkey(): void {
    if (this.registeredHotkey) {
      this.bridge.unregisterGlobalShortcut(this.registeredHotkey);
      this.registeredHotkey = null;
    }
  }

  async setGlobalHotkey(accelerator: string): Promise<void> {
    this.settings.globalHotkey = accelerator;
    await this.saveSettings();
    this.registerGlobalHotkey();
  }
}
