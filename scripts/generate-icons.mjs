import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import sharp from "sharp";

const source = "assets/vellum-icon-dark.png";
const iconDirectory = "src-tauri/icons";
const rasterSource = `${iconDirectory}/icon-source.png`;

await mkdir(iconDirectory, { recursive: true });
await sharp(source)
  .resize(896, 896, { fit: "contain" })
  .extend({ top: 64, right: 64, bottom: 64, left: 64, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(rasterSource);

const require = createRequire(import.meta.url);
const tauriCli = require.resolve("@tauri-apps/cli/tauri.js");
execFileSync(process.execPath, [tauriCli, "icon", rasterSource, "--output", iconDirectory], {
  stdio: "inherit",
});

console.log(`Generated native Vellum icons in ${iconDirectory}.`);
