<p align="center">
  <img src="public/vellum-mark.svg" width="128" height="128" alt="Vellum logo" />
</p>

<h1 align="center">Vellum</h1>

<p align="center">A focused desktop viewer for Markdown and HTML files.</p>

Vellum provides a persistent local library, recent files, nested folders, carefully typeset Markdown, and full-surface HTML rendering in a compact Tauri application. It does not include AI features, content generation, telemetry, or visual HTML editing.

The current repository audit is documented in [`AUDIT.md`](AUDIT.md).

## Design principles

Vellum is intentionally restrained.

- The document remains the visual priority.
- Application chrome stays quiet, translucent, and collapsible.
- HTML owns the complete browser surface without an artificial frame.
- Markdown uses a measured reading width and deliberate typographic hierarchy.
- Light and dark themes are designed independently rather than mechanically inverted.
- Motion, hover states, borders, material grain, and shadows are subtle and functional.
- Grain is applied only to application chrome and never over rendered content.
- The interface uses a single consistent icon language through Lucide.
- Accessibility, keyboard flow, reduced-motion support, and visible focus states are treated as core behavior.

## Brand system

The Vellum mark combines a folded page, a quill, and a restrained open circle. The same source asset is used for the title bar, welcome state, browser favicon, repository identity, Windows executable and taskbar icon, macOS application icon, Linux bundle icon, and future tray surfaces.

The canonical source is `public/vellum-mark.svg`. Native assets are generated rather than edited separately, preventing platform icons from drifting away from the application identity.

```bash
npm run icons
```

The normal Tauri command runs icon generation automatically before launch or packaging:

```bash
npm run tauri -- dev
npm run tauri -- build
```

## Current capabilities

- Tauri 2 desktop shell
- React 19 and strict TypeScript
- Open `.md`, `.markdown`, `.html`, and `.htm` files
- Save individual files or nested folders in a persistent library
- Recent-document history
- Multi-document tabs with optional session restoration
- Collapsible translucent sidebar with persistent state
- Custom frameless title bar and native window controls
- Rounded transparent application shell
- System, light, and dark appearance modes with live OS-theme updates
- Adjustable sidebar transparency
- Adjustable Markdown reading width and text scale
- Sanitized Markdown rendering
- Sandboxed HTML rendering in an opaque origin
- Edge-to-edge HTML browser view
- Keyboard shortcuts for common actions
- Reduced-motion support
- Explicit least-privilege Tauri capability
- Frontend and Rust/Tauri CI validation
- Unified application, favicon, taskbar, dock, installer, and bundle icon source

## Interface structure

The application is divided into three layers:

1. **Library** — saved files, folders, and recent documents.
2. **Document controls** — tabs, reload, appearance, settings, and sidebar visibility.
3. **Renderer** — either a typeset Markdown document or a full HTML browser surface.

The renderer always has visual priority. In HTML mode, the document occupies the complete available canvas and controls remain hidden until the toolbar region is hovered or focused.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Open file | `Ctrl+O` | `Cmd+O` |
| Open folder | `Ctrl+Shift+O` | `Cmd+Shift+O` |
| Toggle sidebar | `Ctrl+B` | `Cmd+B` |
| Reload document | `Ctrl+R` | `Cmd+R` |
| Close active tab | `Ctrl+W` | `Cmd+W` |
| Open settings | `Ctrl+,` | `Cmd+,` |
| Close settings | `Escape` | `Escape` |

## Development

### Requirements

- Node.js 20.19 or newer
- Rust stable toolchain
- Platform-specific Tauri prerequisites

### Run locally

```bash
npm ci
npm run tauri -- dev
```

### Build

```bash
npm run tauri -- build
```

### Web-only interface development

```bash
npm run dev
```

### Validate locally

Frontend:

```bash
npm run build
```

Rust/Tauri core after generating icons:

```bash
npm run icons
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

GitHub Actions runs both validation paths for pushes to `main` and for pull requests.

## Project structure

```text
public/
  vellum-mark.svg       Canonical vector identity and browser favicon
scripts/
  generate-icons.mjs    Reproducible native icon generation
src/
  App.tsx               Application state, persistence, shortcuts, settings, and renderers
  styles.css            Base themes and component styles
  refinement.css        Typography, spacing, material, and renderer hierarchy
  final.css             Accessibility, interaction details, branding, and grain isolation
src-tauri/
  capabilities/         Least-privilege desktop permissions
  icons/                Generated Windows, macOS, and Linux application icons
  src/lib.rs            Authorized and bounded local filesystem commands
  tauri.conf.json       Desktop window, security, bundle, and icon configuration
.github/workflows/
  validate.yml          Frontend and Rust/Tauri validation
AUDIT.md                Security, architecture, accessibility, and release audit
```

## Security model

Vellum reads supported Markdown and HTML files through constrained Rust commands.

- Paths are canonicalized before scanning or reading.
- A document must be inside a file or folder explicitly added to the active Vellum library.
- Folder traversal is cycle-aware and bounded by depth and entry-count limits.
- Individual documents are limited to 32 MB.
- Markdown output is sanitized with DOMPurify before insertion.
- HTML runs in a sandboxed opaque-origin frame without `allow-same-origin`.
- HTML requests use a no-referrer policy.
- The main Tauri window receives only core defaults and open-dialog permission.
- Vellum does not modify source files automatically.
- No AI service, telemetry service, remote content-generation service, or account system is included.
- Library, recent-history, tab, and preference state are stored locally.

HTML files may contain scripts and remote resources. They run within the configured sandbox and content-security constraints; Vellum does not grant them access to the application origin.

## Scope boundaries

Not currently in scope:

- Visual HTML editing
- WYSIWYG layout controls
- AI-assisted writing or coding
- Cloud synchronization
- Collaborative editing
- Project build tooling for opened HTML projects

These boundaries keep Vellum fast, understandable, and focused on viewing and organizing documents.

## Next engineering priorities

- File watching and automatic reload
- Correct resolution of relative HTML assets
- Release signing, checksums, and provenance
- Native smoke tests on Windows, macOS, and Linux
- Optional system-tray behavior using the existing Vellum native icon set

## License

No license has been selected yet.
