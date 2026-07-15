# Vellum Release-Candidate Audit

Audit date: July 15, 2026

## Release posture

This pass treated the repository as if a Windows release were scheduled for the next day. It reviewed the native command boundary, filesystem authorization, HTML and Markdown rendering, React lifecycle usage, startup behavior, dependency exposure, memory pressure, build configuration, installer registration, and Windows default-application support.

## Corrected release blockers

### Windows file associations

The installer now registers Vellum as a viewer for `.md`, `.markdown`, `.html`, and `.htm` files. Each association is represented as an individual schema-valid Tauri entry.

Explorer startup paths are processed natively before React mounts:

- only supported extensions are accepted;
- paths are canonicalized;
- regular files are required;
- the selected file is authorized through the same native boundary as picker-selected files;
- startup files open without being permanently added to the pinned library.

Windows still requires the user to choose Vellum in Default Apps or through Open With. The installer intentionally does not attempt to override user defaults silently.

### Release configuration

- WebView developer tools are disabled explicitly.
- Browser extensions, browser zoom hotkeys, and general autofill are disabled.
- JavaScript prototypes are frozen by Tauri before application code runs.
- Unused plugin commands are stripped during release builds.
- Bundle metadata now identifies Vellum as a utility and includes release descriptions.

### Native optimization

The Rust release profile now uses:

- whole-program link-time optimization;
- one code-generation unit;
- size-oriented optimization;
- stripped symbols;
- abort-on-panic behavior.

The native filesystem scanner also uses cached sort keys rather than repeatedly lowercasing names during comparisons.

### CI release gates

CI now validates:

- strict TypeScript and Vite production build;
- production JavaScript dependency vulnerabilities at high severity or above;
- RustSec advisories;
- Rust formatting and unit tests;
- native icon generation;
- a Windows release executable build.

## Security findings

### Native boundary

The native boundary remains narrow and appropriate for a local viewer:

- supported extensions only;
- canonical paths;
- explicit file or directory authorization;
- regular-file checks;
- 32 MB per-document limit;
- 32-level traversal depth limit;
- 20,000-entry scan limit;
- symbolic-link cycle protection;
- no source-file writes;
- no shell execution;
- no telemetry or account system.

### HTML execution

Authored HTML remains intentionally capable of running scripts and loading remote resources. It is isolated in a sandboxed opaque-origin iframe without `allow-same-origin`, and it uses a no-referrer policy.

The application CSP is necessarily broader than a static document viewer because `srcDoc` inherits the embedding document's policy. This is the largest remaining security tradeoff. The current boundary is acceptable for a personal local viewer because the iframe cannot access the Vellum origin, but a future release intended for untrusted public documents should move authored HTML into a dedicated custom protocol or isolated webview with its own policy.

## React useEffect audit

Every effect in `App.tsx` was classified by purpose.

Appropriate effects:

- restoring native-authorized library state on startup;
- synchronizing the native dialog element;
- subscribing to operating-system theme changes;
- persisting user-controlled state to local storage;
- subscribing to window keyboard, pointer, resize, blur, and iframe message events;
- synchronizing viewer zoom into the sandboxed iframe;
- creating and cleaning up the custom scroll indicator.

No effect is used to derive render-only values that could simply be calculated during render. The document renderers remain memoized computations, and keyboard handling correctly uses `useEffectEvent` to avoid stale closures without repeatedly registering listeners.

Two non-blocking optimization opportunities remain:

1. The preference synchronization effect currently reapplies native WebView zoom whenever any preference changes. It is correct but could be split so the native call depends only on `interfaceScale`.
2. The custom application scroll indicator performs geometry reads on each scroll event. It is cleaned up correctly and does not leak, but a requestAnimationFrame throttle would reduce layout work during sustained scrolling.

These are polish items rather than release blockers. They do not create subscription leaks, stale state, repeated mounting, or unbounded memory growth.

## Memory and performance review

- Only one document body is retained at a time.
- Previous document content becomes collectible when a new document replaces it.
- Asynchronous document opens use a monotonically increasing request token so stale reads cannot replace newer content.
- Event listeners, timers, dialogs, and dynamically created indicator elements have cleanup paths.
- Directory scans are bounded and cycle-aware.
- Markdown conversion is memoized and sanitized only when the active document changes.
- Prepared HTML is memoized by document and resolved theme.
- The HTML iframe is keyed by document path, ensuring document-level state is discarded when switching files.

The largest expected memory consumer remains the platform WebView itself, not the React or Rust application state.

## Required Windows smoke test before distribution

1. Build MSI and NSIS installers.
2. Install on a clean Windows profile.
3. Confirm Vellum appears under Default Apps for all four extensions.
4. Set `.md` and `.html` defaults separately.
5. Double-click each supported extension with Vellum closed.
6. Repeat with Vellum already running.
7. Confirm opened files are not added to the pinned library.
8. Test paths containing spaces, Unicode, long names, and network locations.
9. Upgrade over the installed version and confirm associations remain registered.
10. Uninstall and confirm Windows removes Vellum's registration cleanly.

## Remaining release blockers outside the repository

- Windows code-signing certificate and timestamping configuration.
- Final license selection.
- Clean-machine MSI and NSIS smoke testing.
- Published checksums and release provenance.

## Conclusion

The repository is substantially closer to release-candidate quality. Native file handling, Windows association registration, release compilation, dependency auditing, and startup behavior are now represented in code and CI. The remaining blockers are signing, licensing, and actual installer validation on Windows rather than known repository architecture defects.
