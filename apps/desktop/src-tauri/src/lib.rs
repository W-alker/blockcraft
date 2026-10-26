use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const FORMAT_ID: &str = "blockcraft.document";
const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetMetadata {
    id: String,
    path: String,
    mime: String,
    name: String,
    size: usize,
    sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format_id: String,
    format_version: u32,
    document_id: String,
    title: String,
    created_at: String,
    updated_at: String,
    assets: Vec<AssetMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetPayload {
    id: String,
    path: String,
    mime: String,
    name: String,
    size: usize,
    sha256: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedDocument {
    manifest: Manifest,
    snapshot: Value,
    assets: Vec<AssetPayload>,
}

#[derive(Debug, Clone, Serialize)]
struct RecoveryEntry {
    id: String,
}

#[tauri::command]
fn encode_bcdoc(document: PersistedDocument) -> Result<Vec<u8>, String> {
    validate_document(&document)?;
    let mut output = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(&mut output);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    writer.start_file("manifest.json", options).map_err(error)?;
    writer
        .write_all(&serde_json::to_vec_pretty(&document.manifest).map_err(error)?)
        .map_err(error)?;
    writer.start_file("document.json", options).map_err(error)?;
    writer
        .write_all(&serde_json::to_vec_pretty(&document.snapshot).map_err(error)?)
        .map_err(error)?;
    for asset in &document.assets {
        writer.start_file(&asset.path, options).map_err(error)?;
        writer.write_all(&asset.bytes).map_err(error)?;
    }
    writer.finish().map_err(error)?;
    Ok(output.into_inner())
}

#[tauri::command]
fn decode_bcdoc(bytes: Vec<u8>) -> Result<PersistedDocument, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(error)?;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(error)?;
        let name = entry.name().to_string();
        if !names.insert(name.clone()) {
            return Err(format!("ZIP 包含重复条目：{name}"));
        }
        if name != "manifest.json" && name != "document.json" && !is_safe_asset_path(&name) {
            return Err(format!("ZIP 条目路径非法：{name}"));
        }
    }

    let manifest: Manifest = read_json_entry(&mut archive, "manifest.json")?;
    let snapshot: Value = read_json_entry(&mut archive, "document.json")?;
    let listed_paths: HashSet<&str> = manifest
        .assets
        .iter()
        .map(|asset| asset.path.as_str())
        .collect();
    for name in &names {
        if is_safe_asset_path(name) && !listed_paths.contains(name.as_str()) {
            return Err(format!("ZIP 包含未登记资源：{name}"));
        }
    }
    let mut assets = Vec::with_capacity(manifest.assets.len());
    for metadata in &manifest.assets {
        if !is_safe_asset_path(&metadata.path) {
            return Err(format!("资源路径非法：{}", metadata.path));
        }
        let mut entry = archive.by_name(&metadata.path).map_err(error)?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(error)?;
        let digest = sha256_hex(&bytes);
        if digest != metadata.sha256 || bytes.len() != metadata.size {
            return Err(format!("资源校验失败：{}", metadata.path));
        }
        assets.push(AssetPayload {
            id: metadata.id.clone(),
            path: metadata.path.clone(),
            mime: metadata.mime.clone(),
            name: metadata.name.clone(),
            size: metadata.size,
            sha256: metadata.sha256.clone(),
            bytes,
        });
    }
    let document = PersistedDocument {
        manifest,
        snapshot,
        assets,
    };
    validate_document(&document)?;
    Ok(document)
}

#[tauri::command]
fn read_document(path: String) -> Result<Vec<u8>, String> {
    let path = validated_document_path(&path)?;
    fs::read(path).map_err(error)
}

#[tauri::command]
fn write_document(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = validated_document_path(&path)?;
    decode_bcdoc(bytes.clone())?;
    atomic_write(&path, &bytes)
}

#[tauri::command]
fn write_recovery(app: AppHandle, id: String, bytes: Vec<u8>) -> Result<(), String> {
    validate_recovery_id(&id)?;
    decode_bcdoc(bytes.clone())?;
    let directory = recovery_directory(&app)?;
    atomic_write(&directory.join(format!("{id}.bcdoc")), &bytes)
}

#[tauri::command]
fn list_recovery(app: AppHandle) -> Result<Vec<RecoveryEntry>, String> {
    let directory = recovery_directory(&app)?;
    let entries = fs::read_dir(directory).map_err(error)?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(error)?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("bcdoc") {
            if let Some(id) = path.file_stem().and_then(|value| value.to_str()) {
                result.push(RecoveryEntry { id: id.to_string() });
            }
        }
    }
    Ok(result)
}

#[tauri::command]
fn read_recovery(app: AppHandle, id: String) -> Result<Vec<u8>, String> {
    validate_recovery_id(&id)?;
    fs::read(recovery_directory(&app)?.join(format!("{id}.bcdoc"))).map_err(error)
}

#[tauri::command]
fn remove_recovery(app: AppHandle, id: String) -> Result<(), String> {
    validate_recovery_id(&id)?;
    let path = recovery_directory(&app)?.join(format!("{id}.bcdoc"));
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn initial_document_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|argument| {
            Path::new(argument)
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.eq_ignore_ascii_case("bcdoc"))
                == Some(true)
        })
        .collect()
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            encode_bcdoc,
            decode_bcdoc,
            read_document,
            write_document,
            write_recovery,
            list_recovery,
            read_recovery,
            remove_recovery,
            initial_document_paths,
        ])
        .build(tauri::generate_context!())
        .expect("error while building BlockCraft Desktop");

    app.run(|app_handle, event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let RunEvent::Opened { urls } = event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter_map(|path| path.to_str().map(str::to_owned))
                .filter(|path| {
                    Path::new(path)
                        .extension()
                        .and_then(|value| value.to_str())
                        .map(|value| value.eq_ignore_ascii_case("bcdoc"))
                        == Some(true)
                })
                .collect::<Vec<_>>();
            if !paths.is_empty() {
                let _ = app_handle.emit("open-document-path", paths);
            }
        }
    });
}

fn validate_document(document: &PersistedDocument) -> Result<(), String> {
    if document.manifest.format_id != FORMAT_ID {
        return Err("不支持的文档格式".to_string());
    }
    if document.manifest.format_version != FORMAT_VERSION {
        return Err(format!(
            "暂不支持的文档格式版本：{}",
            document.manifest.format_version
        ));
    }
    if document.snapshot.get("flavour").and_then(Value::as_str) != Some("root") {
        return Err("文档根快照无效".to_string());
    }
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    let metadata_by_id: HashMap<_, _> = document
        .manifest
        .assets
        .iter()
        .map(|asset| (asset.id.clone(), asset))
        .collect();
    if metadata_by_id.len() != document.manifest.assets.len() {
        return Err("资源 ID 重复".to_string());
    }
    if document.assets.len() != document.manifest.assets.len() {
        return Err("资源数据与清单不一致".to_string());
    }
    for asset in &document.assets {
        if !ids.insert(asset.id.clone())
            || !paths.insert(asset.path.clone())
            || !is_safe_asset_path(&asset.path)
        {
            return Err(format!("资源路径或 ID 非法：{}", asset.path));
        }
        let metadata = metadata_by_id
            .get(&asset.id)
            .ok_or_else(|| "资源清单缺失".to_string())?;
        if metadata.path != asset.path
            || metadata.sha256 != asset.sha256
            || metadata.size != asset.bytes.len()
        {
            return Err(format!("资源元数据不一致：{}", asset.id));
        }
        if sha256_hex(&asset.bytes) != asset.sha256 {
            return Err(format!("资源 SHA-256 不匹配：{}", asset.id));
        }
    }
    Ok(())
}

fn read_json_entry<T: for<'de> Deserialize<'de>>(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    name: &str,
) -> Result<T, String> {
    let mut entry = archive.by_name(name).map_err(error)?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).map_err(error)?;
    serde_json::from_slice(&bytes).map_err(error)
}

fn validated_document_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("bcdoc"))
        != Some(true)
    {
        return Err("只能访问 .bcdoc 文件".to_string());
    }
    if path.file_name().is_none() {
        return Err("文档路径无效".to_string());
    }
    Ok(path)
}

fn recovery_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(error)?
        .join("recovery");
    fs::create_dir_all(&directory).map_err(error)?;
    Ok(directory)
}

fn validate_recovery_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_')
    {
        return Err("恢复草稿 ID 非法".to_string());
    }
    Ok(())
}

fn is_safe_asset_path(path: &str) -> bool {
    let mut parts = path.split('/');
    matches!(parts.next(), Some("assets"))
        && parts.next().is_some()
        && parts.next().is_none()
        && !path.contains("..")
        && !path.contains('\\')
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "目标路径无父目录".to_string())?;
    fs::create_dir_all(parent).map_err(error)?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error)?
        .as_nanos();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "目标文件名无效".to_string())?;
    let temporary = parent.join(format!(".{file_name}.{suffix}.tmp"));
    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(error)?;
        file.write_all(bytes).map_err(error)?;
        file.sync_all().map_err(error)?;
    }
    if let Err(rename_error) = fs::rename(&temporary, path) {
        #[cfg(windows)]
        {
            let _ = fs::remove_file(path);
            fs::rename(&temporary, path).map_err(error)?;
        }
        #[cfg(not(windows))]
        {
            let _ = fs::remove_file(&temporary);
            return Err(rename_error.to_string());
        }
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|value| format!("{value:02x}")).collect()
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_document() -> PersistedDocument {
        PersistedDocument {
            manifest: Manifest {
                format_id: FORMAT_ID.to_string(),
                format_version: FORMAT_VERSION,
                document_id: "doc-1".to_string(),
                title: "Test".to_string(),
                created_at: "2026-08-24T00:00:00.000Z".to_string(),
                updated_at: "2026-08-24T00:00:00.000Z".to_string(),
                assets: Vec::new(),
            },
            snapshot: serde_json::json!({
                "id": "root",
                "flavour": "root",
                "nodeType": "root",
                "meta": {},
                "props": {},
                "children": []
            }),
            assets: Vec::new(),
        }
    }

    #[test]
    fn bcdoc_round_trip_keeps_manifest_and_snapshot() {
        let source = sample_document();
        let bytes = encode_bcdoc(source.clone()).expect("encode");
        let decoded = decode_bcdoc(bytes).expect("decode");
        assert_eq!(decoded.manifest.document_id, source.manifest.document_id);
        assert_eq!(decoded.snapshot, source.snapshot);
    }

    #[test]
    fn rejects_unsafe_asset_paths() {
        assert!(!is_safe_asset_path("../outside.bin"));
        assert!(!is_safe_asset_path("assets/../outside.bin"));
        assert!(!is_safe_asset_path("assets/nested/file.bin"));
        assert!(is_safe_asset_path("assets/abc.png"));
    }
}
