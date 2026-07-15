import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import sharp from "sharp";

const source = "public/vellum-mark.svg";
const iconDirectory = "src-tauri/icons";
const rasterSource = `${iconDirectory}/icon-source.png`;

await mkdir(iconDirectory, { recursive: true });
await sharp(source, { density: 384 })
  .resize(1024, 1024, { fit: "contain" })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(rasterSource);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npx, ["tauri", "icon", rasterSource, "--output", iconDirectory], {
  stdio: "inherit",
});

console.log(`Generated native Vellum icons in ${iconDirectory}.`);
