import { ItemView, TFile, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type QuickStickyPlugin from "./main";

export const STICKY_LIST_VIEW_TYPE = "quick-sticky-list";

export class StickyListView extends ItemView {
  private plugin: QuickStickyPlugin;
  private filter = "";

  constructor(leaf: WorkspaceLeaf, plugin: QuickStickyPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return STICKY_LIST_VIEW_TYPE; }
  getDisplayText(): string { return "便签列表"; }
  getIcon(): string { return "sticky-note"; }

  async onOpen(): Promise<void> {
    this.render();
    // 便签开/关与 vault 变化时刷新
    this.registerEvent(this.app.workspace.on("window-close", () => this.render()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
  }

  async onClose(): Promise<void> { /* 事件由 registerEvent 自动清理 */ }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("quick-sticky-list");

    // 顶部：新建 + 搜索
    const toolbar = contentEl.createEl("div", { cls: "quick-sticky-list-toolbar" });
    const search = toolbar.createEl("input", {
      cls: "quick-sticky-list-search",
      attr: { type: "text", placeholder: "搜索便签…" },
    });
    search.value = this.filter;
    // 每次 render 重建 DOM —— 重绑前清掉旧监听，避免重复触发
    this.registerDomEvent(search, "input", () => {
      this.filter = search.value;
      this.renderList();
    });
    const createBtn = toolbar.createEl("button", { cls: "quick-sticky-list-new" });
    setIcon(createBtn, "plus");
    createBtn.ariaLabel = "新建便签";
    this.registerDomEvent(createBtn, "click", () => void this.plugin.windows.createAndOpenSticky());

    contentEl.createEl("div", { cls: "quick-sticky-list-items" });
    this.renderList();
  }

  private renderList(): void {
    const container = this.contentEl.querySelector(".quick-sticky-list-items") as HTMLElement;
    if (!container) return;
    container.empty();

    const folder = this.plugin.settings.folder;
    const items = this.collectNotes();

    if (!items.length) {
      container.createEl("div", {
        cls: "quick-sticky-list-empty",
        text: this.filter ? "没有匹配的便签" : folder ? `「${folder}」里还没有便签` : "还没有便签",
      });
      return;
    }

    for (const item of items) {
      const row = container.createEl("div", { cls: "quick-sticky-list-item" });
      if (this.plugin.windows.isOpen(item.path)) row.addClass("is-open");

      const dot = row.createEl("span", { cls: "quick-sticky-list-dot" });
      dot.style.background = item.color;

      const body = row.createEl("div", { cls: "quick-sticky-list-item-body" });
      body.createEl("div", { cls: "quick-sticky-list-title", text: item.title });
      if (item.preview) body.createEl("div", { cls: "quick-sticky-list-preview", text: item.preview });

      if (this.plugin.windows.isOpen(item.path)) {
        row.createEl("span", { cls: "quick-sticky-list-open-mark", text: "开启中" });
      }

      this.registerDomEvent(row, "click", () => {
        const file = this.app.vault.getAbstractFileByPath(item.path);
        if (file instanceof TFile) void this.plugin.windows.openSticky(file);
      });
    }
  }

  private collectNotes(): { path: string; title: string; preview: string; color: string }[] {
    const settings = this.plugin.settings;
    const folder = settings.folder.trim();
    const all = this.app.vault.getMarkdownFiles();

    // 文件夹内文件 ∪ 在开记录
    const paths = new Set<string>();
    for (const f of all) {
      if (!folder || f.path.startsWith(`${folder}/`)) paths.add(f.path);
    }
    for (const r of settings.windows) paths.add(r.file);

    const filterLower = this.filter.trim().toLowerCase();
    const items: { path: string; title: string; preview: string; color: string; mtime: number }[] = [];
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const title = file.basename;
      const preview = this.firstLine(file);
      if (filterLower && !title.toLowerCase().includes(filterLower) && !preview.toLowerCase().includes(filterLower)) continue;
      const color = typeof cache?.frontmatter?.["sticky-color"] === "string"
        ? (cache.frontmatter["sticky-color"] as string)
        : settings.defaultColor;
      items.push({ path, title, preview, color, mtime: file.stat.mtime });
    }
    return items.sort((a, b) => b.mtime - a.mtime);
  }

  private firstLine(file: TFile): string {
    const cache = this.app.metadataCache.getFileCache(file);
    // metadataCache 无正文 —— 用首个 heading 近似预览，无 heading 用文件名
    if (cache?.headings?.length) return cache.headings[0].heading;
    return file.basename;
  }
}
