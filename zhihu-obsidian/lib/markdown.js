// 把结构化 blocks 渲染为 Obsidian 风格 Markdown。纯函数，无副作用。

// YAML 字符串安全包裹：双引号 + 转义内部双引号与反斜杠。
export function yamlString(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function renderBlock(b) {
  switch (b.type) {
    case "paragraph":
      return b.text;
    case "heading":
      return "#".repeat(b.level) + " " + b.text;
    case "quote":
      return b.lines.map((l) => "> " + l).join("\n");
    case "code":
      return "```" + (b.lang || "") + "\n" + b.code + "\n```";
    case "list":
      return b.items
        .map((it, i) => (b.ordered ? `${i + 1}. ` : "- ") + it)
        .join("\n");
    case "image":
      return b.file ? `![[${b.file}]]` : (b.src ? `![](${b.src})` : "");
    case "video":
      if (b.file) return `![[${b.file}]]`;
      if (b.posterFile) {
        return [`![[${b.posterFile}]]`, `[观看原视频](${b.src})`].join("\n");
      }
      return `[观看原视频](${b.src})`;
    case "hr":
      return "---";
    default:
      return "";
  }
}

export function buildMarkdown({ title, author, url, savedAt, blocks }) {
  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `author: ${yamlString(author)}`,
    `source: ${yamlString(url)}`,
    `saved: ${yamlString(savedAt)}`,
    "---",
    "",
  ].join("\n");

  const body = blocks.map(renderBlock).filter((s) => s !== "").join("\n\n");
  return frontmatter + "\n" + (body ? body + "\n" : "");
}
