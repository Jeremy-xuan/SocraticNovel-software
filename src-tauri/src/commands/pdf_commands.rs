use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfPage {
    pub page_number: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdfExtractResult {
    pub filename: String,
    pub total_pages: usize,
    pub pages: Vec<PdfPage>,
    #[serde(rename = "fullText")]
    pub full_text: String,
}

// ─── Extraction ──────────────────────────────────────────────────

fn extract_from_path(path: &str) -> Result<PdfExtractResult, String> {
    let filepath = PathBuf::from(path);
    if !filepath.exists() {
        return Err(format!("File not found: {}", path));
    }

    let filename = filepath
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Extract full text
    let bytes = std::fs::read(&filepath)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let full_text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))?;

    // Split into pages by form-feed character (common PDF page separator)
    // pdf-extract doesn't provide per-page extraction directly,
    // so we use form-feed (\x0C) as page delimiter
    let raw_pages: Vec<&str> = full_text.split('\u{000C}').collect();
    let pages: Vec<PdfPage> = raw_pages
        .iter()
        .enumerate()
        .map(|(i, text)| PdfPage {
            page_number: i + 1,
            text: text.trim().to_string(),
        })
        .filter(|p| !p.text.is_empty())
        .collect();

    let total_pages = pages.len();

    Ok(PdfExtractResult {
        filename,
        total_pages,
        pages,
        full_text: full_text.trim().to_string(),
    })
}

/// Convert extracted text to clean Markdown
fn text_to_markdown(result: &PdfExtractResult) -> String {
    let mut md = String::new();
    md.push_str(&format!("# {}\n\n", result.filename.replace(".pdf", "").replace(".PDF", "")));
    md.push_str(&format!("> 从 PDF 自动提取，共 {} 页\n\n", result.total_pages));

    for page in &result.pages {
        md.push_str(&format!("---\n\n## 第 {} 页\n\n", page.page_number));
        // Clean up the text: normalize whitespace, preserve paragraph breaks
        let cleaned = clean_text(&page.text);
        md.push_str(&cleaned);
        md.push_str("\n\n");
    }

    md
}

/// Clean extracted text: normalize spacing, remove excessive blank lines
fn clean_text(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut result = Vec::new();
    let mut prev_empty = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !prev_empty {
                result.push("");
                prev_empty = true;
            }
        } else {
            result.push(trimmed);
            prev_empty = false;
        }
    }

    result.join("\n")
}

// ─── Tauri Commands ──────────────────────────────────────────────

/// Extract text from a PDF file, returns structured result with pages
#[tauri::command]
pub fn extract_pdf_text(path: String) -> Result<PdfExtractResult, String> {
    extract_from_path(&path)
}

/// Import a PDF into workspace as Markdown
#[tauri::command]
pub fn import_pdf_to_workspace(
    pdf_path: String,
    workspace_path: String,
    target_name: String,
) -> Result<String, String> {
    let result = extract_from_path(&pdf_path)?;
    let markdown = text_to_markdown(&result);

    // Determine target path in workspace
    let target_dir = PathBuf::from(&workspace_path).join("materials").join("imported_md");
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let safe_name = target_name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let filename = if safe_name.ends_with(".md") {
        safe_name
    } else {
        format!("{}.md", safe_name)
    };

    let target_path = target_dir.join(&filename);
    std::fs::write(&target_path, &markdown)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}
