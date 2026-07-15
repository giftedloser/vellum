# Vellum

Vellum is a focused desktop viewer for Markdown and HTML files.

It provides a persistent local library, recent files, nested folders, polished Markdown typography, and full-surface HTML rendering in a compact Tauri desktop application. It does not include AI features, content generation, or visual HTML editing.

## Design principles

Vellum is intentionally restrained.

- The document remains the visual priority.
- Application chrome stays quiet and collapsible.
- HTML uses the full browser surface without an artificial frame.
- Markdown uses a measured reading width and a clear typographic hierarchy.
- Light and dark themes are designed independently rather than mechanically inverted.
- Motion, hover states, borders, grain, and shadows are subtle and functional.
- The interface uses one consistent icon language through Lucide.

## Current capabilities

- Tauri 2 desktop shell
- React 19 and TypeScript
- Open individual `.md`, `.markdown`, `.html`, and `.htm` files
- Save individual files or nested folders in a persistent library
- Recent-document history
- Multi-document tabs
- Collapsible translucent sidebar
- Custom frameless title bar and native window controls
- Rounded transparent application shell
- System, light, and dark appearance modes
- Adjustable sidebar transparency
- Adjustable Markdown reading width and text scale
- Sanitized Markdown rendering
- Sandboxed HTML rendering
- Edge-to-edge HTML browser view

## Interface structure

The application is divided into three layers:

1. **Library** — saved files, folders, and recent documents.
2. **Document controls** — tabs, reload, appearance, settings, and sidebar visibility.
3. **Renderer** — either a typeset Markdown document or a full HTML browser surface.

The renderer always has visual priority. In HTML mode, the toolbar becomes a low-visibility overlay and the page occupies the complete available canvas.

## Development

### Requirements

- Node.js 20 or newer
- Rust stable toolchain
- Platform-specific Tauri prerequisites

### Run locally

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

### Web-only UI development

```bash
npm run dev
```

## Project structure

```text
src/
  App.tsx          Application state, library, tabs, settings, and renderers
  styles.css       Base theme and component styles
  refinement.css   Typography, spacing, interaction, grain, and HTML canvas polish
src-tauri/
  src/lib.rs       Constrained local filesystem commands
  tauri.conf.json  Desktop window, security, and bundle configuration
```

## Security model

Vellum reads only supported Markdown and HTML extensions through constrained Rust commands.

- Markdown output is sanitized with DOMPurify before insertion.
- HTML is rendered in a sandboxed frame.
- Vellum does not modify source files automatically.
- No AI service, telemetry service, remote content-generation service, or account system is included.
- Local library and preference state are stored locally.

HTML files may contain their own scripts and remote resources. They are rendered as authored inside the sandbox constraints configured by Vellum.

## Scope boundaries

Not currently in scope:

- Visual HTML editing
- WYSIWYG layout controls
- AI-assisted writing or coding
- Cloud synchronization
- Collaborative editing
- Project build tooling

These boundaries keep Vellum fast, understandable, and focused on viewing and organizing documents.

## Near-term work

- File watching and automatic reload
- Better handling of relative HTML assets
- Keyboard shortcuts and command navigation
- Session restoration for open tabs
- Application icons and release packaging
- Automated build validation

## License

No license has been selected yet.
