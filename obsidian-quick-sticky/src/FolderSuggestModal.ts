import { FuzzySuggestModal, TFolder } from "obsidian";
import type { App } from "obsidian";

/** 命令面板式文件夹选择器：全局模态层级，输入即模糊过滤，无遮挡问题。 */
export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  constructor(app: App, private onChoose: (folder: TFolder) => void) {
    super(app);
    this.setPlaceholder("输入以过滤文件夹…");
  }

  getItems(): TFolder[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder);
  }

  getItemText(folder: TFolder): string {
    return folder.path === "/" ? "vault 根目录" : folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}

/** TFolder 根目录 path 为 "/"，文件系统操作用空串表示 vault 根。 */
export function folderPathOf(folder: TFolder): string {
  return folder.path === "/" ? "" : folder.path;
}
