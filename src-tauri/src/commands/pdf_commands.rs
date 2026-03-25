use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use base64::Engine as _;
use crate::ai::types::{Message, ContentBlock, ImageSource};

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

// ─── PDF Page Rendering (pdftoppm) ───────────────────────────────

/// Check if pdftoppm is available on the system
fn find_pdftoppm() -> Option<String> {
    let candidates = [
        "pdftoppm",
        "/opt/homebrew/bin/pdftoppm",
        "/usr/local/bin/pdftoppm",
        "/usr/bin/pdftoppm",
    ];
    for cmd in candidates {
        if std::process::Command::new(cmd)
            .arg("-v")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok()
        {
            return Some(cmd.to_string());
        }
    }
    None
}

/// Render a single PDF page to a JPEG image using pdftoppm.
/// Returns base64-encoded JPEG data.
fn render_page_to_base64(pdf_path: &str, page_number: usize, dpi: u32) -> Result<String, String> {
    let pdftoppm = find_pdftoppm()
        .ok_or("pdftoppm not found. Install poppler: brew install poppler")?;

    let temp_dir = std::env::temp_dir().join("socratic-novel-pdf");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let output_prefix = temp_dir.join(format!("page_{}", page_number));

    let status = std::process::Command::new(&pdftoppm)
        .args([
            "-jpeg",
            "-r", &dpi.to_string(),
            "-f", &page_number.to_string(),
            "-l", &page_number.to_string(),
            "-singlefile",
            pdf_path,
            output_prefix.to_str().unwrap_or("page"),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .status()
        .map_err(|e| format!("Failed to run pdftoppm: {}", e))?;

    if !status.success() {
        return Err(format!("pdftoppm failed with status: {}", status));
    }

    let jpeg_path = temp_dir.join(format!("page_{}.jpg", page_number));
    if !jpeg_path.exists() {
        return Err(format!("Rendered image not found at {:?}", jpeg_path));
    }

    let image_bytes = std::fs::read(&jpeg_path)
        .map_err(|e| format!("Failed to read rendered image: {}", e))?;

    // Cleanup temp file
    let _ = std::fs::remove_file(&jpeg_path);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
    Ok(b64)
}

/// Check if pdftoppm is available
#[tauri::command]
pub fn check_pdftoppm() -> bool {
    find_pdftoppm().is_some()
}

/// Render a PDF page to base64 JPEG
#[tauri::command]
pub fn render_pdf_page(pdf_path: String, page_number: usize) -> Result<String, String> {
    render_page_to_base64(&pdf_path, page_number, 200)
}

// ─── AI Enhancement ──────────────────────────────────────────────

const AI_TEXT_ENHANCE_PROMPT: &str = r#"你是一个教材文本格式化专家。将以下从 PDF 提取的粗糙文本转换为干净的 Markdown 格式。

要求：
1. 识别并正确格式化标题（# ## ###）
2. 识别数学公式，转为 LaTeX 格式（行内用 $...$，独立公式用 $$...$$）
3. 保持段落结构
4. 修复断行、连字符问题
5. 保留原文语言（不要翻译）
6. 如果有表格，转为 Markdown 表格

只返回格式化后的 Markdown，不要解释。"#;

const AI_VISION_ENHANCE_PROMPT: &str = r#"你是一个教材 OCR 专家。请仔细查看这个 PDF 页面图片，将其内容完整转录为 Markdown 格式。

要求：
1. 识别并正确格式化标题（# ## ###）
2. 所有数学公式转为 LaTeX（行内 $...$，独立公式 $$...$$）
3. 图表用文字描述（[图: 描述]）
4. 表格转为 Markdown 表格
5. 保持原文语言
6. 保持文字顺序和结构

只返回 Markdown 内容，不要解释。"#;

/// AI text enhancement: send raw text to AI for formatting as proper Markdown
#[tauri::command]
pub async fn ai_enhance_text(
    text: String,
    api_key: String,
    provider: String,
    model: String,
) -> Result<String, String> {
    let messages = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: format!("请将以下 PDF 提取文本格式化为 Markdown：\n\n{}", text),
        }],
    }];

    crate::ai::runtime::call_ai_simple(
        &api_key,
        &provider,
        &model,
        AI_TEXT_ENHANCE_PROMPT,
        messages,
    )
    .await
}

/// AI Vision enhancement: render PDF page to image, send to Vision API
#[tauri::command]
pub async fn ai_vision_enhance_page(
    pdf_path: String,
    page_number: usize,
    api_key: String,
    provider: String,
    model: String,
) -> Result<String, String> {
    // Render page to image
    let image_b64 = render_page_to_base64(&pdf_path, page_number, 300)?;

    let messages = vec![Message {
        role: "user".to_string(),
        content: vec![
            ContentBlock::Image {
                source: ImageSource::Base64 {
                    media_type: "image/jpeg".to_string(),
                    data: image_b64,
                },
            },
            ContentBlock::Text {
                text: "请转录这个 PDF 页面的完整内容。".to_string(),
            },
        ],
    }];

    crate::ai::runtime::call_ai_simple(
        &api_key,
        &provider,
        &model,
        AI_VISION_ENHANCE_PROMPT,
        messages,
    )
    .await
}
