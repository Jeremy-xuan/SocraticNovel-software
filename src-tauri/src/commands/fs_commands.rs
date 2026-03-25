use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Get the base workspaces directory: ~/socratic-novel-软件开发/workspaces/
fn workspaces_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join("socratic-novel-软件开发")
        .join("workspaces")
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
    id: String,
    name: String,
    path: String,
    has_claude_md: bool,
    last_opened: Option<String>,
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<WorkspaceInfo>, String> {
    let base = workspaces_dir();
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
    let base = workspaces_dir();
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
    let base = workspaces_dir();
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

    let ws_path = workspaces_dir().join(workspace_id);
    if !ws_path.exists() {
        return Err(format!("工作区 '{}' 不存在", workspace_id));
    }

    fs::remove_dir_all(&ws_path)
        .map_err(|e| format!("删除工作区失败: {}", e))
}

#[tauri::command]
pub fn update_workspace_meta(workspace_id: &str) -> Result<(), String> {
    let ws_path = workspaces_dir().join(workspace_id);
    if !ws_path.exists() {
        return Err(format!("工作区 '{}' 不存在", workspace_id));
    }

    let now = chrono::Local::now().to_rfc3339();
    let meta = WorkspaceMeta {
        last_opened: Some(now),
    };
    write_workspace_meta(&ws_path, &meta)
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
