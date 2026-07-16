<p align="center">
  <img src="public/vellum-icon-dark.png" width="128" height="128" alt="Vellum logo" />
</p>

<h1 align="center">Vellum</h1>

<p align="center">A focused desktop viewer and lightweight source editor for Markdown and HTML files.</p>

Vellum provides a recent-first local sidebar, carefully typeset Markdown, full-surface HTML rendering, and just enough source editing to correct the document already being viewed. It does not include AI features, content generation, telemetry, cloud synchronization, visual HTML editing, extensions, language servers, terminals, or project tooling.

The repository audit is documented in [`AUDIT.md`](AUDIT.md). The release-candidate pass is documented in [`RELEASE_AUDIT.md`](RELEASE_AUDIT.md).

Download the current Windows installers from [GitHub Releases](https://github.com/giftedloser/vellum/releases/latest).

## Design principles

Vellum is intentionally restrained.

- The document remains the visual priority.
- Viewing is the default; editing is an optional mode for small source corrections.
- Application chrome stays quiet, translucent, and collapsible.
- HTML owns the complete browser surface without an artificial frame.
- Markdown uses a measured reading width and deliberate typographic hierarchy.
- Light and dark themes are designed independently rather than mechanically inverted.
- Floating window, viewer, and editor controls use the same restrained visual system.
- Accessibility, keyboard flow, reduced-motion support, and visible focus states are treated as core behavior.
- New files are supported without introducing projects, workspaces, templates, or an IDE workflow.

## Brand system

The canonical sources are `public/vellum-icon-dark.png` and `public/vellum-icon-light.png`. The browser selects a matching theme favicon, while native application and installer assets are generated from the dark icon so platform assets stay consistent.

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
- Render sanitized Markdown and sandboxed HTML
- Optional View/Edit source mode for the active document
- Lazy CodeMirror 6 editor with parser-backed Markdown and HTML highlighting
- Word wrap enabled by default
- Search, undo/redo, tab indentation, bracket matching, and bracket/quote pairing
- Explicit Save, Save As, and Revert actions
- External-file-change detection before overwriting
- Unsaved-change protection when switching, closing, or exiting
- New Markdown and HTML documents with Save As on first write
- Editor text-size and installed code-font controls
- Pinned and Recent sidebar sections
- Files and folders sorted by recent activity
- Opening a file inside an added folder promotes the folder rather than creating a duplicate loose-file entry
- Remove-from-sidebar behavior that never deletes files from disk
- Restore the most recently opened document optionally
- Collapsible translucent sidebar with persistent state
- Quick, balanced, and relaxed sidebar-motion settings
- Custom frameless title bar and native window controls
- System, light, and dark appearance modes with live OS-theme updates
- Optional auto-hide for the linked window and document control surfaces
- Adjustable interface scale, viewer zoom, Markdown reading width, text scale, and line height
- Keyboard shortcuts for common actions
- Reduced-motion support
- Explicit least-privilege Tauri capability
- Frontend, Rust/Tauri, dependency, and Windows release CI validation
- Windows file-association registration for Markdown and HTML
- Unified application, favicon, taskbar, dock, installer, and bundle icon source

## Editor scope

The editor is intentionally not an IDE.

Included:

- Markdown and HTML source editing
- Parser-backed syntax highlighting
- Word wrap
- Search
- Undo and redo
- Tab indentation
- Bracket matching and bracket/quote pairing
- Save, Save As, and Revert
- Theme-reactive colors
- Adjustable source text size and font

Excluded:

- WYSIWYG or rich-text editing
- Language servers
- build tools or preview servers
- extensions or plugins
- terminals
- AI features
- autocomplete suggestion UI
- automatic formatting
- autosave
- linting pipelines
- split panes
- project or workspace creation

## Sidebar behavior

The sidebar has two content sections:

- **Pinned** keeps manually retained files and folders fixed at the top.
- **Recent** automatically sorts added files and folders by latest activity.

Files and folders coexist. Opening a child document inside an added folder promotes that folder in Recent. Removing an item only removes it from Vellum's sidebar; it never deletes or changes the filesystem item.

## Windows default application support

The Windows installer registers Vellum as a viewer for:

- `.md`
- `.markdown`
- `.html`
- `.htm`

Explorer passes the selected path to Vellum, and the native startup boundary validates, authorizes, and opens it through the same constrained document pipeline used by the in-app file picker.

Windows does not permit an installer to silently take over a user's defaults. After installing Vellum, select it through **Settings → Apps → Default apps**, or use **Open with → Choose another app → Vellum** and enable the always-use option.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Open file | `Ctrl+O` | `Cmd+O` |
| Open folder | `Ctrl+Shift+O` | `Cmd+Shift+O` |
| Toggle sidebar | `Ctrl+B` | `Cmd+B` |
| Toggle View/Edit | `Ctrl+E` | `Cmd+E` |
| Save | `Ctrl+S` | `Cmd+S` |
| Save As | `Ctrl+Shift+S` | `Cmd+Shift+S` |
| Find in editor | `Ctrl+F` | `Cmd+F` |
| Reload document | `Ctrl+R` | `Cmd+R` |
| Close active document | `Ctrl+W` | `Cmd+W` |
| Open settings | `Ctrl+,` | `Cmd+,` |
| Close settings, menus, or editor search | `Escape` | `Escape` |

## Configuration

Vellum has no required environment variables or external services. Appearance, reading, editor, sidebar-motion, control-visibility, and session-restoration preferences are managed in Settings and stored locally on the device.

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

### Build installers

```bash
npm run tauri -- build
```

### Testing and validation

```bash
npm run build
npm run icons
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

GitHub Actions validates the frontend, dependency advisories, Rust/Tauri core, and a Windows release executable for pushes to `main` and pull requests.

## Project structure

```text
public/
  vellum-icon-*.png     Canonical dark and light application identities
  favicon-*.png         Optimized theme-aware browser favicons
  fonts/                Bundled Style Script application-title font
scripts/
  generate-icons.mjs    Reproducible native icon generation
src/
  App.tsx               Existing application shell plus editor/sidebar integration
  SourceEditor.tsx      Lazy CodeMirror Markdown and HTML source editor
  editor.css            Editor, mode-toggle, and recent-sidebar styling
  startup.ts            Native startup-file handoff for Windows associations
  styles.css            Base themes and component styles
  refinement.css        Typography, spacing, material, and renderer hierarchy
  final.css             Accessibility, interaction details, branding, and grain isolation
  control-system.css    Shared floating-control treatment
src-tauri/
  capabilities/         Least-privilege desktop permissions
  icons/                Generated Windows, macOS, and Linux application icons
  src/lib.rs            Authorized, bounded reads and protected document writes
  tauri.conf.json       Desktop window, security, bundle, icon, and file-association configuration
.github/workflows/
  validate.yml          Frontend, dependency, Rust/Tauri, and Windows release validation
AUDIT.md                Architecture and security audit
RELEASE_AUDIT.md        Release-candidate security and optimization pass
```

## Security model

Vellum reads and writes supported Markdown and HTML files through constrained Rust commands.

- Paths are canonicalized before scanning or reading.
- A document must be inside a file or folder explicitly added to Vellum, or supplied as a validated operating-system startup document.
- Folder traversal is cycle-aware and bounded by depth and entry-count limits.
- Individual documents and editor writes are limited to 32 MB.
- Existing files may only be overwritten when already authorized through Vellum's document boundary.
- Save operations write and sync a temporary sibling file before replacing the destination, with rollback when replacement fails.
- The application checks modification timestamps before overwriting an open document changed externally.
- Markdown output is sanitized with DOMPurify before insertion.
- HTML runs in a sandboxed opaque-origin frame without `allow-same-origin`.
- HTML requests use a no-referrer policy.
- The main Tauri window receives only the required core, open-dialog, and save-dialog permissions.
- Release builds disable WebView developer tools explicitly.
- Vellum never autosaves or silently modifies source files.
- No telemetry, account system, AI service, or remote content-generation service is included.
- Sidebar, active-document, and preference state are stored locally.

HTML files may contain scripts and remote resources. They run within the configured sandbox and content-security constraints; Vellum does not grant them access to the application origin.

## Release optimization

The CodeMirror editor and language modules are lazy-loaded only when Edit mode is first opened. Normal viewer startup does not request or instantiate the editor chunk. CodeMirror compartments update wrapping, language, theme, font, and size without remounting the editor, and Markdown block decoration is limited to visible lines. Scroll-indicator geometry work is requestAnimationFrame-throttled, native interface zoom is updated only when interface scale changes, directory scans are bounded, and the Rust release profile uses whole-program link-time optimization, one code-generation unit, size-oriented optimization, stripped symbols, and abort-on-panic behavior.

## Distribution notes

- Windows MSI and NSIS installers are published with SHA-256 checksums on GitHub Releases.
- The current installers are unsigned, so Windows may show a SmartScreen warning.
- HTML compatibility depends on the document's own remote resources and browser assumptions.

## License

Vellum is available under the [MIT License](LICENSE).

The bundled Style Script font is licensed separately under the SIL Open Font License 1.1; see [`public/fonts/OFL.txt`](public/fonts/OFL.txt).
