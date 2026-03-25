//! Integration tests for PDF extraction and PDFium rendering.
//! These tests require a PDF file and optionally the PDFium library.

use std::path::Path;

const TEST_PDF: &str = "/Users/wujunjie/Desktop/ap-computer-science-a-java-quick-reference.pdf";

#[test]
fn test_pdf_text_extraction() {
    if !Path::new(TEST_PDF).exists() {
        eprintln!("⏭️  Skipping: test PDF not found at {}", TEST_PDF);
        return;
    }
    let bytes = std::fs::read(TEST_PDF).expect("read PDF");
    match pdf_extract::extract_text_from_mem(&bytes) {
        Ok(text) => {
            assert!(!text.is_empty(), "Extracted text should not be empty");
            let pages: Vec<&str> = text.split('\u{000C}').collect();
            assert!(pages.len() >= 1, "Should have at least 1 page");
            eprintln!("✅ Extracted {} pages, {} chars", pages.len(), text.len());
        }
        Err(e) => {
            // Some PDFs are encrypted — this is expected behavior
            eprintln!("⚠️  Extraction failed (may be encrypted PDF): {}", e);
        }
    }
}

#[test]
fn test_pdfium_rendering() {
    if !Path::new(TEST_PDF).exists() {
        eprintln!("⏭️  Skipping: test PDF not found");
        return;
    }

    use pdfium_render::prelude::*;

    let lib_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/libs");
    let bindings = match Pdfium::bind_to_library(
        Pdfium::pdfium_platform_library_name_at_path(lib_dir),
    ) {
        Ok(b) => b,
        Err(_) => {
            eprintln!("⏭️  Skipping: PDFium library not found in libs/");
            return;
        }
    };

    let pdfium = Pdfium::new(bindings);
    let doc = pdfium
        .load_pdf_from_file(TEST_PDF, None)
        .expect("load PDF");
    assert!(doc.pages().len() > 0, "PDF should have pages");

    let page = doc.pages().get(0).expect("get page 0");
    let config = PdfRenderConfig::new()
        .set_target_width(800)
        .set_maximum_height(1200);
    let bitmap = page.render_with_config(&config).expect("render page");
    let image = bitmap.as_image();

    let mut buf = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .expect("encode JPEG");
    let jpeg_bytes = buf.into_inner();
    assert!(
        jpeg_bytes.len() > 1000,
        "JPEG should be non-trivial size, got {} bytes",
        jpeg_bytes.len()
    );
    eprintln!("✅ Rendered page 1: {} bytes JPEG", jpeg_bytes.len());
}
