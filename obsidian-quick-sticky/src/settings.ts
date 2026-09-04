// 类型与纯函数不 import obsidian，保证 vitest 可直接加载。

export interface NoteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowRecord {
  file: string;
  bounds: NoteBounds;
  pinned: boolean;
}

export interface StickySettings {
  folder: string;
  nameTemplate: string;
  globalHotkey: string;
  defaultColor: string;
  defaultOpacity: number;
  defaultSize: { width: number; height: number };
  restoreOnStartup: boolean;
  windows: WindowRecord[];
}

export const DEFAULT_SETTINGS: StickySettings = {
  folder: "StickyNotes",
  nameTemplate: "便签 YYYY-MM-DD HH-mm",
  globalHotkey: "Super+F10",
  defaultColor: "#fff3a3",
  defaultOpacity: 1.0,
  defaultSize: { width: 360, height: 360 },
  restoreOnStartup: true,
  windows: [],
};

function clampOpacity(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_SETTINGS.defaultOpacity;
  return Math.min(1, Math.max(0.3, n));
}

function isNoteBounds(v: unknown): v is NoteBounds {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return [b.x, b.y, b.width, b.height].every(
    (n) => typeof n === "number" && Number.isFinite(n),
  );
}

function loadWindowRecord(v: unknown): WindowRecord | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.file !== "string" || !r.file) return null;
  if (!isNoteBounds(r.bounds)) return null;
  return { file: r.file, bounds: r.bounds, pinned: r.pinned === true };
}

function loadSize(v: unknown): StickySettings["defaultSize"] {
  if (typeof v !== "object" || v === null) return { ...DEFAULT_SETTINGS.defaultSize };
  const s = v as Record<string, unknown>;
  const width = typeof s.width === "number" ? s.width : DEFAULT_SETTINGS.defaultSize.width;
  const height = typeof s.height === "number" ? s.height : DEFAULT_SETTINGS.defaultSize.height;
  return { width, height };
}

export function loadSettings(stored: unknown): StickySettings {
  const s = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  const str = (key: keyof StickySettings): string | undefined =>
    typeof s[key] === "string" ? (s[key] as string) : undefined;
  return {
    folder: str("folder") ?? DEFAULT_SETTINGS.folder,
    nameTemplate: str("nameTemplate") ?? DEFAULT_SETTINGS.nameTemplate,
    globalHotkey: str("globalHotkey") ?? DEFAULT_SETTINGS.globalHotkey,
    defaultColor: str("defaultColor") ?? DEFAULT_SETTINGS.defaultColor,
    defaultOpacity: clampOpacity(s.defaultOpacity),
    defaultSize: loadSize(s.defaultSize),
    restoreOnStartup: typeof s.restoreOnStartup === "boolean"
      ? s.restoreOnStartup
      : DEFAULT_SETTINGS.restoreOnStartup,
    windows: Array.isArray(s.windows)
      ? s.windows.map(loadWindowRecord).filter((w): w is WindowRecord => w !== null)
      : [],
  };
}

// —— 热键录制：KeyboardEvent → Electron accelerator（Windows 语义，meta=Super） ——

const ACCELERATOR_KEYS_BY_CODE: Record<string, string> = {
  Space: "Space", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Enter: "Enter", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", PrintScreen: "PrintScreen",
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "\"", Backquote: "`", Comma: ",", Period: ".", Slash: "/",
  NumpadDecimal: "numdec", NumpadAdd: "numadd", NumpadSubtract: "numsub",
  NumpadMultiply: "nummult", NumpadDivide: "numdiv",
};

export function acceleratorKeyForEvent(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  return ACCELERATOR_KEYS_BY_CODE[code] ?? null;
}

export function acceleratorForEvent(event: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const key = acceleratorKeyForEvent(event.code);
  if (!key) return null;

  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Super");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (!modifiers.length) return null; // 裸键不做全局热键，防误触
  return [...modifiers, key].join("+");
}

export function displayAccelerator(accelerator: string): string {
  if (!accelerator) return "Disabled";
  return accelerator
    .split("+")
    .map((part) => {
      if (["Super", "Meta", "Command", "Cmd"].includes(part)) return "Win";
      if (["Control", "Ctrl", "CommandOrControl", "CmdOrCtrl"].includes(part)) return "Ctrl";
      return part;
    })
    .join(" + ");
}

// —— 设置页 UI（依赖 obsidian 的部分） ——

import { AbstractInputSuggest, Notice, PluginSettingTab, Setting, TFolder } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { ElectronBridgeAPI } from "./ElectronBridge";

// 文件夹联想选择器（官方 sample 插件模式）：输入时列出 vault 内匹配的文件夹。
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, private input: HTMLInputElement) {
    super(app, input);
  }

  getSuggestions(inputStr: string): TFolder[] {
    const lower = inputStr.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter(
        (f): f is TFolder =>
          f instanceof TFolder &&
          (f.path.toLowerCase().includes(lower) || f.name.toLowerCase().includes(lower)),
      );
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path;
    this.input.trigger("input");
    this.close();
  }
}

export interface HotkeyPluginFacade {
  settings: StickySettings;
  saveSettings(): Promise<void>;
  bridge: ElectronBridgeAPI;
  setGlobalHotkey(accelerator: string): Promise<void>;
}

export class QuickStickySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: Plugin & HotkeyPluginFacade) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("便签保存位置")
      .setDesc("新便签存放的文件夹（不存在会自动创建）。留空 = vault 根目录。输入时显示文件夹建议。")
      .addText((t) => {
        new FolderSuggest(this.app, t.inputEl);
        t.setPlaceholder("StickyNotes")
          .setValue(this.plugin.settings.folder)
          .onChange(async (v) => {
            this.plugin.settings.folder = v.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("命名模板")
      .setDesc("支持 YYYY MM DD HH mm（年 月 日 时 分）。")
      .addText((t) => t
        .setValue(this.plugin.settings.nameTemplate)
        .onChange(async (v) => {
          this.plugin.settings.nameTemplate = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("默认颜色")
      .addColorPicker((p) => p
        .setValue(this.plugin.settings.defaultColor)
        .onChange(async (v) => {
          this.plugin.settings.defaultColor = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("全局热键（任何应用下新建便签）")
      .setDesc("点击按钮后按下组合键；Esc 取消；Clear 禁用。")
      .addButton((b) => {
        b.setButtonText(displayAccelerator(this.plugin.settings.globalHotkey))
          .onClick(() => this.startRecording(b.buttonEl));
      })
      .addButton((b) => b
        .setButtonText("Clear")
        .setDisabled(!this.plugin.settings.globalHotkey)
        .onClick(async () => {
          await this.plugin.setGlobalHotkey("");
          this.display();
        }));

    new Setting(containerEl)
      .setName("启动时恢复便签")
      .addToggle((t) => t
        .setValue(this.plugin.settings.restoreOnStartup)
        .onChange(async (v) => {
          this.plugin.settings.restoreOnStartup = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("默认窗口尺寸")
      .setDesc("宽 × 高（像素，最小 180）。")
      .addText((t) => t
        .setPlaceholder("360")
        .setValue(String(this.plugin.settings.defaultSize.width))
        .onChange(async (v) => {
          const width = Number(v);
          if (Number.isFinite(width) && width >= 180) {
            this.plugin.settings.defaultSize.width = width;
            await this.plugin.saveSettings();
          }
        }))
      .addText((t) => t
        .setPlaceholder("360")
        .setValue(String(this.plugin.settings.defaultSize.height))
        .onChange(async (v) => {
          const height = Number(v);
          if (Number.isFinite(height) && height >= 180) {
            this.plugin.settings.defaultSize.height = height;
            await this.plugin.saveSettings();
          }
        }));
  }

  private startRecording(button: HTMLButtonElement): void {
    const prev = displayAccelerator(this.plugin.settings.globalHotkey);
    button.setText("按下组合键…");
    const finish = (text: string) => {
      document.removeEventListener("keydown", onKey, true);
      button.setText(text);
    };
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === "Escape") { finish(prev); return; }
      const acc = acceleratorForEvent(event);
      if (!acc) return;
      finish(displayAccelerator(acc));
      void this.plugin.setGlobalHotkey(acc).then(() => {
        new Notice(`便签全局热键：${displayAccelerator(acc)}`);
      });
    };
    document.addEventListener("keydown", onKey, true);
  }
}
