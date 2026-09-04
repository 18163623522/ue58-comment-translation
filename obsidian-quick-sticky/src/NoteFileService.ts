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

// —— 依赖 obsidian 的部分 ——

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
    create(path: string, content: string): Promise<{ path: string }>;
  };
  fileManager: {
    processFrontMatter(
      file: { path: string },
      fn: (frontmatter: Record<string, unknown>) => void,
    ): Promise<void>;
    renameFile(file: { path: string }, newPath: string): Promise<unknown>;
  };
  metadataCache: {
    getFileCache(file: { path: string }): { frontmatter?: Record<string, unknown> } | null;
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

  async createNote(folder: string, baseName: string): Promise<{ path: string }> {
    const normalized = folder.trim().replace(/^\/+|\/+$/g, "");
    if (normalized && !this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
    const path = await this.uniquePath(normalized, baseName);
    return this.app.vault.create(path, "");
  }

  async readStickyProps(file: { path: string }): Promise<Partial<StickyProps>> {
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

  async writeStickyProps(file: { path: string }, props: StickyProps): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[STICKY_COLOR_KEY] = props.color;
      fm[STICKY_OPACITY_KEY] = props.opacity;
    });
  }

  /** 移动便签到指定文件夹（不存在则创建；目标同名自动避让；同文件夹 no-op）。返回最终路径。 */
  async moveNote(file: { path: string; basename: string }, folder: string): Promise<string> {
    const normalized = folder.trim().replace(/^\/+|\/+$/g, "");
    if (normalized && !this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
    const currentDir = file.path.includes("/")
      ? file.path.slice(0, file.path.lastIndexOf("/"))
      : "";
    if (currentDir === normalized) return file.path; // 已在目标文件夹
    const target = await this.uniquePath(normalized, file.basename);
    await this.app.fileManager.renameFile(file, target);
    return target;
  }
}
