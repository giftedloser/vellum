# Contributing

## Development setup

Install Node.js 20.19 or newer, Rust stable, and the platform-specific Tauri prerequisites.

```bash
npm ci
npm run tauri -- dev
```

## Before opening a pull request

```bash
npm run build
npm audit --omit=dev --audit-level=high
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Keep changes focused, preserve Vellum's viewer-first scope, and update documentation when behavior changes.
