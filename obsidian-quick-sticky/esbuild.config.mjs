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
