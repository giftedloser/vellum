<p align="center">
  <img src="assets/vellum-icon-dark.png" width="112" height="112" alt="Vellum icon" />
</p>

<p align="center">
  <img src="assets/vellum-wordmark.png" width="320" alt="Vellum" />
</p>

<p align="center">A quiet desktop home for documents and persistent scratch notes.</p>

<p align="center">
  <a href="https://github.com/giftedloser/vellum/releases/latest"><strong>Download Vellum for Windows</strong></a>
</p>

Vellum opens local Markdown, HTML, and text documents in a clean, distraction-free window. It also keeps independent scratch notes ready without requiring a filename or Save dialog.

<img width="1280" height="820" alt="image" src="https://github.com/user-attachments/assets/91427ab8-06a4-4b90-9dc7-e00d64a03e9d" />


## Why Vellum

- **Read without clutter.** The interface stays out of the way until you need it.
- **Keep documents close.** Pin important files or folders and quickly return to recent items.
- **Make small edits.** Switch between the rendered document and its source without opening a full IDE.
- **Stay local.** Vellum has no account, telemetry, cloud sync, or AI service.
- **Choose your pace.** Adjust themes, reading width, text size, zoom, sidebar motion, and control visibility.

## Install

1. Download the latest installer from [GitHub Releases](https://github.com/giftedloser/vellum/releases/latest).
2. Install and open Vellum. The current installer is unsigned, so Windows may show a SmartScreen warning.
3. Choose **Open file** or **Open folder**, then pin anything you want to keep in the sidebar.

Vellum supports `.md`, `.markdown`, `.html`, `.htm`, and `.txt` files. Installing it also makes Vellum available under **Open with** and in Windows **Default apps** for those file types.

Windows protects whichever application you have already chosen for a file type, so an installer cannot take that choice over. If a type still opens elsewhere, set it once from **Open with → Choose another app**, or in **Settings → Apps → Default apps**.

## Usage

- Open one document or browse a complete folder.
- Pin files and folders without moving or changing them on disk.
- See recently used documents in activity order.
- Switch between HTML/Markdown and TXT workspaces; each keeps the same Pinned, In Progress, and Recent sidebar structure.
- Create new Markdown, HTML, or text files.
- Keep multiple scratch notes, titled from their first non-empty line and ordered by recent edits.
- Edit source with syntax highlighting, search, undo/redo, word wrap, and adjustable code fonts.
- Edit plain text with wrapping plus word and character counts.
- Save, Save As, Revert, reload externally changed files, and preview unsaved edits.
- Save an internal note as a `.txt` file without losing the original if Save As is cancelled or fails.
- Restore the last active item and recover unsaved work without overwriting saved files.
- Open a file from Explorer into the window you already have open, rather than a second copy of the application.
- Use system, light, or dark appearance.

Removing an item from Vellum only removes it from the sidebar—it never deletes the file or folder.

## Useful shortcuts

| Action | Shortcut |
| --- | --- |
| New note | `Ctrl+N` |
| Open file | `Ctrl+O` |
| Open folder | `Ctrl+Shift+O` |
| Show or hide sidebar | `Ctrl+B` |
| Switch View/Edit | `Ctrl+E` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Find and replace while editing | `Ctrl+F` or `Ctrl+H` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |
| Reload document | `Ctrl+R` |
| Close current view | `Ctrl+W` |
| Open settings | `Ctrl+,` |

On macOS, use `Cmd` instead of `Ctrl` where applicable.

## Privacy and document safety

Vellum works with local files and stores its sidebar, notes, preferences, and recovery snapshots on your device. Recovery snapshots never write to saved files. Before intentionally overwriting a file, Vellum checks whether another application changed it.

HTML documents may load their own remote images, scripts, or other resources. Vellum displays them in an isolated viewer without giving them access to the application itself.

## Help and project links

- [Download releases](https://github.com/giftedloser/vellum/releases)
- [Report a bug](https://github.com/giftedloser/vellum/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/giftedloser/vellum/issues/new?template=feature_request.yml)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

<details>
<summary><strong>Developer and technical details</strong></summary>

### Scope

Vellum is a focused document workspace with lightweight source editing—not an IDE or visual site builder. It intentionally excludes language servers, terminals, extensions, project tooling, automatic formatting, automatic source-file saving, linting pipelines, and split panes.

### Technology

- Tauri 2 native desktop shell
- React 19 with strict TypeScript
- Lazy-loaded CodeMirror 6 Markdown, HTML, and plain-text editor
- Sanitized Markdown rendering with DOMPurify
- Sandboxed, opaque-origin HTML rendering
- Least-privilege native file commands
- Windows Markdown, HTML, and text file associations, opening into a single running instance
- Bundled Inter and Style Script, so typography does not depend on system fonts

### Configuration

Vellum has no required environment variables or external services. User preferences are managed in Settings and stored locally on the device.

### Development

Requirements:

- Node.js 20.19 or newer
- Rust stable
- Platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
npm ci
npm run tauri -- dev
```

Build installers:

```bash
npm run tauri -- build
```

### Testing

```bash
npm run build
npm run test:recents
npm run test:session
npm run test:theme
npm audit --omit=dev --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

`test:recents` and `test:session` cover the sidebar history and recovery-session contracts. `test:theme` asserts that no chromatic colour has crept into the neutral theme and that the paper texture is byte-identical to the original.

GitHub Actions independently validates the frontend, Rust/Tauri core, dependency advisories, formatting, tests, and a Windows release executable. Clippy is not part of that pipeline; run it locally if you want it:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### Project structure

```text
assets/                 Brand and build-time sources, never shipped
public/                 Fonts, texture, and favicons copied into the bundle
scripts/                Icon and texture generation, plus the behaviour checks
src/                    React application, editor, and interface styles
src-tauri/              Native commands, permissions, and bundle configuration
.github/workflows/      Continuous integration
AUDIT.md                Architecture and security audit
RELEASE_AUDIT.md        Release-candidate verification record
```

### Native security boundary

- Paths are canonicalized before scanning or reading.
- Documents must be inside a file or folder explicitly added to Vellum, or supplied as a validated startup document.
- Folder traversal is cycle-aware and bounded by depth and entry-count limits.
- Documents and editor writes are limited to 32 MB.
- Writes use a temporary sibling file, synchronization, replacement, and rollback on failure.
- Markdown is sanitized before insertion.
- HTML runs in a sandbox without `allow-same-origin` and uses a no-referrer policy.
- Release builds disable WebView developer tools.

The full reviews are available in [AUDIT.md](AUDIT.md), [RENDERER_AUDIT.md](RENDERER_AUDIT.md), and [RELEASE_AUDIT.md](RELEASE_AUDIT.md).

### Branding and licenses

The canonical application icons are `assets/vellum-icon-dark.png` and `assets/vellum-icon-light.png`. These live in `assets/` rather than `public/` on purpose: `public/` is copied verbatim into the application bundle, so brand and build-time sources kept there ship to every user. Native assets are regenerated from the dark icon with `npm run icons`.

Vellum is available under the [MIT License](LICENSE). Style Script and Inter are licensed separately under the SIL Open Font License 1.1, see [OFL.txt](public/fonts/OFL.txt) and [Inter-OFL.txt](public/fonts/Inter-OFL.txt). File-type artwork is documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

</details>
