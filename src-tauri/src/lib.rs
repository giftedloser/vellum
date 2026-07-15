use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};

const SUPPORTED_EXTENSIONS: &[&str] = &["md", "markdown", "html", "htm"];

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

fn scan(path: &Path) -> Result<Entry, String> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if canonical.is_file() {
        if !supported(&canonical) {
            return Err("Vellum only opens Markdown and HTML files.".into());
        }
        return Ok(Entry {
            name: display_name(&canonical),
            path: canonical.to_string_lossy().to_string(),
            kind: "file",
            children: None,
        });
    }

    if !canonical.is_dir() {
        return Err("The selected path is not a file or directory.".into());
    }

    let mut children = fs::read_dir(&canonical)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| entry.is_dir() || supported(entry))
        .filter_map(|entry| scan(&entry).ok())
        .collect::<Vec<_>>();

    children.sort_by(|left, right| {
        right.kind.cmp(left.kind).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(Entry {
        name: display_name(&canonical),
        path: canonical.to_string_lossy().to_string(),
        kind: "directory",
        children: Some(children),
    })
}

#[tauri::command]
fn scan_path(path: String) -> Result<Entry, String> {
    scan(&PathBuf::from(path))
}

#[tauri::command]
fn read_document(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !supported(&path) {
        return Err("Unsupported document type.".into());
    }
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![scan_path, read_document])
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}
