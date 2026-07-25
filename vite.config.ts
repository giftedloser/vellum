import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: runtime.process?.env?.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    // The editor chunk is CodeMirror plus its Markdown and HTML parsers, which
    // are all needed the moment the editor opens, so splitting it would
    // fragment one local load rather than shrink anything. It is already
    // lazy-loaded and costs nothing at launch; this only silences the warning.
    chunkSizeWarningLimit: 600,
  },
});
