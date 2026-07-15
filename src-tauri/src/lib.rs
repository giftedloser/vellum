use serde::Serialize;
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    sync::Mutex,
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
        return Err(
            "This folder contains more entries than Vellum can safely index at once.".into(),
        );
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            startup_document,
            scan_path,
            read_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}
