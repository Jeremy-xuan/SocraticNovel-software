use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// Get the base workspaces directory: ~/socratic-novel-软件开发/workspaces/
fn workspaces_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join("socratic-novel-软件开发").join("workspaces"))
}

/// Resolve and validate a path within a workspace (sandbox enforcement).
/// Returns Err if the path escapes the workspace.
fn resolve_sandboxed_path(workspace_path: &str, file_path: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(workspace_path);
    if !base.exists() {
        return Err(format!("Workspace not found: {}", workspace_path));
    }

    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace path: {}", e))?;

    let target = base.join(file_path);

    // Create parent directories if needed for write operations
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create directories: {}", e))?;
        }
    }

    let canonical_target = if target.exists() {
        target.canonicalize().map_err(|e| format!("Cannot resolve path: {}", e))?
    } else {
        // For new files, canonicalize the parent and append the filename
        let parent = target
            .parent()
            .ok_or("Invalid path")?
            .canonicalize()
            .map_err(|e| format!("Cannot resolve parent path: {}", e))?;
        parent.join(target.file_name().ok_or("Invalid filename")?)
    };

    if !canonical_target.starts_with(&canonical_base) {
        return Err("Access denied: path escapes workspace sandbox".to_string());
    }

    Ok(canonical_target)
}

#[tauri::command]
pub fn read_file(workspace_path: &str, file_path: &str) -> Result<String, String> {
    let path = resolve_sandboxed_path(workspace_path, file_path)?;

    // PDF files: use pdftotext for extraction
    if path.extension().and_then(|e| e.to_str()) == Some("pdf") {
        let output = std::process::Command::new("pdftotext")
            .arg("-layout")
            .arg(&path)
            .arg("-")
            .output()
            .map_err(|e| format!("Failed to run pdftotext: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("pdftotext failed: {}", stderr));
        }

        String::from_utf8(output.stdout)
            .map_err(|e| format!("pdftotext output not valid UTF-8: {}", e))
    } else {
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
    }
}

#[tauri::command]
pub fn write_file(workspace_path: &str, file_path: &str, content: &str) -> Result<(), String> {
    let path = resolve_sandboxed_path(workspace_path, file_path)?;
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn append_file(workspace_path: &str, file_path: &str, content: &str) -> Result<(), String> {
    let path = resolve_sandboxed_path(workspace_path, file_path)?;
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file for append: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))
}

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn list_files(workspace_path: &str, dir_path: &str) -> Result<Vec<FileEntry>, String> {
    let path = resolve_sandboxed_path(workspace_path, dir_path)?;
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let relative_path = Path::new(dir_path).join(&name).to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(FileEntry {
            name,
            path: relative_path,
            is_dir,
        });
    }

    entries.sort_by(|a, b| {
        // Directories first, then alphabetical
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(entries)
}

#[tauri::command]
pub fn search_file(workspace_path: &str, file_path: &str, query: &str) -> Result<String, String> {
    let content = read_file(workspace_path, file_path)?;
    let query_lower = query.to_lowercase();
    let results: Vec<String> = content
        .lines()
        .enumerate()
        .filter(|(_, line)| line.to_lowercase().contains(&query_lower))
        .map(|(i, line)| format!("{}:{}", i + 1, line))
        .collect();

    if results.is_empty() {
        Ok(format!("No matches found for '{}' in {}", query, file_path))
    } else {
        Ok(results.join("\n"))
    }
}

#[derive(Serialize, Deserialize, Default)]
struct WorkspaceMeta {
    #[serde(default)]
    last_opened: Option<String>,
}

fn read_workspace_meta(ws_path: &Path) -> WorkspaceMeta {
    let meta_path = ws_path.join(".workspace_meta.json");
    if meta_path.exists() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        WorkspaceMeta::default()
    }
}

fn write_workspace_meta(ws_path: &Path, meta: &WorkspaceMeta) -> Result<(), String> {
    let meta_path = ws_path.join(".workspace_meta.json");
    let json = serde_json::to_string_pretty(meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    fs::write(&meta_path, json).map_err(|e| format!("Failed to write meta: {}", e))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub has_claude_md: bool,
    pub last_opened: Option<String>,
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<WorkspaceInfo>, String> {
    let base = workspaces_dir()?;
    if !base.exists() {
        return Ok(Vec::new());
    }

    let mut workspaces = Vec::new();
    let entries = fs::read_dir(&base).map_err(|e| format!("Failed to read workspaces: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().to_string_lossy().to_string();
            let has_claude_md = entry.path().join("CLAUDE.md").exists();
            let meta = read_workspace_meta(&entry.path());
            workspaces.push(WorkspaceInfo {
                id: name.clone(),
                name,
                path,
                has_claude_md,
                last_opened: meta.last_opened,
            });
        }
    }

    Ok(workspaces)
}

#[tauri::command]
pub fn create_workspace(name: &str) -> Result<WorkspaceInfo, String> {
    let base = workspaces_dir()?;
    fs::create_dir_all(&base).map_err(|e| format!("Failed to create workspaces dir: {}", e))?;

    let ws_path = base.join(name);
    if ws_path.exists() {
        return Err(format!("Workspace '{}' already exists", name));
    }

    fs::create_dir_all(&ws_path).map_err(|e| format!("Failed to create workspace: {}", e))?;
    fs::create_dir_all(ws_path.join("teacher")).map_err(|e| format!("Failed to create teacher/: {}", e))?;
    fs::create_dir_all(ws_path.join("materials")).map_err(|e| format!("Failed to create materials/: {}", e))?;

    Ok(WorkspaceInfo {
        id: name.to_string(),
        name: name.to_string(),
        path: ws_path.to_string_lossy().to_string(),
        has_claude_md: false,
        last_opened: None,
    })
}

#[tauri::command]
pub fn init_builtin_workspace() -> Result<WorkspaceInfo, String> {
    let base = workspaces_dir()?;
    let target = base.join("ap-physics-em");

    if target.exists() {
        let meta = read_workspace_meta(&target);
        return Ok(WorkspaceInfo {
            id: "ap-physics-em".to_string(),
            name: "ap-physics-em".to_string(),
            path: target.to_string_lossy().to_string(),
            has_claude_md: target.join("CLAUDE.md").exists(),
            last_opened: meta.last_opened,
        });
    }

    // Source: the AP_Physics_EM- 学习系统 directory in user's home
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let source = home.join("AP_Physics_EM- 学习系统");

    if !source.exists() {
        return Err(
            "AP_Physics_EM source not found. Please ensure ~/AP_Physics_EM- 学习系统/ exists.".to_string(),
        );
    }

    // Create target directory
    fs::create_dir_all(&target).map_err(|e| format!("Failed to create workspace: {}", e))?;

    // Copy all non-PDF, non-git content files
    copy_dir_recursive(&source, &target, &|path: &Path| {
        let path_str = path.to_string_lossy();
        !path_str.contains(".git")
            && !path_str.contains(".claude")
            && !path_str.contains(".vscode")
            && !path_str.contains(".DS_Store")
            && !path_str.ends_with(".pdf")
            && !path_str.contains("MAINTAINER.md")
            && !path_str.contains("参考资料")
    })?;

    Ok(WorkspaceInfo {
        id: "ap-physics-em".to_string(),
        name: "ap-physics-em".to_string(),
        path: target.to_string_lossy().to_string(),
        has_claude_md: target.join("CLAUDE.md").exists(),
        last_opened: None,
    })
}

#[tauri::command]
pub fn delete_workspace(workspace_id: &str) -> Result<(), String> {
    if workspace_id == "ap-physics-em" {
        return Err("内置工作区不可删除".to_string());
    }

    let ws_path = workspaces_dir()?.join(workspace_id);
    if !ws_path.exists() {
        return Err(format!("工作区 '{}' 不存在", workspace_id));
    }

    fs::remove_dir_all(&ws_path)
        .map_err(|e| format!("删除工作区失败: {}", e))
}

#[tauri::command]
pub fn update_workspace_meta(workspace_id: &str) -> Result<(), String> {
    let ws_path = workspaces_dir()?.join(workspace_id);
    if !ws_path.exists() {
        return Err(format!("工作区 '{}' 不存在", workspace_id));
    }

    let now = chrono::Local::now().to_rfc3339();
    let meta = WorkspaceMeta {
        last_opened: Some(now),
    };
    write_workspace_meta(&ws_path, &meta)
}

/// Check if a path component should be excluded from zip export
fn should_exclude(path: &Path) -> bool {
    for component in path.components() {
        let s = component.as_os_str().to_string_lossy();
        if s == ".DS_Store"
            || s == ".git"
            || s == "node_modules"
            || s == "__pycache__"
        {
            return true;
        }
    }
    if let Some(name) = path.file_name() {
        let name = name.to_string_lossy();
        if name.ends_with(".tmp") || name == ".DS_Store" {
            return true;
        }
    }
    false
}

/// Recursively collect all files in a directory (returns paths relative to `base`)
fn collect_files_recursive(dir: &Path, base: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read dir {:?}: {}", dir, e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let rel = path.strip_prefix(base).map_err(|e| format!("Strip prefix error: {}", e))?;
        if should_exclude(rel) {
            continue;
        }
        if path.is_dir() {
            result.extend(collect_files_recursive(&path, base)?);
        } else {
            result.push(rel.to_path_buf());
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn export_workspace(workspace_id: String) -> Result<String, String> {
    let base = workspaces_dir()?;
    let ws_path = base.join(&workspace_id);
    if !ws_path.exists() || !ws_path.is_dir() {
        return Err(format!("工作区 '{}' 不存在", workspace_id));
    }

    let download_dir = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
        .ok_or("Cannot determine Downloads directory")?;
    fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Failed to create Downloads dir: {}", e))?;

    let zip_filename = format!("socratic-novel-{}.snworkspace", workspace_id);
    let zip_path = download_dir.join(&zip_filename);

    let file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let files = collect_files_recursive(&ws_path, &ws_path)?;
    for rel_path in &files {
        let full_path = ws_path.join(rel_path);
        let entry_name = rel_path.to_string_lossy().to_string();

        zip_writer
            .start_file(&entry_name, options)
            .map_err(|e| format!("Failed to start zip entry '{}': {}", entry_name, e))?;

        let mut f = fs::File::open(&full_path)
            .map_err(|e| format!("Failed to open file {:?}: {}", full_path, e))?;
        let mut buf = Vec::new();
        f.read_to_end(&mut buf)
            .map_err(|e| format!("Failed to read file {:?}: {}", full_path, e))?;
        zip_writer
            .write_all(&buf)
            .map_err(|e| format!("Failed to write zip data: {}", e))?;
    }

    zip_writer
        .finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;

    Ok(zip_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_workspace(zip_path: String) -> Result<WorkspaceInfo, String> {
    let zip_file = fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // Determine workspace name: check if all entries share a common top-level directory
    let mut top_dirs = std::collections::HashSet::new();
    let mut has_root_files = false;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("Zip entry error: {}", e))?;
        let name = entry.name().to_string();
        if let Some(first) = name.split('/').next() {
            if !first.is_empty() {
                top_dirs.insert(first.to_string());
                // If the entry itself IS at root level (no '/' or only trailing '/')
                if !name.contains('/') || (name.matches('/').count() == 1 && name.ends_with('/')) {
                    // Could be a single top-level dir
                } else if !name.starts_with(&format!("{}/", first)) || top_dirs.len() > 1 {
                    has_root_files = true;
                }
            }
        }
    }

    // If there's exactly one top-level directory and all files are inside it, strip the prefix
    let (ws_name_base, strip_prefix) = if top_dirs.len() == 1 && !has_root_files {
        let dir_name = top_dirs.into_iter().next().unwrap();
        (dir_name.clone(), Some(format!("{}/", dir_name)))
    } else {
        // Use zip filename stem as workspace name
        let stem = Path::new(&zip_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported-workspace")
            .to_string();
        // Strip "socratic-novel-" prefix if present
        let cleaned = stem.strip_prefix("socratic-novel-").unwrap_or(&stem).to_string();
        // Strip ".snworkspace" if it leaked through
        let cleaned = cleaned.strip_suffix(".snworkspace").unwrap_or(&cleaned).to_string();
        (cleaned, None)
    };

    // Find a unique workspace name
    let base = workspaces_dir()?;
    fs::create_dir_all(&base).map_err(|e| format!("Failed to create workspaces dir: {}", e))?;

    let mut ws_name = ws_name_base.clone();
    let mut counter = 2u32;
    while base.join(&ws_name).exists() {
        ws_name = format!("{}-imported-{}", ws_name_base, counter);
        counter += 1;
    }

    let ws_path = base.join(&ws_name);
    fs::create_dir_all(&ws_path).map_err(|e| format!("Failed to create workspace dir: {}", e))?;

    // Extract files
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Zip entry error: {}", e))?;
        let raw_name = entry.name().to_string();

        // Compute the relative path inside the workspace
        let rel_name = if let Some(ref prefix) = strip_prefix {
            if let Some(stripped) = raw_name.strip_prefix(prefix) {
                stripped.to_string()
            } else {
                // Skip the top-level directory entry itself
                continue;
            }
        } else {
            raw_name.clone()
        };

        if rel_name.is_empty() {
            continue;
        }

        // Skip excluded files
        if should_exclude(Path::new(&rel_name)) {
            continue;
        }

        let out_path = ws_path.join(&rel_name);

        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create dir {:?}: {}", out_path, e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;
            fs::write(&out_path, &buf)
                .map_err(|e| format!("Failed to write file {:?}: {}", out_path, e))?;
        }
    }

    // Ensure standard directories exist
    fs::create_dir_all(ws_path.join("teacher")).ok();
    fs::create_dir_all(ws_path.join("materials")).ok();

    let has_claude_md = ws_path.join("CLAUDE.md").exists();
    let meta = read_workspace_meta(&ws_path);

    Ok(WorkspaceInfo {
        id: ws_name.clone(),
        name: ws_name,
        path: ws_path.to_string_lossy().to_string(),
        has_claude_md,
        last_opened: meta.last_opened,
    })
}

fn copy_dir_recursive(
    src: &Path,
    dst: &Path,
    filter: &dyn Fn(&Path) -> bool,
) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }

    fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {:?}: {}", dst, e))?;

    let entries =
        fs::read_dir(src).map_err(|e| format!("Failed to read dir {:?}: {}", src, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();

        if !filter(&src_path) {
            continue;
        }

        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path, filter)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {:?}: {}", src_path, e))?;
        }
    }

    Ok(())
}
