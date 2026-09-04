# Obsidian 桌面便签插件（quick-sticky-notes）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Obsidian 桌面端构建 Windows 便签式悬浮快捷笔记插件——独立 OS 窗口、全局热键新建、置顶、颜色/透明度、多便签重启恢复、侧边栏列表管理。

**架构：** 每张便签 = `workspace.openPopoutLeaf()` 弹出的独立窗口 + 内嵌完整 Markdown 编辑器；`@electron/remote` 的 `BrowserWindow` 实现置顶/透明度/定位（窗口通过唯一标题标记找回）；便签即 vault 内 `.md` 文件，颜色/透明度存 frontmatter，窗口状态存插件 data.json。

**技术栈：** TypeScript + esbuild（bundle `@electron/remote`，external `obsidian`/`electron`）、vitest（纯逻辑单测，`vi.mock("obsidian")`）、Obsidian Plugin API（minAppVersion 1.5.0，isDesktopOnly）。

**规格：** `docs/superpowers/specs/2026-09-05-obsidian-quick-sticky-design.md`
**竞品参考源码：** `%TEMP%/sticky-research/`（dsn = desktop-sticky-notes，ssn = simple-sticky-notes）

**项目目录：** `F:\Cache\AI\obsidian-quick-sticky`（主仓库子目录，与 obsidian-canvas-plus 同模式）
**部署 vault：** `D:/Note/Obsidian/.obsidian/plugins/quick-sticky-notes`（真实 vault；`F:/Cache/AI/obsidian-notes` 只是同步副本）

---

## 文件结构

```
obsidian-quick-sticky/
  manifest.json            插件清单
  package.json             脚本：dev(watch) / build(tsc+esbuild) / test(vitest)
  esbuild.config.mjs       bundle → vault 插件目录，自动复制 manifest/styles
  tsconfig.json
  styles.css               popout chrome 隐藏 + 便签样式
  src/
    main.ts                入口：Plugin 子类，命令/ribbon/右键菜单/vault 事件/生命周期
    settings.ts            设置类型 + DEFAULT_SETTINGS + loadSettings 纯函数 +
                           accelerator 转换纯函数 + PluginSettingsTab（UI 在任务 10 加入）
    ElectronBridge.ts      @electron/remote 唯一封装点，工厂可注入，Electron 不可用时降级
    NoteFileService.ts     命名模板/冲突避让/文件创建/frontmatter 读写
    StickyWindow.ts        单张便签：打开 popout、标题标记、找原生窗口、chrome 注入、
                           外观应用、MutationObserver 防回弹、pin/关闭/聚焦
    WindowManager.ts       位置校验/clamp 纯函数 + 恢复计划纯函数 + 多便签注册表/编排类
    StickyListView.ts      侧边栏列表面板（ItemView）
  tests/                   vitest 单测（每模块一个文件）
```

依赖方向：`main.ts → WindowManager → StickyWindow → ElectronBridge/NoteFileService`；`settings.ts` 被所有模块引用类型与纯函数。纯函数模块顶层 **不得 import obsidian/@electron/remote**（保证 vitest 可直接加载；obsidian 类型仅以结构化类型引用）。测试涉及 import obsidian 的文件时，文件顶部 `vi.mock("obsidian", ...)`。

---

### 任务 0：项目脚手架 + 构建验证

**文件：**
- 创建：`obsidian-quick-sticky/manifest.json`、`package.json`、`esbuild.config.mjs`、`tsconfig.json`、`src/main.ts`（最小插件）、`styles.css`（空占位）

- [ ] **步骤 1：创建 manifest.json**

```json
{
  "id": "quick-sticky-notes",
  "name": "Quick Sticky Notes",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Windows 便签式桌面悬浮快捷笔记：独立窗口、全局热键、置顶、颜色透明度、多便签恢复。",
  "author": "18163623522",
  "isDesktopOnly": true
}
```

- [ ] **步骤 2：创建 package.json**

```json
{
  "name": "obsidian-quick-sticky",
  "version": "0.1.0",
  "private": true,
  "description": "Obsidian 桌面便签插件：独立窗口悬浮快捷笔记。",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "vitest run",
    "check": "tsc -noEmit -skipLibCheck"
  },
  "license": "MIT",
  "devDependencies": {
    "@electron/remote": "^2.1.2",
    "@types/node": "^20.14.10",
    "esbuild": "^0.23.0",
    "obsidian": "latest",
    "typescript": "^5.5.4",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **步骤 3：创建 esbuild.config.mjs**

关键点（dsn 验证过）：`@electron/remote` 是 CJS 包且内部 `require("electron")`，必须 `platform: "node"` + external `electron`，bundle 才能在 Obsidian 里跑。

```js
import esbuild from "esbuild";
import process from "node:process";

const prod = process.argv[2] === "production";
const pluginDir = "D:/Note/Obsidian/.obsidian/plugins/quick-sticky-notes";

const context = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  platform: "node",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  minify: prod,
  outfile: `${pluginDir}/main.js`,
};

async function copyStatic() {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.copyFile("manifest.json", path.join(pluginDir, "manifest.json")).catch(() => {});
  await fs.copyFile("styles.css", path.join(pluginDir, "styles.css")).catch(() => {});
}

await copyStatic();

if (prod) {
  await esbuild.build(context);
} else {
  const ctx = await esbuild.context(context);
  await ctx.watch();
  console.log(`[quick-sticky] watching → ${pluginDir}/main.js`);
}
```

- [ ] **步骤 4：创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["DOM", "ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **步骤 5：创建最小 src/main.ts（可加载的空插件）**

```typescript
import { Plugin } from "obsidian";

export default class QuickStickyPlugin extends Plugin {
  async onload(): Promise<void> {
    this.addCommand({
      id: "ping",
      name: "Ping（开发自检）",
      callback: () => { /* 占位命令，任务 11 移除 */ },
    });
  }
}
```

同时创建空 `styles.css`（内容：`/* quick-sticky-notes styles */`）。

- [ ] **步骤 6：安装依赖并构建验证**

```bash
cd F:/Cache/AI/obsidian-quick-sticky && npm install && npm run build
```

预期：tsc 无错误；esbuild 输出 `D:/Note/Obsidian/.obsidian/plugins/quick-sticky-notes/main.js`；目录里有 main.js/manifest.json/styles.css 三个文件。

- [ ] **步骤 7：在 Obsidian 里加载验证**

用户操作（工作者无法替代）：Obsidian → 设置 → 第三方插件 → 刷新列表 → 启用 Quick Sticky Notes → 命令面板出现 "Ping（开发自检）"。若不出现，检查 vault 路径与文件是否落盘。

- [ ] **步骤 8：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 插件脚手架——构建链路与最小可加载插件"
```

---

### 任务 1：设置模型纯函数（TDD）

**文件：**
- 创建：`src/settings.ts`、`tests/settings.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/settings.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

describe("loadSettings", () => {
  it("空输入返回默认值", () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("合法字段覆盖默认值", () => {
    const s = loadSettings({ folder: "便签", globalHotkey: "Control+F9", defaultOpacity: 0.6 });
    expect(s.folder).toBe("便签");
    expect(s.globalHotkey).toBe("Control+F9");
    expect(s.defaultOpacity).toBe(0.6);
    expect(s.defaultColor).toBe(DEFAULT_SETTINGS.defaultColor);
  });

  it("非法类型字段回退默认值", () => {
    const s = loadSettings({
      folder: 123, defaultOpacity: "high", restoreOnStartup: "yes",
      defaultSize: { width: "wide", height: 360 },
      windows: "not-array",
    } as unknown as object);
    expect(s.folder).toBe(DEFAULT_SETTINGS.folder);
    expect(s.defaultOpacity).toBe(DEFAULT_SETTINGS.defaultOpacity);
    expect(s.restoreOnStartup).toBe(DEFAULT_SETTINGS.restoreOnStartup);
    expect(s.defaultSize).toEqual(DEFAULT_SETTINGS.defaultSize);
    expect(s.windows).toEqual([]);
  });

  it("windows 记录做逐条校验，坏记录被剔除", () => {
    const s = loadSettings({
      windows: [
        { file: "a.md", bounds: { x: 1, y: 2, width: 360, height: 360 }, pinned: true },
        { file: 42 },                                  // 缺 bounds → 剔除
        { file: "b.md", bounds: { x: "x" }, pinned: true }, // bounds 坏 → 剔除
      ],
    } as unknown as object);
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0].file).toBe("a.md");
    expect(s.windows[0].pinned).toBe(true);
  });

  it("opacity 超范围被 clamp 到 0.3–1.0", () => {
    expect(loadSettings({ defaultOpacity: 0.1 }).defaultOpacity).toBe(0.3);
    expect(loadSettings({ defaultOpacity: 2 }).defaultOpacity).toBe(1);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd F:/Cache/AI/obsidian-quick-sticky && npx vitest run tests/settings.test.ts
```

预期：FAIL，报错 `Cannot find module '../src/settings'`。

- [ ] **步骤 3：编写 src/settings.ts（本任务只写纯部分，UI 在任务 10）**

```typescript
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
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/settings.test.ts
```

预期：PASS（5 个测试全绿）。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 设置模型与载入合并纯函数（TDD）"
```

---

### 任务 2：热键 accelerator 转换纯函数（TDD）

**文件：**
- 修改：`src/settings.ts`（追加导出函数）
- 创建：`tests/accelerator.test.ts`

来源：dsn main.ts 61-116 行验证过的转换逻辑。

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/accelerator.test.ts
import { describe, it, expect } from "vitest";
import { acceleratorForEvent, displayAccelerator } from "../src/settings";

const keyEvent = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) =>
  ({
    code,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
    getModifierState: (m: string) =>
      m === "Control" ? !!mods.ctrl : m === "Alt" ? !!mods.alt : m === "Shift" ? !!mods.shift : m === "Meta" ? !!mods.meta : false,
  }) as KeyboardEvent;

describe("acceleratorForEvent（Windows 语义）", () => {
  it("字母键带修饰", () => {
    expect(acceleratorForEvent(keyEvent("KeyN", { ctrl: true, shift: true }))).toBe("Control+Shift+N");
  });
  it("数字/F 键", () => {
    expect(acceleratorForEvent(keyEvent("Digit1", { alt: true }))).toBe("Alt+1");
    expect(acceleratorForEvent(keyEvent("F10", { meta: true }))).toBe("Super+F10");
  });
  it("方向键与标点", () => {
    expect(acceleratorForEvent(keyEvent("ArrowUp", { ctrl: true }))).toBe("Control+Up");
    expect(acceleratorForEvent(keyEvent("Minus", { ctrl: true }))).toBe("Control+-");
  });
  it("无修饰的裸键返回 null（防误触单键全局热键）", () => {
    expect(acceleratorForEvent(keyEvent("KeyN"))).toBeNull();
  });
  it("小键盘数字", () => {
    expect(acceleratorForEvent(keyEvent("Numpad3", { ctrl: true }))).toBe("Control+num3");
  });
});

describe("displayAccelerator（Windows 显示）", () => {
  it("Super 显示为 Win", () => {
    expect(displayAccelerator("Super+F10")).toBe("Win + F10");
  });
  it("Control 显示为 Ctrl", () => {
    expect(displayAccelerator("Control+Shift+N")).toBe("Ctrl + Shift + N");
  });
  it("空串显示 Disabled", () => {
    expect(displayAccelerator("")).toBe("Disabled");
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/accelerator.test.ts
```

预期：FAIL，`acceleratorForEvent` 未导出。

- [ ] **步骤 3：在 src/settings.ts 追加实现**

```typescript
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
  getModifierState(name: string): boolean;
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
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/accelerator.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 热键 accelerator 转换与显示纯函数（TDD）"
```

---

### 任务 3：命名模板与路径纯函数（TDD）

**文件：**
- 创建：`src/NoteFileService.ts`、`tests/naming.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/naming.test.ts
import { describe, it, expect } from "vitest";
import { formatNoteName, noteStickyTitle, windowTitleKey } from "../src/NoteFileService";

describe("formatNoteName（Moment 子集 token）", () => {
  const now = new Date(2026, 8, 5, 14, 7, 3); // 2026-09-05 14:07

  it("默认模板完整展开", () => {
    expect(formatNoteName("便签 YYYY-MM-DD HH-mm", now)).toBe("便签 2026-09-05 14-07");
  });
  it("单个 token 也可用", () => {
    expect(formatNoteName("YYYY", now)).toBe("2026");
    expect(formatNoteName("MM/DD", now)).toBe("09/05");
  });
  it("模板为空返回空串（由调用方回退默认模板）", () => {
    expect(formatNoteName("", now)).toBe("");
  });
  it("非 token 字母原样保留", () => {
    expect(formatNoteName("note YYYYxx", now)).toBe("note 2026xx");
  });
});

describe("窗口标题 key", () => {
  it("含文件名与不可见分隔的 path 编码", () => {
    const key = windowTitleKey("StickyNotes/便签 A.md", "便签 A");
    expect(key.startsWith("便签 — 便签 A\u2063")).toBe(true);
    expect(key.endsWith(encodeURIComponent("StickyNotes/便签 A.md"))).toBe(true);
  });
  it("noteStickyTitle 解析回 path", () => {
    const path = "StickyNotes/便签 A.md";
    expect(noteStickyTitle(windowTitleKey(path, "便签 A"))).toBe(path);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/naming.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：编写 src/NoteFileService.ts（本任务只写纯函数部分）**

```typescript
// 纯函数部分不 import obsidian。

export function formatNoteName(template: string, now: Date): string {
  if (!template) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return template
    .replace(/YYYY/g, String(now.getFullYear()))
    .replace(/MM/g, pad(now.getMonth() + 1))
    .replace(/DD/g, pad(now.getDate()))
    .replace(/HH/g, pad(now.getHours()))
    .replace(/mm/g, pad(now.getMinutes()));
}

// 窗口标题 key：可见部分 + U+2063 不可见分隔符 + encodeURIComponent(path)。
// Electron 端按标题找回窗口、去重、识别便签窗口全靠它（dsn 模式）。
const TITLE_SEP = "\u2063";

export function windowTitleKey(path: string, basename: string): string {
  return `便签 — ${basename}${TITLE_SEP}${encodeURIComponent(path)}`;
}

export function noteStickyTitle(title: string): string | null {
  const idx = title.indexOf(TITLE_SEP);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(title.slice(idx + TITLE_SEP.length));
  } catch {
    return null;
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/naming.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 命名模板与窗口标题 key 纯函数（TDD）"
```

---

### 任务 4：位置校验与 clamp 纯函数（TDD）

**文件：**
- 创建：`src/WindowManager.ts`（本任务只写纯函数）、`tests/position.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/position.test.ts
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
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/position.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：创建 src/WindowManager.ts（纯函数部分）**

```typescript
import type { NoteBounds } from "./settings";

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
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/position.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 多显示器位置校验与 clamp 纯函数（TDD）"
```

---

### 任务 5：恢复计划纯函数（TDD）

**文件：**
- 修改：`src/WindowManager.ts`（追加）
- 创建：`tests/restore.test.ts`

把"给定保存的窗口记录 + 当前 vault 文件 + 本会话已活的便签，决定每条记录怎么处理"提取为纯函数——这是恢复编排的核心决策，也是最容易出 bug 的地方。

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/restore.test.ts
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
```

- [ ] **步骤 2：运行测试验证验证失败**

```bash
npx vitest run tests/restore.test.ts
```

预期：FAIL，`planRestore` 未导出。

- [ ] **步骤 3：在 src/WindowManager.ts 追加**

```typescript
import type { NoteBounds, WindowRecord } from "./settings";

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
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/restore.test.ts
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 恢复计划决策纯函数（TDD）"
```

---

### 任务 6：ElectronBridge 封装与降级（TDD）

**文件：**
- 创建：`src/ElectronBridge.ts`、`tests/bridge.test.ts`

设计要点：**模块顶层绝不 import `@electron/remote`**（否则 vitest/Obsidian 移动端会炸）——用惰性 `require` + 工厂注入，Electron 不可用时 `available: false`，上层自动降级为普通 popout。

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/bridge.test.ts
import { describe, it, expect, vi } from "vitest";
import { createElectronBridge } from "../src/ElectronBridge";

// @electron/remote 的结构化 mock —— 工厂注入，不真装 Electron。
function mockRemote(windows: { title: string; destroyed?: boolean }[] = []) {
  return {
    BrowserWindow: {
      getAllWindows: () =>
        windows.map((w) => ({
          getTitle: () => w.title,
          isDestroyed: () => !!w.destroyed,
          setAlwaysOnTop: vi.fn(),
          isAlwaysOnTop: () => false,
        })),
    },
    globalShortcut: {
      register: vi.fn(() => true),
      unregister: vi.fn(),
      isRegistered: vi.fn(() => false),
    },
    screen: {
      getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    },
  };
}

describe("createElectronBridge", () => {
  it("remote 可用时 available=true 且能按标题找窗口", () => {
    const remote = mockRemote([{ title: "A" }, { title: "B" }]);
    const bridge = createElectronBridge(remote as never);
    expect(bridge.available).toBe(true);
    expect(bridge.findWindowByTitle("B")?.getTitle()).toBe("B");
    expect(bridge.findWindowByTitle("C")).toBeNull();
  });

  it("已销毁窗口不会被返回", () => {
    const remote = mockRemote([{ title: "A", destroyed: true }]);
    const bridge = createElectronBridge(remote as never);
    expect(bridge.findWindowByTitle("A")).toBeNull();
  });

  it("remote 缺失/抛错时降级 available=false，所有操作安全无异常", () => {
    const bridge = createElectronBridge(undefined as never, () => {
      throw new Error("no electron");
    });
    expect(bridge.available).toBe(false);
    expect(bridge.findWindowByTitle("A")).toBeNull();
    expect(bridge.getDisplays()).toEqual([]);
    expect(bridge.registerGlobalShortcut("Super+F10", () => {})).toBe(false);
    expect(() => bridge.unregisterGlobalShortcut("Super+F10")).not.toThrow();
  });

  it("热键注册：先 isRegistered 再 unregister 旧回调再 register（防重载残留）", () => {
    const remote = mockRemote();
    remote.globalShortcut.isRegistered = vi.fn(() => true);
    const bridge = createElectronBridge(remote as never);
    const cb = () => {};
    bridge.registerGlobalShortcut("Super+F10", cb);
    expect(remote.globalShortcut.unregister).toHaveBeenCalledWith("Super+F10");
    expect(remote.globalShortcut.register).toHaveBeenCalledWith("Super+F10", cb);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/bridge.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：编写 src/ElectronBridge.ts**

```typescript
// @electron/remote 的唯一封装点。模块顶层不 import 它（vitest/无 Node 环境会炸），
// 由 requireRemote 在运行时惰性加载；测试通过参数注入 mock。

import type { NoteBounds } from "./settings";

export interface NativeWindow {
  setAlwaysOnTop(v: boolean, level?: string): void;
  isAlwaysOnTop(): boolean;
  setTitle(t: string): void;
  getTitle(): string;
  setParentWindow(w: NativeWindow | null): void;
  setOpacity(o: number): void;
  setBounds(b: NoteBounds): void;
  getPosition(): [number, number];
  getBounds(): NoteBounds;
  setBackgroundColor(c: string): void;
  setResizable(v: boolean): void;
  isDestroyed(): boolean;
  isFocused(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  show(): void;
  restore(): void;
  focus(): void;
  moveTop(): void;
  close(): void;
  destroy(): void;
}

export interface RemoteLike {
  BrowserWindow: { getAllWindows(): unknown[] };
  globalShortcut: {
    register(accelerator: string, cb: () => void): boolean;
    unregister(accelerator: string): void;
    isRegistered(accelerator: string): boolean;
  };
  screen: { getAllDisplays(): { workArea: NoteBounds }[] };
}

export interface ElectronBridgeAPI {
  available: boolean;
  getAllWindows(): NativeWindow[];
  findWindowByTitle(title: string): NativeWindow | null;
  getDisplays(): { workArea: NoteBounds }[];
  registerGlobalShortcut(accelerator: string, cb: () => void): boolean;
  unregisterGlobalShortcut(accelerator: string): void;
}

type RequireFn = () => unknown;

// 生产环境：window.require（Obsidian renderer 开启 nodeIntegration 时可用）。
function defaultRequireRemote(): unknown {
  const req = (globalThis as { require?: NodeRequire; window?: { require?: NodeRequire } })
    .require ?? (globalThis as { window?: { require?: NodeRequire } }).window?.require;
  if (typeof req !== "function") return undefined;
  try {
    return req("@electron/remote");
  } catch {
    return undefined;
  }
}

function asRemote(v: unknown): RemoteLike | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (!r.BrowserWindow || !r.globalShortcut || !r.screen) return null;
  return v as RemoteLike;
}

function toNativeWindow(v: unknown): NativeWindow | null {
  if (typeof v !== "object" || v === null) return null;
  const w = v as Record<string, unknown>;
  if (typeof w.getTitle !== "function" || typeof w.isDestroyed !== "function") return null;
  return v as NativeWindow;
}

const UNAVAILABLE: ElectronBridgeAPI = {
  available: false,
  getAllWindows: () => [],
  findWindowByTitle: () => null,
  getDisplays: () => [],
  registerGlobalShortcut: () => false,
  unregisterGlobalShortcut: () => undefined,
};

export function createElectronBridge(
  injectedRemote?: RemoteLike,
  requireRemote: RequireFn = defaultRequireRemote,
): ElectronBridgeAPI {
  const remote = injectedRemote ? asRemote(injectedRemote) : asRemote(requireRemote());
  if (!remote) return UNAVAILABLE;

  const asNative = (list: unknown[]): NativeWindow[] =>
    list.map(toNativeWindow).filter((w): w is NativeWindow => w !== null);

  return {
    available: true,
    getAllWindows: () => asNative(remote.BrowserWindow.getAllWindows()),
    findWindowByTitle: (title) =>
      asNative(remote.BrowserWindow.getAllWindows()).find(
        (w) => !w.isDestroyed() && w.getTitle() === title,
      ) ?? null,
    getDisplays: () => {
      try {
        return remote.screen.getAllDisplays();
      } catch {
        return [];
      }
    },
    registerGlobalShortcut: (accelerator, cb) => {
      try {
        // 渲染进程重载后旧回调可能残留注册 —— 先抢回再注册（dsn 模式）。
        if (remote.globalShortcut.isRegistered(accelerator)) {
          remote.globalShortcut.unregister(accelerator);
        }
        return remote.globalShortcut.register(accelerator, cb);
      } catch {
        return false;
      }
    },
    unregisterGlobalShortcut: (accelerator) => {
      try {
        if (remote.globalShortcut.isRegistered(accelerator)) {
          remote.globalShortcut.unregister(accelerator);
        }
      } catch {
        // 降级路径：静默
      }
    },
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/bridge.test.ts
```

预期：PASS（4 个测试全绿）。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): ElectronBridge 封装与无 Electron 降级（TDD）"
```

---

### 任务 7：NoteFileService 完整实现（文件创建 + frontmatter）

**文件：**
- 修改：`src/NoteFileService.ts`（追加类）
- 创建：`tests/notefile.test.ts`

frontmatter 契约（规格 §3.1）：`sticky-color` / `sticky-opacity`。本任务的纯映射逻辑可 TDD；`vault`/`processFrontMatter` 交互部分以最小 mock 验证调用契约。

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/notefile.test.ts
import { describe, it, expect, vi } from "vitest";

// NoteFileService import 了 obsidian 的 TFile —— 顶层 mock 掉。
vi.mock("obsidian", () => ({ TFile: class {}, normalizePath: (p: string) => p }));

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
    // 固定"当前时间"让模板产出 已存在的名字
    const name = "便签 X";
    const file = await svc.createNote("StickyNotes", name);
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
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/notefile.test.ts
```

预期：FAIL，`NoteFileService` 类未导出。

- [ ] **步骤 3：在 src/NoteFileService.ts 追加类实现**

```typescript
// —— 依赖 obsidian 的部分 ——
import { TFile, normalizePath } from "obsidian";

export const STICKY_COLOR_KEY = "sticky-color";
export const STICKY_OPACITY_KEY = "sticky-opacity";

export interface StickyProps {
  color: string;
  opacity: number;
}

// App 的结构化子集（避免 import obsidian 的 App 类型拖进 vitest 依赖）。
interface AppLike {
  vault: {
    getAbstractFileByPath(path: string): unknown;
    createFolder(path: string): Promise<unknown>;
    create(path: string, content: string): Promise<TFile>;
  };
  fileManager: {
    processFrontMatter(
      file: TFile,
      fn: (frontmatter: Record<string, unknown>) => void,
    ): Promise<void>;
  };
  metadataCache: {
    getFileCache(file: TFile): { frontmatter?: Record<string, unknown> } | null;
  };
}

export class NoteFileService {
  constructor(private app: AppLike) {}

  // 冲突避让：同名存在则追加 " (2)"、" (3)"…
  private async uniquePath(folder: string, baseName: string): Promise<string> {
    const prefix = folder ? `${folder}/` : "";
    let candidate = `${prefix}${baseName}.md`;
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${prefix}${baseName} (${i++}).md`;
    }
    return candidate;
  }

  async createNote(folder: string, baseName: string): Promise<TFile> {
    const normalized = folder.trim().replace(/^\/+|\/+$/g, "");
    const target = normalized ? normalizePath(normalized) : "";
    if (target && !this.app.vault.getAbstractFileByPath(target)) {
      await this.app.vault.createFolder(target);
    }
    const path = await this.uniquePath(target, baseName);
    return this.app.vault.create(path, "");
  }

  async readStickyProps(file: TFile): Promise<Partial<StickyProps>> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const color = typeof fm[STICKY_COLOR_KEY] === "string" ? (fm[STICKY_COLOR_KEY] as string) : undefined;
    const rawOpacity = Number(fm[STICKY_OPACITY_KEY]);
    const opacity = Number.isFinite(rawOpacity) && rawOpacity > 0
      ? Math.min(1, Math.max(0.3, rawOpacity))
      : undefined;
    const props: Partial<StickyProps> = {};
    if (color) props.color = color;
    if (opacity !== undefined) props.opacity = opacity;
    return props;
  }

  async writeStickyProps(file: TFile, props: StickyProps): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[STICKY_COLOR_KEY] = props.color;
      fm[STICKY_OPACITY_KEY] = props.opacity;
    });
  }
}
```

注意：`import { TFile } from "obsidian"` 后，`tests/naming.test.ts`（任务 3）也会受影响——给该测试文件顶部补一行 mock：

```typescript
vi.mock("obsidian", () => ({ TFile: class {}, normalizePath: (p: string) => p }));
```

并在其 import 区补 `import { vi } from "vitest";`（`vi.mock` 是 hoisted 的，放在文件最顶部）。

- [ ] **步骤 4：运行全部测试验证通过**

```bash
npx vitest run
```

预期：全部 PASS（含任务 1-6 的旧测试，确认无回归）。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 便签文件创建/冲突避让/frontmatter 读写服务（TDD）"
```

---

### 任务 8：StickyWindow 单窗口类

**文件：**
- 创建：`src/StickyWindow.ts`
- 修改：`src/settings.ts`（无改动，仅引用）

本任务起进入 DOM/Electron 交互区，无法单测的部分以手动验证点收尾；可测的窗口就绪判定辅助以纯函数先行。

- [ ] **步骤 1：在 tests/stickywindow-ready.test.ts 写 waitForPopoutReady 谓词的失败测试**

```typescript
// tests/stickywindow-ready.test.ts
import { describe, it, expect } from "vitest";
import { isPopoutReady } from "../src/StickyWindow";

describe("isPopoutReady（popout 加载就绪谓词）", () => {
  it("doc 含 .app-container .workspace-leaf 且 containerEl 已连接 → ready", () => {
    const doc = {
      querySelector: (sel: string) => (sel === ".app-container .workspace-leaf" ? {} : null),
    };
    expect(isPopoutReady(doc, { isConnected: true })).toBe(true);
  });
  it("缺 .workspace-leaf → 未就绪", () => {
    const doc = { querySelector: () => null };
    expect(isPopoutReady(doc, { isConnected: true })).toBe(false);
  });
  it("containerEl 未连接 → 未就绪", () => {
    const doc = { querySelector: () => ({}) };
    expect(isPopoutReady(doc, { isConnected: false })).toBe(false);
  });
});
```

- [ ] **步骤 2：运行验证失败**

```bash
npx vitest run tests/stickywindow-ready.test.ts
```

预期：FAIL，`isPopoutReady` 未导出。

- [ ] **步骤 3：编写 src/StickyWindow.ts**

```typescript
import { MarkdownView, Notice, setIcon, setTooltip } from "obsidian";
import type { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { ElectronBridgeAPI, NativeWindow } from "./ElectronBridge";
import { STICKY_COLOR_KEY, STICKY_OPACITY_KEY, noteStickyTitle, windowTitleKey } from "./NoteFileService";
import type { StickySettings } from "./settings";

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

interface StickyWindowInit {
  file: TFile;
  leaf: WorkspaceLeaf;
  settings: StickySettings;
  bridge: ElectronBridgeAPI;
  plugin: Plugin;
  saved?: { bounds?: { x: number; y: number; width: number; height: number }; pinned?: boolean };
  /** 恢复场景：不聚焦不打扰 */
  background?: boolean;
}

export class StickyWindow {
  readonly file: TFile;
  readonly leaf: WorkspaceLeaf;
  private native: NativeWindow | null = null;
  private observer: MutationObserver | null = null;
  private disposers: (() => void)[] = [];

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

  restoreBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.nativeWindow?.setBounds(bounds);
  }

  getBounds(): { x: number; y: number; width: number; height: number } | null {
    return this.nativeWindow ? this.nativeWindow.getBounds() : null;
  }

  // —— 外观 ——

  async applyAppearance(color?: string, opacity?: number): Promise<void> {
    const doc = this.document;
    const c = color ?? (await this.readColor());
    const o = opacity ?? this.ctx.settings.defaultOpacity;
    if (c) {
      for (const v of ["--background-primary", "--background-primary-alt",
        "--background-secondary", "--background-secondary-alt"] as const) {
        doc.documentElement.style.setProperty(v, c);
      }
      doc.body?.style.setProperty("--sticky-note-background", c);
      this.nativeWindow?.setBackgroundColor(c);
    }
    if (o !== undefined && o !== 1) {
      this.nativeWindow?.setOpacity(o);
    }
  }

  private async readColor(): Promise<string | undefined> {
    const cache = (this.ctx.plugin.app as unknown as {
      metadataCache: { getFileCache(f: TFile): { frontmatter?: Record<string, unknown> } | null };
    }).metadataCache.getFileCache(this.file);
    const v = cache?.frontmatter?.[STICKY_COLOR_KEY];
    return typeof v === "string" ? v : undefined;
  }

  private readOpacity(): number | undefined {
    const cache = (this.ctx.plugin.app as unknown as {
      metadataCache: { getFileCache(f: TFile): { frontmatter?: Record<string, unknown> } | null };
    }).metadataCache.getFileCache(this.file);
    const v = Number(cache?.frontmatter?.[STICKY_OPACITY_KEY]);
    return Number.isFinite(v) && v > 0 ? Math.min(1, Math.max(0.3, v)) : undefined;
  }

  // —— chrome：隐藏 Obsidian UI + 注入便签操作按钮 ——

  private applyChrome(): void {
    const doc = this.document;
    doc.documentElement.classList.add("quick-sticky-window");
    doc.body?.classList.add("quick-sticky-window");
    doc.title = this.titleKey();
    this.injectActions();
    this.observeReassert();
  }

  private injectActions(): void {
    const view = this.leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const actions = view.containerEl.querySelector(".view-actions");
    if (!actions || actions.querySelector(".quick-sticky-action")) return; // 已注入

    actions.empty();

    // pin
    const pin = view.addAction("pin", "置顶", () => {
      this.setPinned(!this.pinned);
      this.updatePinIcon(pin);
    });
    this.updatePinIcon(pin);
    this.disposers.push(() => pin.remove());

    // 取色：6 预设 + 自定义
    const colorWrap = actions.createEl("div", { cls: "quick-sticky-color-menu" });
    for (const c of PRESET_COLORS) {
      const swatch = colorWrap.createEl("button", {
        cls: "quick-sticky-swatch",
        attr: { "aria-label": c, style: `background:${c}` },
      });
      this.ctx.plugin.registerDomEvent(swatch, "click", () => this.applyColor(c));
    }
    const custom = colorWrap.createEl("input", {
      cls: "quick-sticky-color-custom",
      attr: { type: "color", "aria-label": "自定义颜色" },
    });
    if (custom instanceof HTMLInputElement) {
      this.ctx.plugin.registerDomEvent(custom, "input", () => this.applyColor(custom.value));
    }

    // 透明度滑杆
    const opacityBtn = actions.createEl("button", { cls: "clickable-icon quick-sticky-action" });
    setIcon(opacityBtn, "eye");
    setTooltip(opacityBtn, "透明度");
    const sliderWrap = actions.createEl("div", { cls: "quick-sticky-opacity-popover" });
    const slider = sliderWrap.createEl("input", {
      cls: "quick-sticky-opacity-slider",
      attr: { type: "range", min: "0.3", max: "1", step: "0.05" },
    });
    if (slider instanceof HTMLInputElement) {
      slider.value = String(this.readOpacity() ?? this.ctx.settings.defaultOpacity);
      this.ctx.plugin.registerDomEvent(slider, "input", () => {
        const v = Number(slider.value);
        this.applyAppearance(undefined, v);
        this.lastOpacity = v;
      });
      this.ctx.plugin.registerDomEvent(opacityBtn, "click", () => {
        sliderWrap.classList.toggle("is-open");
      });
    }

    // 编辑/阅读切换
    const mode = view.addAction("pencil", "切换编辑/阅读", () => {
      const next = view.getMode() === "source" ? "preview" : "source";
      void view.setState({ mode: next }, { history: false });
      setIcon(mode, next === "source" ? "book-open" : "pencil");
    });

    // 关闭（文件保留）
    view.addAction("x", "关闭便签", () => this.close());
    this.disposers.push(() => { colorWrap.remove(); sliderWrap.remove(); mode.remove(); });
  }

  private lastOpacity: number | undefined;

  private async applyColor(color: string): Promise<void> {
    await this.applyAppearance(color);
    this.lastOpacity = this.lastOpacity ?? this.readOpacity() ?? this.ctx.settings.defaultOpacity;
    // 写 frontmatter（颜色与最近透明度一起落盘）
    const fm = (this.ctx.plugin.app as unknown as {
      fileManager: {
        processFrontMatter(f: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void>;
      };
    }).fileManager;
    await fm.processFrontMatter(this.file, (frontmatter) => {
      frontmatter[STICKY_COLOR_KEY] = color;
      frontmatter[STICKY_OPACITY_KEY] = this.lastOpacity ?? this.ctx.settings.defaultOpacity;
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
```

- [ ] **步骤 4：运行测试验证通过 + 类型检查**

```bash
npx vitest run && npm run check
```

预期：全部测试 PASS，tsc 无错误。

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): StickyWindow 单窗口类——原生窗口接管/chrome 注入/外观/防回弹"
```

---

### 任务 9：WindowManager 多便签编排

**文件：**
- 修改：`src/WindowManager.ts`（追加类）

- [ ] **步骤 1：在 src/WindowManager.ts 追加 WindowManager 类**

职责：注册表（path → StickyWindow）、去重收养（同文件已开则聚焦）、保存/恢复编排。它只做编排，DOM 细节全部在 StickyWindow。

```typescript
// —— 以下追加到 src/WindowManager.ts ——
import { MarkdownView, Notice } from "obsidian";
import type { App, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StickyWindow } from "./StickyWindow";
import type { ElectronBridgeAPI } from "./ElectronBridge";
import { NoteFileService, formatNoteName } from "./NoteFileService";
import type { StickySettings } from "./settings";

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

  // —— 打开 ——

  /** 通用打开路径：已开 → 聚焦；否则新开（规格 §4.2 去重收养语义）。 */
  async openSticky(file: TFile, opts: { saved?: { bounds?: { x: number; y: number; width: number; height: number }; pinned?: boolean }; background?: boolean } = {}): Promise<StickyWindow | null> {
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
      });
      this.track(file.path, win);
      return win;
    }

    const settings = this.getSettings();
    const size = settings.defaultSize;
    const leaf = (this.plugin.app.workspace as unknown as {
      openPopoutLeaf(o: { size: { width: number; height: number } }): WorkspaceLeaf;
    }).openPopoutLeaf({ size });
    await leaf.openFile(file, { active: !opts.background });
    const win = await StickyWindow.open({
      file, leaf, settings, bridge: this.bridge, plugin: this.plugin,
      saved: opts.saved, background: opts.background,
    });
    this.track(file.path, win);
    return win;
  }

  /** 热键/命令路径：新建一张便签并聚焦。 */
  async createAndOpenSticky(): Promise<StickyWindow | null> {
    const settings = this.getSettings();
    const template = settings.nameTemplate || "便签 YYYY-MM-DD HH-mm";
    const baseName = formatNoteName(template, new Date()) || "便签";
    try {
      const file = await this.noteFiles.createNote(settings.folder, baseName);
      return await this.openSticky(file);
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

  private track(path: string, win: StickyWindow): void {
    this.byPath.set(path, win);
    // popout 被 Obsidian/用户直接关闭（未走 close()）→ window-close 事件里由 main 调 untrack
  }

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
    const app = this.plugin.app as App;
    const workspace = app.workspace as unknown as {
      rootSplit: unknown; leftSplit: unknown; rightSplit: unknown;
      iterateAllLeaves(cb: (leaf: WorkspaceLeaf) => void): void;
    };
    workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      if (!(leaf.view instanceof MarkdownView)) return;
      if (leaf.view.file?.path !== path) return;
      const root = (leaf as unknown as { getRoot(): unknown }).getRoot();
      if (root === workspace.rootSplit || root === workspace.leftSplit || root === workspace.rightSplit) return; // 主窗口
      const doc = leaf.view.containerEl.ownerDocument;
      if (doc.documentElement.classList.contains("quick-sticky-window")) return; // 已是便签
      found = leaf;
    });
    return found;
  }

  // —— 保存/恢复 ——

  /** 收集当前在开便签的 {file, bounds, pinned} 写入 settings（退出/卸载时调用）。 */
  async saveWindowsState(): Promise<void> {
    const records: { file: string; bounds: { x: number; y: number; width: number; height: number }; pinned: boolean }[] = [];
    for (const [path, win] of this.byPath) {
      const bounds = win.getBounds();
      records.push({ file: path, bounds: bounds ?? { ...this.getSettings().defaultSize, x: 0, y: 0 }, pinned: win.pinned });
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
```

- [ ] **步骤 2：类型检查 + 全量测试**

```bash
npm run check && npx vitest run
```

预期：tsc 无错误，旧测试全绿（WindowManager 类不参与单测——其编排正确性由 planRestore 纯函数测试 + 手动验收覆盖）。

- [ ] **步骤 3：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): WindowManager 多便签注册表/去重收养/保存恢复编排"
```

---

### 任务 10：设置页 UI + 热键注册

**文件：**
- 修改：`src/settings.ts`（追加 PluginSettingsTab + 热键注册器）
- 修改：`src/main.ts`（暂不接，任务 11 集成）

- [ ] **步骤 1：在 src/settings.ts 追加设置页与热键管理**

```typescript
// —— 依赖 obsidian 的 UI 部分（追加到 settings.ts 末尾）——
import { PluginSettingTab, Setting, Notice } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { ElectronBridgeAPI } from "./ElectronBridge";

export interface HotkeyOptions {
  folder: boolean;
  nameTemplate: boolean;
  defaultColor: boolean;
  hotkey: boolean;
  restore: boolean;
  defaultSize: boolean;
}

export class QuickStickySettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: Plugin & {
      settings: StickySettings;
      saveSettings(): Promise<void>;
      bridge: ElectronBridgeAPI;
      setGlobalHotkey(accelerator: string): Promise<void>;
    },
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("便签文件夹")
      .setDesc("新便签存放位置。留空 = vault 根目录。")
      .addText((t) => t
        .setPlaceholder("StickyNotes")
        .setValue(this.plugin.settings.folder)
        .onChange(async (v) => {
          this.plugin.settings.folder = v.trim();
          await this.plugin.saveSettings();
        }));

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
```

- [ ] **步骤 2：类型检查**

```bash
npm run check
```

预期：tsc 无错误（main.ts 还没引用这些导出，属正常——任务 11 接上）。

- [ ] **步骤 3：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 设置页 UI 与热键录制控件"
```

---

### 任务 11：main.ts 集成——命令/热键/菜单/生命周期/列表入口

**文件：**
- 重写：`src/main.ts`

- [ ] **步骤 1：重写 src/main.ts**

```typescript
import { MarkdownView, Notice, Platform, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { createElectronBridge } from "./ElectronBridge";
import { loadSettings, displayAccelerator } from "./settings";
import type { StickySettings } from "./settings";
import { WindowManager } from "./WindowManager";
import { StickyListView, STICKY_LIST_VIEW_TYPE } from "./StickyListView";
import { QuickStickySettingTab } from "./settings";

export default class QuickStickyPlugin extends Plugin {
  settings!: StickySettings;
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
```

同时：StickyWindow.open 成功后需要把 path 写到 popout 的 documentElement 上（供 window-close 识别）。在 `src/StickyWindow.ts` 的 `applyChrome()` 中，`classList.add("quick-sticky-window")` 之后补一行：

```typescript
doc.documentElement.dataset.quickStickyPath = this.file.path;
```

- [ ] **步骤 2：创建最小 src/StickyListView.ts 占位（任务 12 填充）**

为了让 main.ts 编译通过（它 import 了 StickyListView），先给最小实现：

```typescript
import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";

export const STICKY_LIST_VIEW_TYPE = "quick-sticky-list";

export class StickyListView extends ItemView {
  constructor(leaf: WorkspaceLeaf, _plugin: unknown) {
    super(leaf);
  }
  getViewType(): string { return STICKY_LIST_VIEW_TYPE; }
  getDisplayText(): string { return "便签列表"; }
  getIcon(): string { return "sticky-note"; }
  async onOpen(): Promise<void> { /* 任务 12 实现 */ }
  async onClose(): Promise<void> { /* noop */ }
}
```

- [ ] **步骤 3：类型检查 + 构建 + 全量测试**

```bash
npm run check && npm run build && npx vitest run
```

预期：tsc/esbuild 成功产出 main.js，测试全绿。

- [ ] **步骤 4：部署烟测（用户配合）**

用户操作：Obsidian 内重载插件（禁用→启用 或 Ctrl+P "Reload app without saving"）：
1. ribbon 出现便签图标，点击 → 弹出独立便签窗口，可直接输入
2. 命令面板四个命令全部可用
3. 文件管理器右键 md 文件 → "作为便签打开"
4. 关闭便签窗口 → 文件仍在 vault 中
5. 卸载/禁用再启用插件 → 便签按位置恢复

- [ ] **步骤 5：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): main.ts 集成——命令/热键/菜单/恢复/生命周期"
```

---

### 任务 12：便签列表面板

**文件：**
- 重写：`src/StickyListView.ts`

- [ ] **步骤 1：实现完整列表面板**

```typescript
import { ItemView, MarkdownView, TFile, setIcon } from "obsidian";
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
      container.createEl("div", { cls: "quick-sticky-list-empty", text: folder ? `「${folder}」里还没有便签` : "还没有便签" });
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
        const open = row.createEl("span", { cls: "quick-sticky-list-open-mark", text: "开启中" });
        open.ariaLabel = "点击置前";
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
      const preview = (cache ? this.firstLine(file) : "") ?? "";
      if (filterLower && !title.toLowerCase().includes(filterLower) && !preview.toLowerCase().includes(filterLower)) continue;
      const color = typeof cache?.frontmatter?.["sticky-color"] === "string"
        ? (cache.frontmatter["sticky-color"] as string)
        : settings.defaultColor;
      items.push({ path, title, preview, color, mtime: file.stat.mtime });
    }
    return items.sort((a, b) => b.mtime - a.mtime);
  }

  private firstLine(file: TFile): string | null {
    const cache = this.app.metadataCache.getFileCache(file);
    // headings/首段都行——用文件第一行缓存近似（metadataCache 无正文，用 headings fallback）
    if (cache?.headings?.length) return cache.headings[0].heading;
    return file.basename;
  }
}
```

- [ ] **步骤 2：类型检查 + 构建**

```bash
npm run check && npm run build
```

预期：成功。

- [ ] **步骤 3：手动验证（用户配合）**

1. 命令「打开便签列表面板」→ 面板出现在标签页
2. 建 3 张不同颜色的便签 → 列表显示颜色点 + 开启中标记
3. 搜索框过滤生效
4. 点击列表项 → 已开的置前，未开的打开

- [ ] **步骤 4：Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 便签列表面板——颜色点/预览/搜索/开启状态"
```

---

### 任务 13：styles.css + 全量手动验收

**文件：**
- 重写：`styles.css`

- [ ] **步骤 1：编写 styles.css**

```css
/* ===== Quick Sticky Notes ===== */

/* —— popout 内隐藏 Obsidian chrome（ssn selector 清单，按需增删）—— */
.quick-sticky-window .workspace-tab-header-container,
.quick-sticky-window .workspace-tab-header,
.quick-sticky-window .mod-workspace-tab-header,
.quick-sticky-window .view-header-nav-buttons,
.quick-sticky-window .view-header-breadcrumb,
.quick-sticky-window .view-header-left,
.quick-sticky-window .view-header-status-container,
.quick-sticky-window .sidebar-toggle-button,
.quick-sticky-window .side-dock-actions,
.quick-sticky-window .status-bar,
.quick-sticky-window .titlebar,
.quick-sticky-window .metadata-container,
.quick-sticky-window .metadata-properties,
.quick-sticky-window .metadata-add-button,
.quick-sticky-window .frontmatter-section,
.quick-sticky-window .mod-header,
.quick-sticky-window .inline-title {
  display: none !important;
}

/* 便签窗口内容留白 */
.quick-sticky-window .view-content {
  padding: 4px 16px 16px 20px;
}

/* popout 通知类悬浮物不干扰（隐藏在便签窗口内的 notice/progress） */
.quick-sticky-window .notice-container,
.quick-sticky-window .notice,
.quick-sticky-window .progress-bar {
  display: none !important;
}

/* —— view-actions 里的便签控件 —— */
.quick-sticky-color-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}
.quick-sticky-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--background-modifier-border);
  cursor: pointer;
  padding: 0;
}
.quick-sticky-swatch:hover {
  transform: scale(1.15);
}
.quick-sticky-color-custom {
  width: 18px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.quick-sticky-opacity-popover {
  display: none;
  position: absolute;
  right: 8px;
  top: 42px;
  z-index: 20;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 10px;
  box-shadow: var(--shadow-s);
}
.quick-sticky-opacity-popover.is-open {
  display: block;
}
.quick-sticky-opacity-slider {
  width: 160px;
}

/* —— 列表面板 —— */
.quick-sticky-list {
  padding: 8px;
}
.quick-sticky-list-toolbar {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.quick-sticky-list-search {
  flex: 1;
}
.quick-sticky-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.quick-sticky-list-item:hover {
  background: var(--background-modifier-hover);
}
.quick-sticky-list-item.is-open {
  background: var(--background-modifier-active-hover);
}
.quick-sticky-list-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
  border: 1px solid var(--background-modifier-border);
}
.quick-sticky-list-item-body {
  flex: 1;
  min-width: 0;
}
.quick-sticky-list-title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quick-sticky-list-preview {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quick-sticky-list-open-mark {
  font-size: var(--font-ui-smaller);
  color: var(--text-accent);
  flex: none;
}
.quick-sticky-list-empty {
  color: var(--text-muted);
  padding: 16px 0;
  text-align: center;
}
```

- [ ] **步骤 2：构建部署**

```bash
npm run build
```

- [ ] **步骤 3：全量手动验收（用户配合，对照规格 §7.2）**

| # | 场景 | 预期 |
|---|---|---|
| 1 | Obsidian 最小化，其他应用全屏 → 按热键 | 新便签弹出且可直接输入 |
| 2 | 便签点 pin 后切到最大化浏览器 | 便签不被遮挡 |
| 3 | 开 3 张便签（不同颜色/透明度/位置/置顶）→ 重启 Obsidian | 全部按原样恢复（位置/颜色/透明度/置顶） |
| 4 | 双显示器：便签放副屏 → 拔副屏 → 重启 | 便签 clamp 回主屏 |
| 5 | 便签内写双链、切阅读视图、切主题 | 渲染正常 |
| 6 | 与 editing-toolbar / obsidian-hider 共存 | 便签 UI 无破损（selector 冲突则修 styles.css） |
| 7 | 文件管理器里改名/删除便签文件 | 窗口与列表正确响应 |
| 8 | 同一文件"作为便签打开"两次 | 第二次置前不重开 |
| 9 | 关闭便签 → vault 中文件保留且内容已写入 | 内容在 |
| 10 | 透明度滑杆实时预览 + 落盘（重开便签透明度保留） | 生效 |

- [ ] **步骤 4：修复验收中发现的问题并 Commit**

每个问题修复后单独 commit（`fix(sticky): ...`）。

- [ ] **步骤 5：最终 Commit**

```bash
cd F:/Cache/AI && git add obsidian-quick-sticky && git commit -m "feat(sticky): 便签 chrome 隐藏样式与列表面板样式——v0.1.0 功能完备"
```

---

## 自检记录

**1. 规格覆盖度：**
- §2 架构（popout+Electron+原生 header）→ 任务 0/8/9 ✓
- §3.1 frontmatter（sticky-color/opacity）→ 任务 7（读写）+ 任务 8（applyColor 落盘）✓
- §3.2 data.json 模型 → 任务 1（loadSettings 完整字段）✓
- §3.3 边界（删/改名/移出文件夹/off-screen）→ 任务 9（onFileRenamed/onFileDeleted/clampToBounds）+ 任务 12（文件夹 ∪ windows 并集）✓
- §4.1 四种创建入口 → 任务 11（ribbon/命令/右键）+ 全局热键（registerGlobalHotkey）✓
- §4.2 热键行为 → 任务 2（accelerator）+ 任务 11（createAndOpenSticky 绑定 + 重载重注册在 bridge.registerGlobalShortcut 内防残留）✓
- §4.3 多便签+恢复 → 任务 5（决策）+ 任务 9（编排/三轮重试/收养/去重）✓
- §4.4 窗口操作五按钮 → 任务 8（injectActions：pin/取色/透明度/模式/关闭）✓
- §4.5 列表面板 → 任务 12 ✓
- §6 错误处理 → 任务 6（降级）+ 任务 11（热键失败 Notice）+ 任务 8（waitReady 轮询/close 兜底 destroy）✓
- §7.1 单测 → 任务 1-7 各 TDD 步骤（settings 合并/位置校验/命名/恢复序列/frontmatter 映射/accelerator）✓
- §7.2 手动验收 → 任务 13 表格（7 项全覆盖 + 3 项补充）✓

**2. 占位符扫描：** 无 "待定/TODO/类似任务 N"；所有代码步骤含完整代码；StickyListView 的任务 11 占位在任务 12 完整重写，属显式两段交付。

**3. 类型一致性：** `NoteBounds`/`WindowRecord`/`StickySettings`（settings.ts）→ WindowManager/StickyWindow/ElectronBridge 引用一致；`ElectronBridgeAPI`/`NativeWindow`（ElectronBridge.ts）→ StickyWindow/WindowManager/main.ts 引用一致；`STICKY_COLOR_KEY`/`STICKY_OPACITY_KEY`（NoteFileService.ts）→ StickyWindow/main.ts 引用一致；`planRestore`/`clampToBounds` 签名与任务 5/4 测试一致。
