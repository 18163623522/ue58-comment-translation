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
  const w = globalThis as { require?: NodeRequire; window?: { require?: NodeRequire } };
  const req = w.require ?? w.window?.require;
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

function loadRemote(injectedRemote: RemoteLike | undefined, requireRemote: RequireFn): RemoteLike | null {
  if (injectedRemote !== undefined) return asRemote(injectedRemote);
  try {
    return asRemote(requireRemote());
  } catch {
    return null; // require 函数本身抛错（无 Electron/沙箱）→ 降级
  }
}

export function createElectronBridge(
  injectedRemote?: RemoteLike,
  requireRemote: RequireFn = defaultRequireRemote,
): ElectronBridgeAPI {
  const remote = loadRemote(injectedRemote, requireRemote);
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
