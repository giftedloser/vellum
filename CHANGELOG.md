# Changelog

All notable changes to Vellum are documented in this file.

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

[0.2.0]: https://github.com/giftedloser/vellum/releases/tag/v0.2.0
