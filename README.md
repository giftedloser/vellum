# Vellum

Vellum is a focused desktop viewer for Markdown and HTML documents. It provides a persistent local library, recent files, nested folders, high-quality Markdown typography, and full-browser HTML rendering without AI features or visual HTML editing.

## Current scope

- Tauri 2 desktop application
- React 19 and TypeScript
- Open and save individual Markdown or HTML files
- Save nested folders in a persistent sidebar library
- Recent-document history
- Multi-document tabs
- Sandboxed HTML rendering
- Sanitized Markdown rendering
- Custom frameless title bar
- Rounded transparent desktop shell
- Light, dark, and system appearance modes
- Adjustable sidebar transparency, reading width, and text scale

## Development

Requirements:

- Node.js 20 or newer
- Rust stable toolchain
- Platform-specific Tauri prerequisites

```bash
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

## Security model

Vellum reads only `.md`, `.markdown`, `.html`, and `.htm` files through constrained Rust commands. Markdown output is sanitized before rendering. HTML is displayed in a sandboxed frame and is never modified automatically.
