# Changelog

All notable changes to Vellum are documented in this file.

## [1.0.6] - 2026-07-27

### Fixed

- Right-clicking below the middle of the window opened the menu at the foot of the window instead of at the pointer. The menu now meets the cursor whichever direction it opens, and is given the room actually available in that direction rather than the full window height.

### Changed

- Settings rows are separated by a hairline, so a group no longer reads as one block of text.
- Reset is detached from the Editor group it appeared to belong to, and its button now uses the same face as every other control in the panel.

## [1.0.5] - 2026-07-26

### Added

- Unsaved notes and drafts can be renamed from their context menu or by double-clicking the title in the sidebar. The name survives the session, and a renamed draft carries its title into Save As.
- Pinned sidebar items can be reordered by dragging, with an accent insertion line marking where the item will land.

### Fixed

- Unsaved notes and drafts are titled from their first line again instead of all reading Untitled.
- Dragging inside the window works, rather than being captured as an operating system file drop.
- The rename field no longer draws a dark focus box around the sidebar row it sits in.
- The selected segment in Settings is centred on its control.
- The browser engine's find bar can no longer be reached with `F3` or from inside a rendered HTML document, the two paths the earlier fix did not cover.
- Note and draft labels reclaim the sidebar column that their unsaved dot used to occupy.

### Changed

- The unsaved dot is amber in both the sidebar and the Edit button, and yields to the pin control when a row is hovered.
- New text notes are ordinary `.txt` documents; the separate Scratch Pad type is gone.
- Undecorated window edges and corners are cleaned up, with the native Windows shadow enabled.
- Browser-native dialogs and popups are suppressed in the viewer.

## [1.0.4] - 2026-07-26

### Added

- Right-click menus now match the clicked sidebar item, editor, viewer, note, draft, or empty workspace, including Open in Explorer where a saved path exists.
- Editor context menus now provide undo, redo, cut, copy, select all, and find using the active CodeMirror editor.

### Fixed

- Right-clicking one sidebar file no longer offers document actions for a different open file.
- Viewer selections can be copied from sandboxed HTML and Markdown frames, and Escape now dismisses their context menus.
- Settings scrollbars remain at the panel edge without clipped arrow controls.

### Changed

- Settings uses compact segmented controls and numeric steppers with keyboard support, persistent preset migration, and theme-matched sliding selection indicators.
- Default interface and reading scales are now 100 percent, and the sidebar is more opaque for improved legibility.

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

[1.0.6]: https://github.com/giftedloser/vellum/releases/tag/v1.0.6
[1.0.5]: https://github.com/giftedloser/vellum/releases/tag/v1.0.5
[1.0.4]: https://github.com/giftedloser/vellum/releases/tag/v1.0.4
[1.0.3]: https://github.com/giftedloser/vellum/releases/tag/v1.0.3
[1.0.2]: https://github.com/giftedloser/vellum/releases/tag/v1.0.2
[1.0.1]: https://github.com/giftedloser/vellum/releases/tag/v1.0.1
[1.0.0]: https://github.com/giftedloser/vellum/releases/tag/v1.0.0
[0.2.1]: https://github.com/giftedloser/vellum/releases/tag/v0.2.1
[0.2.0]: https://github.com/giftedloser/vellum/releases/tag/v0.2.0
