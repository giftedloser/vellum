<p align="center">
  <img src="public/vellum-mark.svg" width="128" height="128" alt="Vellum logo" />
</p>

<h1 align="center">Vellum</h1>

<p align="center">A focused desktop viewer for Markdown and HTML files.</p>

Vellum provides a persistent local library, carefully typeset Markdown, and full-surface HTML rendering in a compact Tauri application. It does not include AI features, content generation, telemetry, cloud synchronization, or visual HTML editing.

The repository audit is documented in [`AUDIT.md`](AUDIT.md). The release-candidate pass is documented in [`RELEASE_AUDIT.md`](RELEASE_AUDIT.md).

## Design principles

Vellum is intentionally restrained.

- The document remains the visual priority.
- Application chrome stays quiet, translucent, and collapsible.
- HTML owns the complete browser surface without an artificial frame.
- Markdown uses a measured reading width and deliberate typographic hierarchy.
- Light and dark themes are designed independently rather than mechanically inverted.
- Floating window and viewer controls remain hidden until their enlarged hover zones are entered or keyboard focus reaches them.
- Accessibility, keyboard flow, reduced-motion support, and visible focus states are treated as core behavior.

## Brand system

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
- Restore the most recently opened document optionally
- Collapsible translucent sidebar with persistent state
- Custom frameless title bar and native window controls
- System, light, and dark appearance modes with live OS-theme updates
- Adjustable interface scale, viewer zoom, Markdown reading width, text scale, and line height
- Sanitized Markdown rendering
- Sandboxed HTML rendering in an opaque origin
- Edge-to-edge HTML browser view
- Keyboard shortcuts for common actions
- Reduced-motion support
- Explicit least-privilege Tauri capability
- Frontend, Rust/Tauri, and Windows release CI validation
- Windows file-association registration for Markdown and HTML
- Unified application, favicon, taskbar, dock, installer, and bundle icon source

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
| Reload document | `Ctrl+R` | `Cmd+R` |
| Close active document | `Ctrl+W` | `Cmd+W` |
| Open settings | `Ctrl+,` | `Cmd+,` |
| Close settings or menus | `Escape` | `Escape` |

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

### Validate locally

```bash
npm run build
npm run icons
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

GitHub Actions validates the frontend, Rust/Tauri core, and a Windows release executable for pushes to `main` and pull requests.

## Project structure

```text
public/
  vellum-mark.svg       Canonical vector identity and browser favicon
scripts/
  generate-icons.mjs    Reproducible native icon generation
src/
  App.tsx               Application state, persistence, shortcuts, settings, and renderers
  startup.ts            Native startup-file handoff for Windows associations
  styles.css            Base themes and component styles
  refinement.css        Typography, spacing, material, and renderer hierarchy
  final.css             Accessibility, interaction details, branding, and grain isolation
  control-system.css    Shared hidden-on-hover floating-control treatment
src-tauri/
  capabilities/         Least-privilege desktop permissions
  icons/                Generated Windows, macOS, and Linux application icons
  src/lib.rs            Authorized and bounded local filesystem commands
  tauri.conf.json       Desktop window, security, bundle, icon, and file-association configuration
.github/workflows/
  validate.yml          Frontend, Rust/Tauri, and Windows release validation
AUDIT.md                Architecture and security audit
RELEASE_AUDIT.md        Release-candidate security and optimization pass
```

## Security model

Vellum reads supported Markdown and HTML files through constrained Rust commands.

- Paths are canonicalized before scanning or reading.
- A document must be inside a file or folder explicitly added to the active Vellum library, or supplied as a validated operating-system startup document.
- Folder traversal is cycle-aware and bounded by depth and entry-count limits.
- Individual documents are limited to 32 MB.
- Markdown output is sanitized with DOMPurify before insertion.
- HTML runs in a sandboxed opaque-origin frame without `allow-same-origin`.
- HTML requests use a no-referrer policy.
- The main Tauri window receives only core defaults and open-dialog permission.
- Release builds disable WebView developer tools explicitly.
- Vellum does not modify source files automatically.
- No telemetry, account system, AI service, or remote content-generation service is included.
- Library, active-document, sidebar, and preference state are stored locally.

HTML files may contain scripts and remote resources. They run within the configured sandbox and content-security constraints; Vellum does not grant them access to the application origin.

## Release optimization

The Rust release profile uses whole-program link-time optimization, one code-generation unit, size-oriented optimization, stripped symbols, and abort-on-panic behavior. CI includes a native Windows release build to detect packaging and association regressions before release.

## Remaining release work

- Select and add a license before public distribution
- Sign Windows installers and publish checksums
- Smoke-test MSI and NSIS installation, upgrade, uninstall, and file-association behavior
- Test complex third-party HTML and relative local assets
- Add file watching and debounced reload
- Add release provenance when distribution begins

## License

No license has been selected yet.
