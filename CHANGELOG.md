# Changelog

All notable changes to Vellum are documented in this file.

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

[1.0.1]: https://github.com/giftedloser/vellum/releases/tag/v1.0.1
[1.0.0]: https://github.com/giftedloser/vellum/releases/tag/v1.0.0
[0.2.1]: https://github.com/giftedloser/vellum/releases/tag/v0.2.1
[0.2.0]: https://github.com/giftedloser/vellum/releases/tag/v0.2.0
