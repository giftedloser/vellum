# Vellum Renderer and Control Audit

Audit date: July 15, 2026

## Scope

This focused audit reviewed the current `main` branch after the document-viewer redesign, with emphasis on HTML rendering, floating window controls, viewer zoom controls, theme consistency, accessibility, CSP behavior, and validation coverage.

## Corrected findings

### High — HTML resources blocked by the application CSP

The HTML viewer uses a sandboxed `srcDoc` iframe. `srcDoc` inherits the containing WebView's content-security policy, and the previous policy allowed only the exact Vellum viewer bootstrap script while blocking ordinary authored scripts, external stylesheets, fonts, media, network requests, and many embedded resources. Complex HTML could therefore appear unstyled, incomplete, or blank.

Resolution:

- Retained the opaque-origin iframe sandbox without `allow-same-origin`.
- Retained `no-referrer` behavior.
- Expanded renderer-compatible CSP directives for authored HTML resources.
- Kept plugins and embedded objects disabled through `object-src 'none'`.
- Preserved the native Rust document authorization boundary.

### Medium — window controls were effectively hidden

Window controls used zero opacity and no pointer interaction until the pointer entered a narrow invisible hotspot. This was difficult to discover and unreliable against both bright and dark rendered documents.

Resolution:

- Added one theme-independent floating-control treatment.
- Controls now remain visible at a restrained baseline opacity.
- Added a dark neutral surface, white iconography, border, blur, and shadow that work over either theme and over arbitrary document content.
- Preserved a clear red close-button hover state.
- Added stronger keyboard focus treatment.

### Medium — zoom controls had the same discoverability problem

Viewer zoom controls also remained completely hidden until an invisible bottom hotspot was found.

Resolution:

- Applied the same universal component language used by window controls.
- Kept the percentage readable at rest.
- Added consistent dividers, active state, disabled state, hover state, and focus state.
- Made the control fully visible on non-hover input devices.

## Architecture and optimization review

- The new control treatment is isolated in `src/control-system.css`, loaded after the existing style layers so it is easy to audit or revise without destabilizing the document typography.
- No extra React state or render work was added.
- No new runtime dependency was introduced.
- Existing TypeScript/Vite and Rust/Tauri CI coverage remains in place.
- Markdown sanitization, sandbox isolation, canonical path checks, authorization roots, directory limits, and the 32 MB file limit remain intact.

## Remaining renderer boundary

Self-contained HTML and HTML that loads normal network resources are supported by the corrected policy. Relative local assets still require a controlled Tauri asset-protocol design tied to Vellum's authorized roots. A blanket filesystem scope was intentionally not introduced during this fix because it would weaken the audited native boundary.

## Validation required in the native application

The repository changes should be smoke-tested with:

1. A self-contained HTML document with inline CSS and JavaScript.
2. An HTML document loading HTTPS styles, fonts, images, and scripts.
3. Bright and dark HTML pages to confirm floating-control contrast.
4. Keyboard-only access to window and zoom controls.
5. Windows scaling at 100%, 125%, and 150%.

The remaining local-relative-asset work should be implemented as a separate controlled filesystem feature rather than folded into the visual fix.
