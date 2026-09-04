import { MarkdownView, Menu, Notice, setIcon, setTooltip } from "obsidian";
import type { App, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { ElectronBridgeAPI, NativeWindow } from "./ElectronBridge";
import { STICKY_COLOR_KEY, STICKY_OPACITY_KEY, windowTitleKey } from "./NoteFileService";
import { FolderSuggestModal, folderPathOf } from "./FolderSuggestModal";
import type { StickySettings } from "./settings";
import type { NoteBounds } from "./settings";

export const PRESET_COLORS = [
  "#fff3a3", // 黄
  "#ffd6e0", // 粉
  "#d4f5e3", // 薄荷绿
  "#cfe6ff", // 蓝
  "#e4d9ff", // 薰衣草
  "#ffe0b8", // 橙
];

// popout 加载就绪谓词（ssn 的 waitForPopoutReady 核心判断，提纯可测）。
export function isPopoutReady(
  doc: { querySelector(selector: string): unknown },
  containerEl: { isConnected: boolean },
): boolean {
  return !!doc.querySelector(".app-container .workspace-leaf") && containerEl.isConnected;
}

export interface StickyWindowSavedState {
  bounds?: NoteBounds;
  pinned?: boolean;
}

interface StickyWindowInit {
  file: TFile;
  leaf: WorkspaceLeaf;
  settings: StickySettings;
  bridge: ElectronBridgeAPI;
  plugin: Plugin;
  saved?: StickyWindowSavedState;
  /** 恢复场景：不聚焦不打扰 */
  background?: boolean;
  /** 保存位置面板的动作钩子（缺省时按钮隐藏，仅保留只读显示）。 */
  saveLocationHooks?: SaveLocationPanelHooks;
}

interface MetadataLike {
  metadataCache: { getFileCache(f: TFile): { frontmatter?: Record<string, unknown> } | null };
  fileManager: {
    processFrontMatter(f: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void>;
  };
}

// 保存位置动作钩子（原生 Menu + 模糊搜索 Modal 触发，无窗口内浮层）。
export interface SaveLocationPanelHooks {
  /** 「移动这张便签」：win 是触发动作的便签窗口。folder 为目标文件夹（空串 = vault 根）。 */
  onMove(win: StickyWindow, folder: string): Promise<void>;
  /** 「设为新便签默认位置」。 */
  onSetDefault(folder: string): Promise<void>;
}

/** 透明度菜单档位（菜单选档，替代窗口内滑杆——滑杆浮层会被编辑器悬浮工具栏遮挡）。 */
export const OPACITY_LEVELS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

export class StickyWindow {
  readonly file: TFile;
  readonly leaf: WorkspaceLeaf;
  private native: NativeWindow | null = null;
  private observer: MutationObserver | null = null;
  private disposers: (() => void)[] = [];
  private lastOpacity: number | undefined;
  private saveLocationHooks: SaveLocationPanelHooks | undefined;

  private constructor(
    private ctx: { plugin: Plugin; bridge: ElectronBridgeAPI; settings: StickySettings },
    file: TFile,
    leaf: WorkspaceLeaf,
  ) {
    this.file = file;
    this.leaf = leaf;
  }

  /** 打开并初始化一张便签。Electron 不可用时降级为普通 popout（Notice 一次）。 */
  static async open(init: StickyWindowInit): Promise<StickyWindow> {
    const win = new StickyWindow(
      { plugin: init.plugin, bridge: init.bridge, settings: init.settings },
      init.file,
      init.leaf,
    );
    win.saveLocationHooks = init.saveLocationHooks;
    await win.waitReady();
    win.bindNative();
    if (!win.native && init.bridge.available) {
      new Notice("便签：未能接管原生窗口，置顶/透明度不可用。");
    }
    win.applyChrome();
    await win.applyAppearance();
    if (init.saved?.bounds) win.restoreBounds(init.saved.bounds);
    if (init.saved?.pinned) win.setPinned(true);
    if (!init.background) win.focus();
    return win;
  }

  private get document(): Document {
    return this.leaf.view.containerEl.ownerDocument;
  }

  private async waitReady(): Promise<void> {
    for (let i = 0; i < 80; i++) {
      if (isPopoutReady(this.document, this.leaf.view.containerEl)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // 标题标记法找原生窗口：临时设唯一标题 → getAllWindows 匹配 → 恢复真实标题（dsn 模式）。
  private bindNative(): void {
    if (!this.ctx.bridge.available) return;
    const doc = this.document;
    const marker = `quick-sticky-probe-${crypto.randomUUID()}`;
    const prevTitle = doc.title;
    doc.title = marker;
    const found = this.ctx.bridge.getAllWindows().find((w) => w.getTitle() === marker) ?? null;
    doc.title = prevTitle;
    if (found) found.setTitle(this.titleKey());
    this.native = found;
  }

  titleKey(): string {
    return windowTitleKey(this.file.path, this.file.basename);
  }

  get nativeWindow(): NativeWindow | null {
    return this.native && !this.native.isDestroyed() ? this.native : null;
  }

  get pinned(): boolean {
    return this.nativeWindow?.isAlwaysOnTop() ?? false;
  }

  setPinned(pinned: boolean): void {
    const w = this.nativeWindow;
    if (!w) return;
    // 子窗口的层级受父窗口约束 —— pin 前先解除父子（dsn 模式）。
    if (pinned) w.setParentWindow(null);
    w.setAlwaysOnTop(pinned, "screen-saver");
    if (pinned) w.moveTop();
  }

  focus(): void {
    const w = this.nativeWindow;
    if (!w) return;
    if (w.isMinimized()) w.restore();
    if (!w.isVisible()) w.show();
    w.moveTop();
    w.focus();
  }

  restoreBounds(bounds: NoteBounds): void {
    this.nativeWindow?.setBounds(bounds);
  }

  getBounds(): NoteBounds | null {
    return this.nativeWindow ? this.nativeWindow.getBounds() : null;
  }

  /** 文件被移动（vault rename）后刷新窗口身份：标题 key 与 dataset 路径。 */
  refreshAfterRename(newPath: string): void {
    (this.file as { path: string }).path = newPath;
    const doc = this.document;
    doc.title = this.titleKey();
    doc.documentElement.dataset.quickStickyPath = newPath;
    this.nativeWindow?.setTitle(this.titleKey());
  }

  // —— 外观 ——

  async applyAppearance(color?: string, opacity?: number): Promise<void> {
    const doc = this.document;
    const c = color ?? (await this.readColor());
    const o = opacity ?? this.readOpacity() ?? this.ctx.settings.defaultOpacity;
    if (c) {
      for (const v of ["--background-primary", "--background-primary-alt",
        "--background-secondary", "--background-secondary-alt"] as const) {
        doc.documentElement.style.setProperty(v, c);
      }
      (doc.body ?? doc.documentElement).style.setProperty("--sticky-note-background", c);
      this.nativeWindow?.setBackgroundColor(c);
    }
    if (o !== undefined && o !== 1) {
      this.nativeWindow?.setOpacity(o);
    }
  }

  private meta(): MetadataLike {
    return this.ctx.plugin.app as unknown as MetadataLike;
  }

  private async readColor(): Promise<string | undefined> {
    const v = this.meta().metadataCache.getFileCache(this.file)?.frontmatter?.[STICKY_COLOR_KEY];
    return typeof v === "string" ? v : undefined;
  }

  private readOpacity(): number | undefined {
    const v = Number(this.meta().metadataCache.getFileCache(this.file)?.frontmatter?.[STICKY_OPACITY_KEY]);
    return Number.isFinite(v) && v > 0 ? Math.min(1, Math.max(0.3, v)) : undefined;
  }

  // —— chrome：隐藏 Obsidian UI + 注入便签操作按钮 ——

  private applyChrome(): void {
    const doc = this.document;
    doc.documentElement.classList.add("quick-sticky-window");
    doc.documentElement.dataset.quickStickyPath = this.file.path;
    doc.body?.classList.add("quick-sticky-window");
    doc.title = this.titleKey();
    this.injectActions();
    this.observeReassert();
  }

  private injectActions(): void {
    const view = this.leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const actions = view.containerEl.querySelector(".view-actions");
    if (!actions) return;
    if (actions.querySelector(".quick-sticky-color-menu")) return; // 已注入

    actions.empty();

    // pin
    const pin = view.addAction("pin", "置顶", () => {
      this.setPinned(!this.pinned);
      this.updatePinIcon(pin);
    });
    this.updatePinIcon(pin);

    // 取色：6 预设 + 自定义
    const colorWrap = actions.createEl("div", { cls: "quick-sticky-color-menu" });
    for (const c of PRESET_COLORS) {
      const swatch = colorWrap.createEl("button", {
        cls: "quick-sticky-swatch",
        attr: { "aria-label": c, style: `background:${c}` },
      });
      this.ctx.plugin.registerDomEvent(swatch, "click", () => void this.applyColor(c));
    }
    const custom = colorWrap.createEl("input", {
      cls: "quick-sticky-color-custom",
      attr: { type: "color", "aria-label": "自定义颜色" },
    });
    if (custom instanceof HTMLInputElement) {
      this.ctx.plugin.registerDomEvent(custom, "input", () => void this.applyColor(custom.value));
    }

    // 保存位置：原生 Menu 两项 → 命令面板式模糊搜索 Modal（全局层级，无遮挡）
    if (this.saveLocationHooks) {
      const locBtn = actions.createEl("button", { cls: "clickable-icon quick-sticky-action" });
      setIcon(locBtn, "folder-input");
      setTooltip(locBtn, "保存位置");
      this.ctx.plugin.registerDomEvent(locBtn, "click", (e: MouseEvent) => {
        const menu = new Menu();
        menu.addItem((item) => item
          .setTitle("移动这张便签到…")
          .setIcon("folder-input")
          .onClick(() => {
            new FolderSuggestModal(this.ctx.plugin.app as App, (folder) =>
              this.saveLocationHooks!.onMove(this, folderPathOf(folder))).open();
          }));
        menu.addItem((item) => item
          .setTitle("设为新便签默认位置…")
          .setIcon("bookmark")
          .onClick(() => {
            new FolderSuggestModal(this.ctx.plugin.app as App, (folder) =>
              this.saveLocationHooks!.onSetDefault(folderPathOf(folder))).open();
          }));
        menu.showAtMouseEvent(e);
      });
    }

    // 透明度：原生菜单选档（当前档打勾）
    const opacityBtn = actions.createEl("button", { cls: "clickable-icon quick-sticky-action" });
    setIcon(opacityBtn, "eye");
    setTooltip(opacityBtn, "透明度");
    this.ctx.plugin.registerDomEvent(opacityBtn, "click", (e: MouseEvent) => {
      const current = this.lastOpacity ?? this.readOpacity() ?? this.ctx.settings.defaultOpacity;
      const menu = new Menu();
      for (const v of OPACITY_LEVELS) {
        menu.addItem((item) => item
          .setTitle(`透明度 ${Math.round(v * 100)}%`)
          .setChecked(Math.abs(current - v) < 0.026)
          .onClick(() => {
            this.lastOpacity = v;
            void this.applyAppearance(undefined, v);
            void this.persistOpacity(v);
          }));
      }
      menu.showAtMouseEvent(e);
    });

    // 编辑/阅读切换
    const mode = view.addAction("pencil", "切换编辑/阅读", () => {
      const next = view.getMode() === "source" ? "preview" : "source";
      void view.setState({ mode: next }, { history: false });
      setIcon(mode, next === "source" ? "book-open" : "pencil");
    });

    // 关闭（文件保留）
    view.addAction("x", "关闭便签", () => this.close());
    this.disposers.push(() => { colorWrap.remove(); mode.remove(); });
  }

  private async applyColor(color: string): Promise<void> {
    await this.applyAppearance(color);
    const opacity = this.lastOpacity ?? this.readOpacity() ?? this.ctx.settings.defaultOpacity;
    await this.meta().fileManager.processFrontMatter(this.file, (fm) => {
      fm[STICKY_COLOR_KEY] = color;
      fm[STICKY_OPACITY_KEY] = opacity;
    });
  }

  private async persistOpacity(opacity: number): Promise<void> {
    await this.meta().fileManager.processFrontMatter(this.file, (fm) => {
      fm[STICKY_OPACITY_KEY] = opacity;
    });
  }

  private updatePinIcon(button: HTMLElement): void {
    setIcon(button, this.pinned ? "pin-off" : "pin");
    setTooltip(button, this.pinned ? "取消置顶" : "置顶");
  }

  // Obsidian 重渲染会把隐藏的 chrome 弹回来 —— MutationObserver 校验回弹（ssn 模式）。
  private observeReassert(): void {
    if (this.observer) return;
    let scheduled = false;
    this.observer = new MutationObserver(() => {
      if (scheduled || this.chromeIsIntact()) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (!this.document.documentElement.classList.contains("quick-sticky-window")) return;
        this.applyChrome();
      }, 0);
    });
    this.observer.observe(this.document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"],
    });
  }

  private chromeIsIntact(): boolean {
    const doc = this.document;
    return doc.documentElement.classList.contains("quick-sticky-window")
      && doc.title === this.titleKey()
      && !!this.leaf.view.containerEl.querySelector(".view-actions .quick-sticky-color-menu");
  }

  // —— 销毁 ——

  close(): void {
    this.destroy();
    // 关闭原生窗口走 close，失败兜底 destroy（dsn 的 forceClose 模式）
    const w = this.native;
    if (!w) { this.leaf.detach(); return; }
    try { if (!w.isDestroyed()) w.close(); } catch { /* fallthrough */ }
    setTimeout(() => {
      try { if (!w.isDestroyed()) w.destroy(); } catch { /* 已关 */ }
    }, 50);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const d of this.disposers) { try { d(); } catch { /* noop */ } }
    this.disposers = [];
  }
}
