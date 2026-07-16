# Vellum Release-Candidate Audit

Audit date: July 16, 2026

## Release posture

This pass treated Vellum 0.2.0 as a release candidate. It reviewed the existing viewer behavior, the new source editor, Pinned/Recent sidebar model, native read/write boundary, external-change handling, HTML and Markdown rendering, React lifecycle usage, memory pressure, accessibility, build configuration, installer registration, and Windows default-application support.

The implementation was restarted from `main` after an earlier draft replaced too much of the application shell. The accepted implementation preserves the established viewer, settings, shortcuts, startup restoration, context menu, native window controls, zoom behavior, and security configuration, then adds editing and sidebar behavior through the existing code paths.

## Added 0.2.0 scope

### Lightweight source editing

Vellum now supports optional source editing for Markdown and HTML while remaining viewer-first.

- View remains the default mode.
- CodeMirror 6 is lazy-loaded only when Edit mode is opened.
- Only the required CodeMirror state, view, command, search, language, autocomplete-pairing, Markdown, and HTML modules are included.
- Markdown and HTML receive parser-backed syntax highlighting.
- Word wrap is enabled by default.
- Search, undo/redo, tab indentation, bracket matching, and bracket/quote pairing are available.
- Editor text size and installed code-font preference are persisted.
- Editor colors react to Vellum's resolved light or dark theme.
- Editor controls use the same translucent floating-control visual language as the renderer controls.
- Window and document controls share hover/focus visibility, fade together when idle, and can be kept visible from Settings.
- No language server, formatter, linter, project model, extension system, terminal, AI service, autocomplete suggestion UI, or autosave system was added.

### Save behavior

- Save is explicit and available through the UI or `Ctrl/Cmd+S`.
- Save As is explicit and required for a new document's first write.
- Revert restores the last successfully loaded or saved content.
- Unsaved changes are protected when opening another file, closing the document, closing the native window, or unloading the WebView.
- Existing files are checked for external modification before overwrite.
- Editor writes retain the existing 32 MB document limit and supported-extension boundary.
- The native command writes and syncs a temporary sibling before replacing the destination.
- Existing destinations are moved to a temporary backup during replacement and restored if final placement fails.
- New successfully saved files are authorized and added to the sidebar only after the native write succeeds.

### Sidebar model

The sidebar now has two content sections:

- **Pinned** for manually retained files and folders.
- **Recent** for automatic activity ordering.

Files and folders coexist. Opening a file inside an added folder promotes the owning folder rather than producing a duplicate loose-file entry. Removing an item affects only Vellum's local sidebar state and never deletes the filesystem item. Recent history is capped at 30 roots.

## Preserved existing behavior

The audit specifically verified that the following systems remain represented in the clean implementation:

- optional active-document restoration;
- persistent added-root authorization and restoration;
- interface scale;
- sidebar transparency;
- sidebar motion and floating-control visibility;
- viewer zoom;
- Markdown reading width, text scale, and line spacing;
- HTML Fit-to-Width measurement;
- operating-system light/dark theme reaction;
- frameless window controls and drag region;
- linked, auto-hiding floating viewer and window controls;
- theme-aware application and iframe context menus with clipped, scrollbar-free overflow hints;
- `Ctrl/Cmd+O`, `Shift+Ctrl/Cmd+O`, `Ctrl/Cmd+B`, `Ctrl/Cmd+R`, `Ctrl/Cmd+W`, and `Ctrl/Cmd+,`;
- request-token protection against stale asynchronous document reads;
- sandboxed HTML and sanitized Markdown rendering;
- Windows startup-document handling and file associations.

New shortcuts are `Ctrl/Cmd+E` for View/Edit, `Ctrl/Cmd+S` for Save, `Shift+Ctrl/Cmd+S` for Save As, and `Ctrl/Cmd+F` inside the editor.

## Security findings

### Native boundary

The native boundary remains narrow:

- supported Markdown and HTML extensions only;
- canonical paths for existing files and parent directories;
- explicit file or directory authorization;
- regular-file checks;
- 32 MB read and write limit;
- 32-level traversal depth limit;
- 20,000-entry scan limit;
- symbolic-link cycle protection;
- no shell execution;
- no telemetry or account system.

Existing files cannot be overwritten unless they are already authorized through Vellum. New files may be created only through a supported path supplied by the save flow and become authorized after a successful write.

### HTML execution

Authored HTML remains intentionally capable of running scripts and loading remote resources. It is isolated in a sandboxed opaque-origin iframe without `allow-same-origin`, and it uses a no-referrer policy.

The application CSP is broader than a static viewer because `srcDoc` inherits the embedding document's policy. This remains the largest security tradeoff. A future release intended for routinely opening untrusted public HTML should move authored HTML into a dedicated custom protocol or isolated webview with its own policy.

### Editor rendering

CodeMirror renders source through its editor view and Lezer parser/highlighting system. Source remains text in editor state and is never converted into executable application markup. Markdown preview continues through `marked` followed by DOMPurify. HTML preview continues through the sandboxed iframe.

## React and lifecycle audit

Effects are limited to external synchronization and subscriptions:

- restoring native-authorized roots and the optional active document;
- synchronizing the native settings dialog;
- subscribing to operating-system theme changes;
- applying and persisting preferences;
- applying native WebView interface zoom;
- persisting sidebar, recent, pinned, and active-document state;
- protecting native/WebView close operations;
- subscribing to keyboard, pointer, resize, blur, and iframe message events;
- synchronizing viewer zoom into the sandboxed iframe;
- creating and cleaning up the custom scroll indicator.

The document-opening callback is stable and reads current roots and dirty state through refs. Changing sidebar contents or typing in the editor therefore cannot re-run startup restoration or reopen the active file. The restore-document preference is captured at startup, so changing it in Settings affects the next launch without rescanning roots or reopening a document in the current session.

The two optimization opportunities documented in the previous audit are now corrected:

1. Native WebView zoom is updated by an effect depending only on `interfaceScale`.
2. Application and iframe scroll-indicator layout work is requestAnimationFrame-throttled.

Keyboard handling continues to use `useEffectEvent`, preventing stale closures without repeatedly attaching the global listener. Native close protection also reads current dirty state from a ref and registers only once.

The CodeMirror component owns one editor view while mounted. Compartments reconfigure language, wrapping, theme, font, and size without destroying cursor position or undo history. External Revert or file-state updates replace the document only when the controlled value differs from editor state.

## Memory and performance review

- Only one document body and one editable draft are retained at a time.
- The CodeMirror editor chunk is code-split and not requested during normal viewing.
- Only the required CodeMirror modules are installed; no IDE package or language-server runtime is present.
- Parser-backed highlighting is incremental, and Markdown block-level presentation decorates only visible lines rather than rescanning the entire document after each keystroke.
- Editor visual settings are reconfigured through compartments instead of remounting the editor.
- Previous document and editor content becomes collectible when replaced.
- Asynchronous document opens use a monotonically increasing request token.
- Event listeners, animation frames, timers, native event subscriptions, dialogs, generated indicators, MutationObservers, and the editor view have cleanup paths.
- Recent history is capped at 30 roots.
- Directory scans remain bounded and cycle-aware.
- Markdown conversion is memoized and sanitized only when source or document type changes.
- Prepared HTML is memoized by source and resolved theme.
- The HTML iframe is keyed by document path.

The largest expected memory consumer remains the platform WebView, followed by the editor chunk only while Edit mode is used.

## UI and accessibility review

- Window controls remain inset at the top-right and share the document bar's corner geometry.
- Context menus use theme-aware surfaces and remain inside an eight-pixel viewport gutter, including at bottom-right clicks.
- The paper background is painted once at the window level, so sidebar motion reflows content without shifting the texture.
- Editor controls reuse existing control variables, borders, shadows, blur, sizing, and motion timing.
- View/Edit state is visible and exposes an unsaved indicator.
- Icon-only controls have labels or titles.
- Settings continue to use a native modal dialog with cancel/close behavior.
- CodeMirror search remains keyboard accessible and uses Vellum's floating material treatment.
- The editor host has an explicit Markdown or HTML label.
- Touch devices reveal editor controls without requiring hover.
- Reduced-motion behavior remains inherited from the existing application styles.

## CI release gates

CI validates:

- strict TypeScript and Vite production build;
- production JavaScript vulnerabilities at high severity or above;
- RustSec advisories;
- Rust formatting and unit tests;
- native icon generation;
- a Windows release executable build.

The CodeMirror dependency graph is committed in `package-lock.json`, and CI uses deterministic `npm ci` installation. Package, lockfile, native crate, and Tauri bundle versions are all 0.2.0.

## Required manual smoke test

1. Open loose Markdown and HTML files.
2. Open a folder and confirm child-file activity promotes the folder in Recent.
3. Pin and unpin files and folders.
4. Remove sidebar entries and confirm nothing is deleted from disk.
5. Enter Edit mode for Markdown and HTML.
6. Verify highlighting, wrap, search, undo/redo, tab indentation, pair insertion, font selection, and text sizing.
7. Switch light/dark/system appearance while editing and confirm cursor, selection, undo history, and scroll position remain intact.
8. Make an edit, switch to View, and confirm the unsaved preview updates.
9. Save and reload the file from another application.
10. Modify the file externally and confirm Vellum warns before overwrite.
11. Test Save As and new Markdown/HTML creation.
12. Attempt to switch files, close the document, and exit with unsaved changes.
13. Recheck all previous viewer settings, zoom controls, Fit-to-Width, theme behavior, context menus, and session restoration.
14. Build MSI and NSIS installers on Windows.
15. Confirm file associations and startup opening on a clean profile.

## Remaining release blockers outside the repository

- Windows code-signing certificate and timestamping configuration.
- Final license selection.
- Clean-machine MSI and NSIS smoke testing.
- Published checksums and release provenance.

## Conclusion

The clean 0.2.0 implementation adds the approved editing, sidebar, branding, and control-system scope without replacing the established application architecture. Repository-level security, lifecycle, memory, dependency, and UI findings are addressed in code. Installer signing and clean-machine smoke testing remain release-environment work.
