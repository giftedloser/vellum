# Changelog

All notable changes to Vellum are documented in this file.

## [1.0.3] - 2026-07-25

### Fixed

- Opening a file from Explorer while Vellum was already running started a second copy of the application. Both wrote the same recovery file, so one window could overwrite the other's unsaved work. A second launch now hands the file to the window you already have open.
- `Ctrl+F` did not close the find bar while the cursor was still in the Find field, and the unhandled key opened the browser engine's own find bar over the application. It now toggles from anywhere in the editor or the panel, and the native bar no longer appears.

### Changed

- The interface font is now bundled rather than relied upon from the system, so text renders identically on every machine and font weights render as intended.
- The installer is roughly 44 percent smaller. Two large images were being copied into the application without ever being used, and a third was a build-time source that never needed to ship.

## [1.0.2] - 2026-07-24

### Fixed

- The editor's find panel was invisible. It was styled with variables that were never defined, so it rendered with no background, border, or shadow over the document text, and its checkboxes read "match case Find" and "regexp Find".
- Notes now move to the top of the sidebar when you edit them. The sort existed but was never applied.
- Sidebar rows are a uniform height again. Rows carrying a remove control rendered at double height, which affected Recent and folder roots.
- Typing no longer pays for a Markdown or HTML render that is thrown away, which was measurably slow on large documents.
- The recent list no longer grows without bound on disk.
- Section headers now read as a tier above their contents rather than as a sibling, and are no longer outranked in contrast by their own entries.

### Added

- Opening a file from Explorer starts with the sidebar collapsed. This does not overwrite your saved sidebar preference.

### Changed

- The find panel is a single line docked to the bottom edge, styled to match the document control bar, and the document bar lifts clear of it while it is open.
- Empty sidebar sections read "Empty".

## [1.0.1] - 2026-07-24

### Fixed

- Sidebar sections no longer clip their contents. Pinned, In Progress, and Recent now share one scroll region, so long lists stay reachable instead of being cut off with no scrollbar.
- The sidebar no longer leaves a dead empty block above the command bar, and content can no longer run underneath it.
- Row actions line up: every entry reserves the same columns, the pin sits flush against the right edge, and the unsaved dot sits directly beside it.
- Light theme text is no longer near black, and every text role now meets WCAG AA contrast in both themes.
- Settings shows a scrollbar; roughly half the page was previously unreachable with no affordance.
- Settings closes on backdrop click and keeps its header visible while scrolling.
- Removed the background vignette that washed over panel edges. The paper grain is unchanged.

### Changed

- Consolidated five stylesheets into a token layer plus two sheets, removing 56 selectors that were redefined across files.
- Typography now uses a fixed scale and only the three font weights the UI stack can actually render.
- Settings uses the Vellum display face for its title and a tighter row rhythm.

## [1.0.0] - 2026-07-23

### Added

- Added HTML/Markdown and TXT workspaces with matching Pinned, In Progress, and Recent sidebar sections, durable scratch notes, and recovery snapshots.
- Added plain-text creation, editing, counts, saving, startup handling, and Windows file association.
- Restored distinct Markdown and HTML syntax colors in light and dark themes.

### Changed

- Closing a view or Vellum now preserves unsaved work for recovery instead of discarding it.

## [0.2.1] - 2026-07-16

### Fixed

- Restored scripts, animations, and viewer zoom for complex HTML documents in packaged builds.
- Restored window closing from Vellum and Windows by granting the required native destroy capability.
- Added transparent safe-area padding to Windows icons for clean taskbar rendering.

## [0.2.0] - 2026-07-16

### Added

- Lightweight CodeMirror editing for Markdown and HTML.
- Pinned and Recent sidebar sections for files and folders.
- New Markdown and HTML document creation.
- Theme-aware font, zoom, motion, and control-visibility settings.
- Windows file associations for Markdown and HTML documents.

### Changed

- Unified viewer and editor controls into one auto-hiding floating surface.
- Refined sidebar collapse motion, window controls, themes, and application branding.
- Replaced native scrollbars in context menus with minimal directional overflow hints.

### Security

- Restricted native reads and writes to authorized Markdown and HTML paths.
- Kept HTML rendering inside a sandboxed opaque-origin frame.
- Added JavaScript and Rust dependency audits to continuous integration.

[1.0.3]: https://github.com/giftedloser/vellum/releases/tag/v1.0.3
[1.0.2]: https://github.com/giftedloser/vellum/releases/tag/v1.0.2
[1.0.1]: https://github.com/giftedloser/vellum/releases/tag/v1.0.1
[1.0.0]: https://github.com/giftedloser/vellum/releases/tag/v1.0.0
[0.2.1]: https://github.com/giftedloser/vellum/releases/tag/v0.2.1
[0.2.0]: https://github.com/giftedloser/vellum/releases/tag/v0.2.0
