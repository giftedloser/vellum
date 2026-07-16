use serde::Serialize;
use std::{
    collections::HashSet,
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

const SUPPORTED_EXTENSIONS: &[&str] = &["md", "markdown", "html", "htm"];
const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SCAN_ENTRIES: usize = 20_000;

#[derive(Default)]
struct AppState {
    allowed_roots: Mutex<Vec<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    name: String,
    path: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<Entry>>,
}

fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| SUPPORTED_EXTENSIONS.contains(&value.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn file_entry(canonical: &Path) -> Result<Entry, String> {
    if !canonical.is_file() || !supported(canonical) {
        return Err("Vellum only opens Markdown and HTML files.".into());
    }

    Ok(Entry {
        name: display_name(canonical),
        path: canonical.to_string_lossy().into_owned(),
        kind: "file",
        children: None,
    })
}

fn scan_canonical(
    canonical: &Path,
    depth: usize,
    visited: &mut HashSet<PathBuf>,
    entry_count: &mut usize,
) -> Result<Entry, String> {
    if depth > MAX_SCAN_DEPTH {
        return Err("This folder exceeds Vellum's maximum nesting depth.".into());
    }
    if *entry_count >= MAX_SCAN_ENTRIES {
        return Err("This folder contains more entries than Vellum can safely index at once.".into());
    }
    *entry_count += 1;

    if !visited.insert(canonical.to_path_buf()) {
        return Err("A recursive filesystem link was skipped.".into());
    }
    if canonical.is_file() {
        return file_entry(canonical);
    }
    if !canonical.is_dir() {
        return Err("The selected path is not a file or directory.".into());
    }

    let mut children = Vec::new();
    for entry in fs::read_dir(canonical)
        .map_err(|error| error.to_string())?
        .flatten()
    {
        let path = entry.path();
        if !path.is_dir() && !supported(&path) {
            continue;
        }
        let Ok(canonical_child) = path.canonicalize() else {
            continue;
        };
        if visited.contains(&canonical_child) {
            continue;
        }
        if let Ok(child) = scan_canonical(&canonical_child, depth + 1, visited, entry_count) {
            children.push(child);
        }
    }

    children.sort_by_cached_key(|entry| (entry.kind != "directory", entry.name.to_lowercase()));

    Ok(Entry {
        name: display_name(canonical),
        path: canonical.to_string_lossy().into_owned(),
        kind: "directory",
        children: Some(children),
    })
}

fn authorize_root(canonical: &Path, state: &State<'_, AppState>) -> Result<(), String> {
    let mut roots = state
        .allowed_roots
        .lock()
        .map_err(|_| "Vellum could not access its document authorization state.".to_string())?;
    if !roots.contains(&canonical.to_path_buf()) {
        roots.push(canonical.to_path_buf());
    }
    Ok(())
}

fn is_authorized(path: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| {
        if root.is_file() {
            path == root
        } else {
            path.starts_with(root)
        }
    })
}

fn modified_ms(path: &Path) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .map_err(|error| error.to_string())?
        .modified()
        .map_err(|error| error.to_string())?;
    Ok(modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64)
}

fn unique_sibling(parent: &Path, label: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    parent.join(format!(".vellum-{label}-{stamp}.tmp"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_only_document_extensions() {
        assert!(supported(Path::new("notes.MD")));
        assert!(supported(Path::new("page.html")));
        assert!(!supported(Path::new("script.js")));
        assert!(!supported(Path::new("README")));
    }

    #[test]
    fn authorizes_files_and_directory_descendants() {
        let file = PathBuf::from("library/saved.md");
        let directory = PathBuf::from("library/docs");
        let roots = [file.clone(), directory.clone()];

        assert!(is_authorized(&file, &roots));
        assert!(is_authorized(&directory.join("nested/page.html"), &roots));
        assert!(!is_authorized(Path::new("library/other.md"), &roots));
    }
}

#[tauri::command]
fn startup_document(state: State<'_, AppState>) -> Result<Option<Entry>, String> {
    for argument in env::args_os().skip(1) {
        let path = PathBuf::from(argument);
        if !supported(&path) {
            continue;
        }
        let canonical = match path.canonicalize() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let entry = file_entry(&canonical)?;
        authorize_root(&canonical, &state)?;
        return Ok(Some(entry));
    }

    Ok(None)
}

#[tauri::command]
fn scan_path(path: String, state: State<'_, AppState>) -> Result<Entry, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let mut visited = HashSet::new();
    let mut entry_count = 0;
    let entry = scan_canonical(&canonical, 0, &mut visited, &mut entry_count)?;
    authorize_root(&canonical, &state)?;
    Ok(entry)
}

#[tauri::command]
fn read_document(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if !supported(&canonical) || !canonical.is_file() {
        return Err("Unsupported document type.".into());
    }

    let roots = state
        .allowed_roots
        .lock()
        .map_err(|_| "Vellum could not access its document authorization state.".to_string())?;
    if !is_authorized(&canonical, &roots) {
        return Err("This document is not in the active Vellum library.".into());
    }
    drop(roots);

    let metadata = fs::metadata(&canonical).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_DOCUMENT_BYTES {
        return Err("This document is larger than Vellum's 32 MB safety limit.".into());
    }

    fs::read_to_string(canonical).map_err(|error| error.to_string())
}

#[tauri::command]
fn document_modified_ms(path: String, state: State<'_, AppState>) -> Result<u64, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let roots = state
        .allowed_roots
        .lock()
        .map_err(|_| "Vellum could not access its document authorization state.".to_string())?;
    if !is_authorized(&canonical, &roots) {
        return Err("This document is not in the active Vellum library.".into());
    }
    modified_ms(&canonical)
}

#[tauri::command]
fn write_document(path: String, content: String, state: State<'_, AppState>) -> Result<u64, String> {
    if content.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("This document is larger than Vellum's 32 MB safety limit.".into());
    }

    let requested = PathBuf::from(path);
    if !supported(&requested) {
        return Err("Vellum only saves Markdown and HTML files.".into());
    }

    let parent = requested
        .parent()
        .ok_or_else(|| "The selected save location is invalid.".to_string())?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let filename = requested
        .file_name()
        .ok_or_else(|| "The selected save filename is invalid.".to_string())?;
    let destination = parent.join(filename);

    if destination.exists() {
        let canonical = destination
            .canonicalize()
            .map_err(|error| error.to_string())?;
        let roots = state
            .allowed_roots
            .lock()
            .map_err(|_| "Vellum could not access its document authorization state.".to_string())?;
        if !is_authorized(&canonical, &roots) {
            return Err("This document is not authorized for editing.".into());
        }
    }

    let temporary = unique_sibling(&parent, "write");
    let backup = unique_sibling(&parent, "backup");
    {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }

    let had_existing = destination.exists();
    if had_existing {
        fs::rename(&destination, &backup).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            error.to_string()
        })?;
    }

    if let Err(error) = fs::rename(&temporary, &destination) {
        if had_existing {
            let _ = fs::rename(&backup, &destination);
        }
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }

    if had_existing {
        let _ = fs::remove_file(&backup);
    }

    let canonical = destination
        .canonicalize()
        .map_err(|error| error.to_string())?;
    authorize_root(&canonical, &state)?;
    modified_ms(&canonical)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            startup_document,
            scan_path,
            read_document,
            document_modified_ms,
            write_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}
