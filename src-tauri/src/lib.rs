use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{http, AppHandle, Manager, State};

const SUPPORTED_EXTENSIONS: &[&str] = &["md", "markdown", "html", "htm", "txt"];
const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;
const MAX_SESSION_BYTES: usize = 32 * 1024 * 1024;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SCAN_ENTRIES: usize = 20_000;

#[derive(Default)]
struct AppState {
    allowed_roots: Mutex<Vec<PathBuf>>,
    asset_roots: Mutex<Vec<PathBuf>>,
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

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    version: u8,
    notes: Vec<SessionNote>,
    documents: Vec<SessionDocument>,
    active: Option<SessionActive>,
    workspace: SessionWorkspace,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionNote {
    id: String,
    fallback_title: String,
    content: String,
    updated_at: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionDocument {
    path: String,
    content: String,
    base_modified_ms: u64,
    updated_at: u64,
    kind: Option<SessionDocumentKind>,
    name: Option<String>,
    draft: Option<bool>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SessionDocumentKind {
    Markdown,
    Html,
    Text,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum SessionActive {
    Note { id: String },
    Document { path: String },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SessionWorkspace {
    Documents,
    Notes,
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
        return Err("Vellum only opens Markdown, HTML, and text files.".into());
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

fn asset_root_for_document(
    path: &Path,
    allowed_roots: &[PathBuf],
    asset_roots: &mut Vec<PathBuf>,
) -> Result<usize, String> {
    if !path.is_file() || !supported(path) || !is_authorized(path, allowed_roots) {
        return Err("This document is not authorized for local assets.".into());
    }
    let root = path
        .parent()
        .ok_or_else(|| "This document has no local asset folder.".to_string())?
        .to_path_buf();
    if let Some(index) = asset_roots.iter().position(|candidate| candidate == &root) {
        return Ok(index);
    }
    asset_roots.push(root);
    Ok(asset_roots.len() - 1)
}

fn decode_url_path(path: &str) -> Result<String, String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let value = bytes
                .get(index + 1..index + 3)
                .and_then(|hex| std::str::from_utf8(hex).ok())
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
                .ok_or_else(|| "Invalid asset URL.".to_string())?;
            decoded.push(value);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| "Invalid asset URL.".to_string())
}

fn resolve_asset(request_path: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let (root_index, relative) = request_path
        .trim_start_matches('/')
        .split_once('/')
        .ok_or_else(|| "Invalid asset URL.".to_string())?;
    let root = roots
        .get(
            root_index
                .parse::<usize>()
                .map_err(|_| "Invalid asset URL.".to_string())?,
        )
        .ok_or_else(|| "Unknown asset root.".to_string())?;
    let path = root
        .join(decode_url_path(relative)?)
        .canonicalize()
        .map_err(|_| "Asset not found.".to_string())?;
    if !path.is_file() || !path.starts_with(root) {
        return Err("Asset is outside the authorized document folder.".into());
    }
    Ok(path)
}

fn asset_response(
    status: http::StatusCode,
    body: Vec<u8>,
    content_type: &str,
) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, content_type)
        .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(http::header::CACHE_CONTROL, "no-store")
        .header(http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .expect("valid asset response")
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

fn atomic_write(destination: &Path, content: &[u8]) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "The selected save location is invalid.".to_string())?;
    let temporary = unique_sibling(parent, "write");
    let backup = unique_sibling(parent, "backup");
    {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(content).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }

    let had_existing = destination.exists();
    if had_existing {
        fs::rename(destination, &backup).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            error.to_string()
        })?;
    }

    if let Err(error) = fs::rename(&temporary, destination) {
        if had_existing {
            let _ = fs::rename(&backup, destination);
        }
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }

    if had_existing {
        let _ = fs::remove_file(&backup);
    }
    Ok(())
}

fn validated_session(session: &str) -> Result<Session, String> {
    if session.len() > MAX_SESSION_BYTES {
        return Err("The recovery session exceeds Vellum's 32 MB safety limit.".into());
    }
    let session: Session = serde_json::from_str(session)
        .map_err(|_| "The recovery session is invalid.".to_string())?;
    if session.version != 1 {
        return Err("This recovery session version is not supported.".into());
    }
    Ok(session)
}

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("session-v1.json"))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_only_document_extensions() {
        assert!(supported(Path::new("notes.MD")));
        assert!(supported(Path::new("page.html")));
        assert!(supported(Path::new("scratch.TXT")));
        assert!(!supported(Path::new("script.js")));
        assert!(!supported(Path::new("README")));
    }

    #[test]
    fn validates_the_session_contract() {
        let session = r#"{"version":1,"notes":[{"id":"n1","fallbackTitle":"Untitled 1","content":"hello","updatedAt":1}],"documents":[{"path":"draft://Untitled.md","content":"draft","baseModifiedMs":0,"updatedAt":3,"kind":"markdown","name":"Untitled.md","draft":true}],"active":{"type":"document","path":"draft://Untitled.md"},"workspace":"documents"}"#;
        let parsed = validated_session(session).unwrap();
        assert_eq!(parsed.version, 1);
        assert!(matches!(
            parsed.documents[0].kind,
            Some(SessionDocumentKind::Markdown)
        ));
        assert_eq!(parsed.documents[0].name.as_deref(), Some("Untitled.md"));
        assert_eq!(parsed.documents[0].draft, Some(true));
        assert!(validated_session(&session.replace("\"version\":1", "\"version\":2")).is_err());
    }

    #[test]
    fn atomic_write_creates_and_replaces_content() {
        let folder = unique_sibling(&env::temp_dir(), "atomic-test");
        fs::create_dir(&folder).unwrap();
        let path = folder.join("session.json");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");
        fs::remove_dir_all(folder).unwrap();
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

    #[test]
    fn html_document_can_load_sibling_javascript() {
        let folder = unique_sibling(&env::temp_dir(), "asset-test");
        fs::create_dir(&folder).unwrap();
        let document = folder.join("menu.html");
        let script = folder.join("menu.js");
        fs::write(
            &document,
            r#"<button onclick="relativeMenu()">Menu</button><script src="./menu.js"></script>"#,
        )
        .unwrap();
        fs::write(
            &script,
            "function relativeMenu() { document.body.dataset.open = 'true'; }",
        )
        .unwrap();
        let document = document.canonicalize().unwrap();

        let mut asset_roots = Vec::new();
        let root =
            asset_root_for_document(&document, std::slice::from_ref(&document), &mut asset_roots)
                .unwrap();
        let resolved = resolve_asset(&format!("/{root}/menu.js"), &asset_roots).unwrap();

        assert_eq!(
            fs::read_to_string(resolved).unwrap(),
            "function relativeMenu() { document.body.dataset.open = 'true'; }"
        );
        fs::remove_dir_all(folder).unwrap();
    }
}

#[tauri::command]
fn load_session(app: AppHandle) -> Result<Option<String>, String> {
    let path = session_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    if fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len()
        > MAX_SESSION_BYTES as u64
    {
        return Err("The recovery session exceeds Vellum's 32 MB safety limit.".into());
    }
    let session = fs::read_to_string(path).map_err(|error| error.to_string())?;
    validated_session(&session)?;
    Ok(Some(session))
}

#[tauri::command]
fn save_session(session: String, app: AppHandle) -> Result<(), String> {
    validated_session(&session)?;
    let path = session_path(&app)?;
    fs::create_dir_all(
        path.parent()
            .ok_or_else(|| "The recovery session location is invalid.".to_string())?,
    )
    .map_err(|error| error.to_string())?;
    atomic_write(&path, session.as_bytes())
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
fn document_asset_base(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let allowed_roots = state
        .allowed_roots
        .lock()
        .map_err(|_| "Vellum could not access its document authorization state.".to_string())?;
    let mut asset_roots = state
        .asset_roots
        .lock()
        .map_err(|_| "Vellum could not access its asset authorization state.".to_string())?;
    let index = asset_root_for_document(&canonical, &allowed_roots, &mut asset_roots)?;
    Ok(format!("vellum-asset://localhost/{index}/"))
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
fn write_document(
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    if content.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err("This document is larger than Vellum's 32 MB safety limit.".into());
    }

    let requested = PathBuf::from(path);
    if !supported(&requested) {
        return Err("Vellum only saves Markdown, HTML, and text files.".into());
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

    atomic_write(&destination, content.as_bytes())?;

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
        .register_uri_scheme_protocol("vellum-asset", |context, request| {
            let state = context.app_handle().state::<AppState>();
            let path = state
                .asset_roots
                .lock()
                .map_err(|_| "Asset authorization is unavailable.".to_string())
                .and_then(|roots| resolve_asset(request.uri().path(), &roots));
            match path.and_then(|path| {
                let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
                if metadata.len() > MAX_DOCUMENT_BYTES {
                    return Err("Asset exceeds Vellum's 32 MB safety limit.".into());
                }
                let bytes = fs::read(&path).map_err(|error| error.to_string())?;
                let mime =
                    tauri::utils::mime_type::MimeType::parse(&bytes, &path.to_string_lossy());
                Ok((bytes, mime))
            }) {
                Ok((bytes, mime)) => asset_response(http::StatusCode::OK, bytes, &mime),
                Err(message) => asset_response(
                    http::StatusCode::NOT_FOUND,
                    message.into_bytes(),
                    "text/plain",
                ),
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_session,
            save_session,
            startup_document,
            scan_path,
            read_document,
            document_asset_base,
            document_modified_ms,
            write_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vellum");
}
