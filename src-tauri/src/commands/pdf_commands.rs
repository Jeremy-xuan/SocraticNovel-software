use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;
use base64::Engine as _;
use pdfium_render::prelude::*;
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
    /// Text quality score 0.0-1.0. Below 0.5 suggests garbled/encrypted fonts.
    #[serde(rename = "qualityScore")]
    pub quality_score: f64,
    /// True if the text appears garbled (anti-copy font encoding detected)
    #[serde(rename = "isGarbled")]
    pub is_garbled: bool,
}

// ─── Extraction ──────────────────────────────────────────────────

/// Try pdftotext (poppler) first — much faster and more robust for complex PDFs.
/// Falls back to pdf-extract (pure Rust) if pdftotext is not installed.
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

    // Try pdftotext (poppler) first
    if let Ok(result) = extract_with_pdftotext(path, &filename) {
        return Ok(result);
    }

    // Fallback: pure Rust pdf-extract
    extract_with_pdf_extract(path, &filename)
}

/// Extract using poppler's pdftotext command-line tool
fn extract_with_pdftotext(path: &str, filename: &str) -> Result<PdfExtractResult, String> {
    use std::process::Command;

    // Check if pdftotext exists
    let output = Command::new("pdftotext")
        .arg("-layout")
        .arg(path)
        .arg("-")
        .output()
        .map_err(|e| format!("pdftotext not available: {}", e))?;

    if !output.status.success() {
        return Err(format!("pdftotext failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let full_text = String::from_utf8_lossy(&output.stdout).to_string();

    // Split into pages by form-feed character
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

    let (quality_score, is_garbled) = detect_text_quality(&full_text);

    Ok(PdfExtractResult {
        filename: filename.to_string(),
        total_pages,
        pages,
        full_text: full_text.trim().to_string(),
        quality_score,
        is_garbled,
    })
}

/// Extract using pure Rust pdf-extract crate (fallback)
fn extract_with_pdf_extract(path: &str, filename: &str) -> Result<PdfExtractResult, String> {
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let full_text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("Failed to extract PDF text: {}", e))?;

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

    let (quality_score, is_garbled) = detect_text_quality(&full_text);

    Ok(PdfExtractResult {
        filename: filename.to_string(),
        total_pages,
        pages,
        full_text: full_text.trim().to_string(),
        quality_score,
        is_garbled,
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

/// Detect if extracted text is garbled (e.g., anti-copy font encoding).
/// Returns (quality_score, is_garbled).
/// Samples multiple positions in the text to handle mixed-quality PDFs.
fn detect_text_quality(text: &str) -> (f64, bool) {
    if text.is_empty() {
        return (0.0, true);
    }

    // Sample from multiple positions: 10%, 25%, 50%, 75%
    let positions = [text.len() / 10, text.len() / 4, text.len() / 2, text.len() * 3 / 4];
    let mut scores: Vec<f64> = Vec::new();

    for &start in &positions {
        let end = (start + 3000).min(text.len());
        let sample = &text[start..end];
        scores.push(score_sample(sample));
    }

    // Use the minimum score — if any section is garbled, flag it
    let min_score = scores.iter().cloned().fold(f64::INFINITY, f64::min);
    let avg_score = scores.iter().sum::<f64>() / scores.len() as f64;
    // Weighted: 60% min + 40% avg (garbled sections should dominate)
    let quality = min_score * 0.6 + avg_score * 0.4;
    let is_garbled = quality < 0.5;
    (quality, is_garbled)
}

/// Score a text sample for readability (0.0 = garbled, 1.0 = perfect)
fn score_sample(sample: &str) -> f64 {
    let ascii_chars: Vec<char> = sample.chars().filter(|c| c.is_ascii_alphabetic()).collect();
    if ascii_chars.len() < 20 {
        // Too few ASCII chars to judge — might be all-CJK, consider OK
        return 0.8;
    }

    // Test 1: Common English word detection
    let common_words = [
        "the", "and", "for", "that", "this", "with", "from", "which", "are", "was",
        "not", "but", "have", "has", "can", "will", "all", "each", "you", "about",
        "one", "two", "what", "when", "how", "its", "into", "been", "than", "may",
    ];
    let lower_sample = sample.to_lowercase();
    let word_hits: usize = common_words.iter()
        .filter(|w| lower_sample.contains(**w))
        .count();
    let word_score = (word_hits as f64 / 10.0).min(1.0);

    // Test 2: Uppercase ratio (garbled text tends to have abnormally high uppercase)
    let upper_count = ascii_chars.iter().filter(|c| c.is_ascii_uppercase()).count();
    let upper_ratio = upper_count as f64 / ascii_chars.len() as f64;
    // Normal English: ~5-15% uppercase. Garbled: often >40%
    let case_score = if upper_ratio > 0.4 { 0.2 } else if upper_ratio > 0.3 { 0.5 } else { 1.0 };

    // Test 3: Consecutive consonant detection (garbled text has weird consonant clusters)
    let consonants = "bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ";
    let mut max_consec = 0usize;
    let mut cur_consec = 0usize;
    for ch in sample.chars() {
        if consonants.contains(ch) {
            cur_consec += 1;
            max_consec = max_consec.max(cur_consec);
        } else {
            cur_consec = 0;
        }
    }
    let consec_score = if max_consec > 8 { 0.2 } else if max_consec > 6 { 0.5 } else { 1.0 };

    word_score * 0.5 + case_score * 0.3 + consec_score * 0.2
}

// ─── Tauri Commands ──────────────────────────────────────────────

/// Extract text from a PDF file, returns structured result with pages.
/// Note: Accepts arbitrary paths intentionally — users pick files via the
/// native dialog (tauri-plugin-dialog), which provides explicit consent.
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

// ─── PDF Page Rendering (PDFium) ─────────────────────────────────

/// Cached path to PDFium shared library
static PDFIUM_PATH: OnceLock<Option<String>> = OnceLock::new();

/// Find the PDFium shared library on the system
fn find_pdfium_library() -> Option<String> {
    // Platform-specific library name
    #[cfg(target_os = "macos")]
    let lib_names = ["libpdfium.dylib"];
    #[cfg(target_os = "linux")]
    let lib_names = ["libpdfium.so"];
    #[cfg(target_os = "windows")]
    let lib_names = ["pdfium.dll"];

    // Search paths: bundled with app, then common locations
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    // 1. Next to the executable (for bundled apps)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            search_dirs.push(dir.to_path_buf());
            // macOS .app bundle: Contents/MacOS/ → Contents/Frameworks/
            if let Some(parent) = dir.parent() {
                search_dirs.push(parent.join("Frameworks"));
                search_dirs.push(parent.join("Resources"));
            }
        }
    }

    // 2. Project directory (for development)
    search_dirs.push(PathBuf::from("libs"));
    search_dirs.push(PathBuf::from("../libs"));

    // 3. Common system paths
    #[cfg(target_os = "macos")]
    {
        search_dirs.push(PathBuf::from("/opt/homebrew/lib"));
        search_dirs.push(PathBuf::from("/usr/local/lib"));
    }
    #[cfg(target_os = "linux")]
    {
        search_dirs.push(PathBuf::from("/usr/lib"));
        search_dirs.push(PathBuf::from("/usr/local/lib"));
    }

    for dir in &search_dirs {
        for name in &lib_names {
            let path = dir.join(name);
            if path.exists() {
                return Some(dir.to_string_lossy().to_string());
            }
        }
    }

    None
}

/// Get the PDFium library path (cached)
fn get_pdfium_path() -> Option<&'static String> {
    PDFIUM_PATH.get_or_init(|| find_pdfium_library()).as_ref()
}

/// Render a single PDF page to JPEG using PDFium. Returns base64-encoded data.
fn render_page_with_pdfium(pdf_path: &str, page_number: usize, dpi: u32) -> Result<String, String> {
    let lib_dir = get_pdfium_path()
        .ok_or("PDFium library not found. Run: scripts/download-pdfium.sh")?;

    let pdfium = Pdfium::new(
        Pdfium::bind_to_library(
            Pdfium::pdfium_platform_library_name_at_path(lib_dir)
        ).map_err(|e| format!("Failed to load PDFium: {}", e))?
    );

    let document = pdfium
        .load_pdf_from_file(pdf_path, None)
        .map_err(|e| format!("Failed to open PDF: {}", e))?;

    let page_index = page_number.checked_sub(1).unwrap_or(0);
    let page = document
        .pages()
        .get(page_index as u16)
        .map_err(|e| format!("Failed to get page {}: {}", page_number, e))?;

    // Render at specified DPI
    let scale = dpi as f32 / 72.0;
    let width = (page.width().value * scale) as u16;
    let height = (page.height().value * scale) as u16;

    let bitmap = page
        .render_with_config(&PdfRenderConfig::new().set_target_width(width as i32).set_maximum_height(height as i32))
        .map_err(|e| format!("Failed to render page: {}", e))?;

    let image = bitmap.as_image();

    // Encode to JPEG
    let mut buf = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(b64)
}

/// Fallback: render using pdftoppm (system command)
fn render_page_with_pdftoppm(pdf_path: &str, page_number: usize, dpi: u32) -> Result<String, String> {
    let pdftoppm = find_pdftoppm()
        .ok_or("No PDF renderer available. Install PDFium or poppler.")?;

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
    let _ = std::fs::remove_file(&jpeg_path);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
    Ok(b64)
}

fn find_pdftoppm() -> Option<String> {
    #[cfg(target_os = "macos")]
    let candidates = vec!["pdftoppm", "/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"];

    #[cfg(target_os = "linux")]
    let candidates = vec!["pdftoppm", "/usr/bin/pdftoppm", "/usr/local/bin/pdftoppm"];

    #[cfg(target_os = "windows")]
    let candidates = vec!["pdftoppm.exe", "pdftoppm"];

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

/// Render a page using the best available renderer (PDFium → pdftoppm fallback)
fn render_page_to_base64(pdf_path: &str, page_number: usize, dpi: u32) -> Result<String, String> {
    // Try PDFium first
    match render_page_with_pdfium(pdf_path, page_number, dpi) {
        Ok(b64) => return Ok(b64),
        Err(_) => {}
    }
    // Fallback to pdftoppm
    render_page_with_pdftoppm(pdf_path, page_number, dpi)
}

/// Check rendering capability status
#[tauri::command]
pub fn check_pdf_renderer() -> serde_json::Value {
    let has_pdfium = get_pdfium_path().is_some();
    let has_pdftoppm = find_pdftoppm().is_some();
    serde_json::json!({
        "hasPdfium": has_pdfium,
        "hasPdftoppm": has_pdftoppm,
        "available": has_pdfium || has_pdftoppm,
        "renderer": if has_pdfium { "pdfium" } else if has_pdftoppm { "pdftoppm" } else { "none" },
    })
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
        None,
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
        None,
    )
    .await
}

// ─── Apple Vision OCR — REMOVED ──────────────────────────────
// Replaced by AI Vision API (GPT-4o-mini etc.) which produces
// far better results for mathematical equations.

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_pdf_speed() {
        let path = "/Users/wujunjie/Desktop/AP/AP-力学/TD 2025版 AP 物理C力学  刷题册.pdf";
        if !PathBuf::from(path).exists() {
            println!("Skip: test file not found");
            return;
        }
        let start = Instant::now();
        let result = extract_from_path(path).expect("extraction failed");
        let elapsed = start.elapsed();
        println!("PDF: {} pages, {} chars, quality={:.2}, garbled={}, took {:?}",
            result.total_pages, result.full_text.len(), result.quality_score, result.is_garbled, elapsed);
        // 刷题册 uses anti-copy font encoding
        assert!(result.is_garbled, "刷题册 should be detected as garbled");
    }

    #[test]
    fn test_pdf_pdftotext_vs_fallback() {
        let path = "/Users/wujunjie/Desktop/AP/AP-力学/TD 2025版 AP 物理C力学  讲义.pdf";
        if !PathBuf::from(path).exists() {
            println!("Skip: test file not found");
            return;
        }

        let start = Instant::now();
        let result = extract_with_pdftotext(path, "讲义.pdf");
        let elapsed = start.elapsed();
        match &result {
            Ok(r) => println!("pdftotext: {} pages, {} chars, quality={:.2}, garbled={}, {:?}",
                r.total_pages, r.full_text.len(), r.quality_score, r.is_garbled, elapsed),
            Err(e) => println!("pdftotext failed: {}", e),
        }
        assert!(result.is_ok(), "pdftotext should work");
        // 讲义 also uses anti-copy font encoding
        assert!(result.unwrap().is_garbled, "讲义 should be detected as garbled");
    }

    #[test]
    fn test_pdf_good_quality() {
        let path = "/Users/wujunjie/Desktop/AP/AP-力学/TD 2025版 AP 物理C力学  练习册.pdf";
        if !PathBuf::from(path).exists() {
            println!("Skip: test file not found");
            return;
        }
        let result = extract_from_path(path).expect("extraction failed");
        println!("练习册: {} pages, quality={:.2}, garbled={}", result.total_pages, result.quality_score, result.is_garbled);
        // 练习册 has normal font encoding
        assert!(!result.is_garbled, "练习册 should NOT be detected as garbled");
    }
}
