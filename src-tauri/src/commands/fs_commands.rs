use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Get the base workspaces directory: ~/SocraticNovel/workspaces/
fn workspaces_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join("SocraticNovel")
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
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
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

#[derive(Serialize)]
pub struct WorkspaceInfo {
    id: String,
    name: String,
    path: String,
    has_claude_md: bool,
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
            workspaces.push(WorkspaceInfo {
                id: name.clone(),
                name,
                path,
                has_claude_md,
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
    })
}

#[tauri::command]
pub fn init_builtin_workspace() -> Result<WorkspaceInfo, String> {
    let base = workspaces_dir();
    let target = base.join("ap-physics-em");

    if target.exists() {
        return Ok(WorkspaceInfo {
            id: "ap-physics-em".to_string(),
            name: "ap-physics-em".to_string(),
            path: target.to_string_lossy().to_string(),
            has_claude_md: target.join("CLAUDE.md").exists(),
        });
    }

    // Create the workspace directory structure
    fs::create_dir_all(&target).map_err(|e| format!("Failed to create workspace: {}", e))?;

    // TODO: Copy builtin workspace files from app resources
    // For now, create a placeholder CLAUDE.md
    let placeholder = "# AP Physics C: E&M — SocraticNovel\n\n> 此为占位文件。请从 SocraticNovel 项目复制完整的 workspace 文件。\n";
    fs::write(target.join("CLAUDE.md"), placeholder)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    fs::create_dir_all(target.join("teacher/runtime")).map_err(|e| format!("{}", e))?;
    fs::create_dir_all(target.join("teacher/config")).map_err(|e| format!("{}", e))?;
    fs::create_dir_all(target.join("teacher/characters")).map_err(|e| format!("{}", e))?;
    fs::create_dir_all(target.join("materials")).map_err(|e| format!("{}", e))?;

    Ok(WorkspaceInfo {
        id: "ap-physics-em".to_string(),
        name: "ap-physics-em".to_string(),
        path: target.to_string_lossy().to_string(),
        has_claude_md: true,
    })
}
