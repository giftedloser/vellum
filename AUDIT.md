# Vellum Repository Audit

Audit date: July 15, 2026

## Scope

This audit reviewed the React and TypeScript application, Tauri command boundary, Rust filesystem handling, HTML and Markdown rendering, persistence, accessibility, native icon pipeline, CI configuration, repository documentation, and release readiness.

## Result

The repository has a coherent architecture and a deliberately narrow product scope. The primary risks found during the audit were corrected directly on `main`.

## Build readiness verification

- Fixed the Windows icon generator to invoke the installed Tauri CLI through Node instead of spawning `npx.cmd`.
- Added the Rust dependency lockfile and switched CI installs to `npm ci`.
- Verified the production frontend build and the Rust test suite.
- Launched the native Windows development executable through `npm run tauri -- dev`.
- Built the release executable plus MSI and NSIS installers through `npm run tauri -- build`.
- Raised the React Doctor result from 62 to 86 by correcting state purity, dialog semantics, storage versioning, control labels, and button behavior.

## Corrected findings

### High — HTML sandbox isolation

The HTML renderer previously combined `allow-scripts` and `allow-same-origin` on a `srcDoc` frame. That combination weakens sandbox isolation.

Resolution:

- Removed `allow-same-origin`.
- Added `referrerPolicy="no-referrer"`.
- Retained scripts, forms, modals, and popups within the sandboxed opaque origin.

### High — unrestricted command path input

The Rust read command previously accepted any local path with a supported extension.

Resolution:

- Canonicalize selected and requested paths.
- Authorize reads only beneath roots explicitly added through Vellum.
- Require regular files with supported extensions.
- Reject documents larger than 32 MB.

### Medium — recursive filesystem traversal

Folder scanning could follow recursive symbolic links or traverse pathological directory trees.

Resolution:

- Track canonical paths already visited.
- Limit traversal depth to 32 levels.
- Limit a scan to 20,000 entries.
- Skip inaccessible and recursive children safely.

### Medium — implicit Tauri permissions

The project did not contain an explicit desktop capability file and included an unused filesystem plugin.

Resolution:

- Added a least-privilege capability for the main window.
- Allowed only core defaults and the open dialog.
- Removed the filesystem plugin from Rust and JavaScript dependencies.

### Medium — session restoration race

Saved tabs could begin opening before saved library roots had been scanned and authorized.

Resolution:

- Restore and authorize library roots first.
- Restore tabs sequentially afterward.
- Preserve the previously active tab only after restoration completes.

### Medium — tab control semantics

The tab close action was embedded inside the tab selection button.

Resolution:

- Separated tab selection and close into independent keyboard-accessible controls.
- Preserved the existing compact visual treatment.

### Low — validation coverage

CI previously checked only TypeScript and Vite.

Resolution:

- Added Rust formatting validation.
- Added a Tauri-aware `cargo test` job with Linux desktop dependencies.
- Generate native icon assets before the Tauri check.

### Low — dependency surface

Unused Rust and JavaScript dependencies were present.

Resolution:

- Removed `serde_json`.
- Removed `@tauri-apps/plugin-fs` and `tauri-plugin-fs`.

## Verified design qualities

- Clear document-first hierarchy.
- Independent light and dark palettes.
- Grain isolated to application chrome.
- Reduced-motion support and visible keyboard focus.
- Sanitized Markdown insertion.
- Persistent library, recent history, preferences, sidebar state, and optional tabs.
- Canonical dark and light PNG brand sources used by the README, theme-aware favicons, and generated native icon pipeline.
- Edge-to-edge HTML canvas with hidden application controls.

## Remaining validation

The following require an actual desktop runtime or release environment and were not claimed as verified by this repository-only audit:

- Pixel-level behavior on Windows, macOS, and Linux.
- Native taskbar, dock, installer, and tray icon appearance at every system size.
- Window transparency and rounded-corner behavior across compositors.
- Keyboard focus traversal inside a running WebView.
- Rendering behavior for complex third-party HTML.
- Signed installers and platform notarization.

## Remaining engineering priorities

1. Resolve relative HTML assets through a controlled local asset strategy.
2. Add file watching with debounced reload and clear stale-file handling.
3. Select and add a license before public distribution.
4. Run native build and smoke-test matrices on Windows, macOS, and Linux.
5. Add release signing, checksums, and provenance when packaging begins.

## Audit posture

No telemetry, account system, cloud synchronization, AI service, or automatic source-file modification is present. Vellum remains a local document viewer and organizer with a constrained native boundary.
