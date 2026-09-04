// obsidian 运行时 API 的最小 stub（仅单测用）。
// 只覆盖被测源码模块顶层 import 的符号；main.ts/StickyListView 不进单测。

export class TFile {
  path = "";
  basename = "";
  stat = { mtime: 0 };
}

export function normalizePath(p: string): string {
  return p;
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class MarkdownView {
  file: TFile | null = null;
}

export class TFolder {
  path = "";
  name = "";
}

export class AbstractInputSuggest<T> {
  constructor(_app: unknown, public inputEl: HTMLInputElement) {}
  close(): void {}
}

export function setIcon(_el: HTMLElement, _icon: string): void {}
export function setTooltip(_el: HTMLElement, _tooltip: string): void {}

// —— settings.ts UI 部分需要的基类 ——

export class PluginSettingTab {
  constructor(_app: unknown, _plugin: unknown) {}
  containerEl = document.createElement("div");
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(_cb: (t: unknown) => unknown): this { return this; }
  addToggle(_cb: (t: unknown) => unknown): this { return this; }
  addColorPicker(_cb: (t: unknown) => unknown): this { return this; }
  addButton(_cb: (t: unknown) => unknown): this { return this; }
}
