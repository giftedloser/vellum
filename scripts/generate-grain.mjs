import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const size = 1024;
const pixels = Buffer.alloc(size * size * 4);
let seed = 0x76_65_6c_6c;

function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
}

for (let index = 0; index < size * size; index += 1) {
  const offset = index * 4;
  const value = random() > .5 ? 255 : 0;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
  pixels[offset + 3] = 3 + Math.floor(random() * 12);
}

await mkdir("public/textures", { recursive: true });
await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
  .png({ compressionLevel: 9, palette: true, colours: 64 })
  .toFile("public/textures/grain.png");
