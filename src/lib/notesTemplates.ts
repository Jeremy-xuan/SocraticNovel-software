/**
 * Notes PDF export templates.
 *
 * Each template takes rendered HTML content (from ReactMarkdown)
 * and wraps it in a fully styled standalone HTML page.
 * The page is opened in a new window for print-to-PDF.
 */

// ─── Shared KaTeX + Google Fonts CDN links ─────────────────────
const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
const FONTS_JOURNAL = 'https://fonts.googleapis.com/css2?family=Long+Cang&family=Ma+Shan+Zheng&family=Caveat:wght@400;600;700&display=swap';
const FONTS_MINIMAL = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Noto+Sans+SC:wght@300;400;500;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

export type NoteStyle = 'journal' | 'minimal';

const today = () =>
  new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Open a new window with the themed HTML and trigger print dialog.
 */
export function exportNotesPdf(contentHtml: string, style: NoteStyle) {
  const html = style === 'journal'
    ? journalTemplate(contentHtml)
    : minimalTemplate(contentHtml);

  const win = window.open('', '_blank');
  if (!win) {
    alert('无法打开新窗口，请检查浏览器弹窗设置');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Wait for fonts/KaTeX to load before printing
  setTimeout(() => win.print(), 1500);
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 1: 手记风 (Journal / Handwritten)
// ═══════════════════════════════════════════════════════════════
function journalTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学习笔记</title>
<link rel="stylesheet" href="${KATEX_CSS}">
<link href="${FONTS_JOURNAL}" rel="stylesheet">
<style>
:root {
  --paper: #fdf6e3;
  --ink: #2c1810;
  --ink-light: #5a4030;
  --pen-blue: #1a3a6a;
  --pen-red: #c0392b;
  --highlight-yellow: rgba(255, 230, 80, 0.45);
  --highlight-pink: rgba(255, 150, 180, 0.3);
  --highlight-green: rgba(120, 220, 150, 0.25);
  --line-color: rgba(100, 140, 180, 0.18);
  --margin-color: rgba(200, 80, 80, 0.2);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: "Long Cang", "Ma Shan Zheng", cursive;
  max-width: 800px;
  margin: 0 auto;
  padding: 0;
  color: var(--ink);
  background: var(--paper);
  font-size: 17px;
  line-height: 32px;
}

.page {
  position: relative;
  padding: 20px 50px 40px 80px;
  min-height: 100vh;
  background-image:
    repeating-linear-gradient(
      transparent, transparent 31px, var(--line-color) 31px, var(--line-color) 32px
    );
  background-position: 0 20px;
}
.page::before {
  content: "";
  position: absolute;
  left: 68px;
  top: 0; bottom: 0;
  width: 2px;
  background: var(--margin-color);
}

.title-area {
  text-align: center;
  padding: 16px 0 20px;
  margin-bottom: 12px;
}
.title-area h1 {
  font-family: "Ma Shan Zheng", cursive;
  font-size: 38px;
  color: var(--pen-blue);
  font-weight: 400;
  letter-spacing: 6px;
  display: inline-block;
  border-bottom: 3px solid var(--pen-blue);
  padding-bottom: 4px;
}
.title-area .date {
  font-family: "Caveat", cursive;
  font-size: 16px;
  color: var(--ink-light);
  margin-top: 10px;
}

/* Markdown content styling */
.content h2 {
  font-family: "Ma Shan Zheng", cursive;
  font-size: 24px;
  color: var(--pen-blue);
  font-weight: 400;
  margin: 28px 0 14px -8px;
  padding: 2px 12px;
  display: inline-block;
  background: var(--highlight-yellow);
  border-radius: 2px;
}
.content h3 {
  font-family: "Ma Shan Zheng", cursive;
  font-size: 20px;
  color: var(--pen-red);
  margin: 18px 0 10px;
}
.content p, .content li {
  font-family: "Long Cang", cursive;
  font-size: 17px;
  line-height: 32px;
  color: var(--ink);
}
.content strong {
  color: var(--pen-red);
  text-decoration: underline wavy var(--pen-red);
  text-underline-offset: 3px;
}
.content ul, .content ol { padding-left: 1.5em; margin: 8px 0; }
.content li { margin-bottom: 4px; }
.content li::marker { color: var(--pen-blue); }

/* Formula blocks */
.content .katex-display {
  background: rgba(255,255,255,0.5);
  border: 2px solid var(--pen-blue);
  border-radius: 4px;
  padding: 14px 20px;
  margin: 16px 0;
  transform: rotate(-0.3deg);
}

/* Blockquotes as pitfall boxes */
.content blockquote {
  background: var(--highlight-pink);
  border-left: 3px solid var(--pen-red);
  padding: 8px 14px;
  margin: 10px 0;
  border-radius: 0 4px 4px 0;
}

/* Separator */
.doodle { text-align: center; margin: 20px 0; color: var(--ink-light); font-family: "Caveat", cursive; font-size: 20px; letter-spacing: 8px; opacity: 0.5; }

.footer { text-align: right; padding: 20px 0; font-family: "Caveat", cursive; font-size: 14px; color: var(--ink-light); }

@media print {
  body { background: var(--paper) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { min-height: auto; }
  h2, .katex-display, blockquote { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="page">
  <div class="title-area">
    <h1>学习笔记</h1>
    <div class="date">AP Physics E&M · ${today()}</div>
  </div>
  <div class="content">
    ${content}
  </div>
  <div class="footer">written with 🤍 by SocraticNovel</div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE 2: 极简风 (Minimal)
// ═══════════════════════════════════════════════════════════════
function minimalTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学习笔记</title>
<link rel="stylesheet" href="${KATEX_CSS}">
<link href="${FONTS_MINIMAL}" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: "Noto Sans SC", "Inter", -apple-system, sans-serif;
  max-width: 680px;
  margin: 0 auto;
  padding: 60px 40px 50px;
  color: #1a1a1a;
  background: #fff;
  font-size: 14px;
  line-height: 1.75;
}

header {
  margin-bottom: 48px;
  padding-bottom: 28px;
  border-bottom: 1px solid #e5e5e5;
}
header h1 {
  font-family: "Source Serif 4", "Noto Sans SC", serif;
  font-size: 32px;
  font-weight: 600;
  color: #111;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}
header .meta { font-size: 12px; color: #999; letter-spacing: 0.5px; }

.content h2 {
  font-size: 13px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 3px;
  margin: 36px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.content h3 {
  font-size: 15px;
  font-weight: 500;
  color: #333;
  margin: 20px 0 10px;
}
.content p { color: #444; margin: 8px 0; }
.content strong { color: #222; font-weight: 500; }
.content ul, .content ol { padding-left: 1.5em; margin: 8px 0; color: #555; }
.content li { margin-bottom: 4px; }

.content .katex-display {
  padding: 24px 0;
  margin: 16px 0;
  border-top: 1px solid #f5f5f5;
  border-bottom: 1px solid #f5f5f5;
}

.content blockquote {
  padding: 10px 0 10px 16px;
  border-left: 2px solid #e0e0e0;
  margin: 12px 0;
  color: #555;
}

footer {
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid #e5e5e5;
  font-size: 11px;
  color: #ccc;
  text-align: center;
  letter-spacing: 1px;
}

@media print {
  body { padding: 30px; }
  h2, .katex-display, blockquote { break-inside: avoid; }
}
</style>
</head>
<body>
<header>
  <h1>学习笔记</h1>
  <div class="meta">AP Physics E&M · ${today()}</div>
</header>
<div class="content">
  ${content}
</div>
<footer>SocraticNovel</footer>
</body>
</html>`;
}
