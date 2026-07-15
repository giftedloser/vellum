use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::State;

const SUPPORTED_EXTENSIONS: &[&str] = &["md", "markdown", "html", "htm"];
const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;

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
        .and_then(|value| value.to_str())
        .unwrap_or_else(|| path.to_string_lossy().as_ref())
        .to_string()
}

fn scan_canonical(canonical: &Path) -> Result<Entry, String> {
    if canonical.is_file() {
        if !supported(canonical) {
            return Err("Vellum only opens Markdown and HTML files.".into());
        }
        return Ok(Entry {
            name: display_name(canonical),
            path: canonical.to_string_lossy().to_string(),
            kind: "file",
            children: None,
        });
    }

    if !canonical.is_dir() {
        return Err("The selected path is not a file or directory.".into());
    }

    let mut children = fs::read_dir(canonical)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| entry.is_dir() || supported(entry))
        .filter_map(|entry| {
            let canonical_child = entry.canonicalize().ok()?;
            scan_canonical(&canonical_child).ok()
        })
        .collect::<Vec<_>>();

    children.sort_by(|left, right| {
        right
            .kind
            .cmp(left.kind)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(Entry {
        name: display_name(canonical),
        path: canonical.to_string_lossy().to_string(),
        kind: "directory",
        children: Some(children),
    })
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

#[tauri::command]
fn scan_path(path: String, state: State<'_, AppState>) -> Result<Entry, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let entry = scan_canonical(&canonical)?;

    let mut roots = state
        .allowed_roots
        .lock()
        .map_err(|_| "Vellum could not access its document authorization state.".to_string())?;
    if !roots.contains(&canonical) {
        roots.push(canonical);
    }

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
        .invoke_handler(tauri::generate_handler![scan_path, read_document])
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}
