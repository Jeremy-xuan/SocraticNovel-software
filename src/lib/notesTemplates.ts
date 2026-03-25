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
// TEMPLATE 2: 极简风 (Minimal — Notion/Craft inspired)
// ═══════════════════════════════════════════════════════════════
function minimalTemplate(content: string): string {
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>学习笔记</title>
<link rel="stylesheet" href="${KATEX_CSS}">
<link href="${FONTS_MINIMAL}" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --text-primary: #1a1a2e;
  --text-secondary: #4a4a68;
  --text-body: #333333;
  --accent: #6366f1;
  --accent-light: rgba(99, 102, 241, 0.07);
  --accent-border: rgba(99, 102, 241, 0.3);
  --bg: #ffffff;
  --surface: #f8f9fa;
  --border: #e2e8f0;
  --border-light: #f1f5f9;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: "Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 720px;
  margin: 0 auto;
  padding: 72px 48px 60px;
  color: var(--text-primary);
  background: var(--bg);
  font-size: 14px;
  line-height: 1.8;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ─── Header ─── */
header {
  margin-bottom: 48px;
  padding-bottom: 32px;
  position: relative;
}
header::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, var(--accent), var(--border) 40%, transparent);
}
header h1 {
  font-family: "Source Serif 4", "Noto Sans SC", Georgia, serif;
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
  line-height: 1.35;
  margin-bottom: 4px;
  position: relative;
  padding-left: 18px;
}
header h1::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  width: 4px;
  height: 28px;
  background: var(--accent);
  border-radius: 2px;
}
header .meta {
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
  padding-left: 18px;
  margin-top: 8px;
}

/* ─── Content headings ─── */
.content h2 {
  font-family: "Inter", "Noto Sans SC", sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 2.5px;
  margin: 40px 0 18px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--border);
  position: relative;
}
.content h2::after {
  content: "";
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 40px;
  height: 2px;
  background: var(--accent);
}
.content h3 {
  font-family: "Inter", "Noto Sans SC", sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 28px 0 12px;
  padding-left: 14px;
  position: relative;
}
.content h3::before {
  content: "";
  position: absolute;
  left: 0;
  top: 2px;
  width: 3px;
  height: calc(100% - 4px);
  background: var(--accent);
  border-radius: 2px;
}

/* ─── Body text ─── */
.content p {
  color: var(--text-body);
  margin: 12px 0;
  line-height: 1.8;
}
.content strong {
  color: var(--text-primary);
  font-weight: 600;
}
.content em {
  color: var(--text-secondary);
}
.content a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid var(--accent-border);
}

/* ─── Lists ─── */
.content ul {
  padding-left: 1.5em;
  margin: 12px 0;
  list-style: none;
}
.content ul li {
  position: relative;
  padding-left: 8px;
  margin-bottom: 6px;
  color: var(--text-body);
}
.content ul li::before {
  content: "▪";
  position: absolute;
  left: -1.2em;
  color: var(--accent);
  font-size: 10px;
  top: 2px;
}
.content ol {
  padding-left: 1.5em;
  margin: 12px 0;
}
.content ol li {
  margin-bottom: 6px;
  color: var(--text-body);
  padding-left: 4px;
}
.content ol li::marker {
  color: var(--accent);
  font-weight: 600;
  font-size: 13px;
}

/* ─── Math formulas ─── */
.content .katex-display {
  background: var(--surface);
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
  padding: 20px 24px;
  margin: 20px 0;
  overflow-x: auto;
}
.content .katex {
  color: #4338ca;
}

/* ─── Blockquotes ─── */
.content blockquote {
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  padding: 14px 20px;
  margin: 16px 0;
  border-radius: 0 8px 8px 0;
  font-style: italic;
  color: var(--text-secondary);
}
.content blockquote p {
  color: var(--text-secondary);
  margin: 4px 0;
}

/* ─── Code ─── */
.content pre {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin: 16px 0;
  overflow-x: auto;
  font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}
.content code {
  font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
  font-size: 0.9em;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--accent);
}
.content pre code {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

/* ─── Tables ─── */
.content table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 13px;
}
.content thead th {
  background: var(--surface);
  font-weight: 600;
  color: var(--text-primary);
  text-align: left;
  padding: 10px 14px;
  border-bottom: 2px solid var(--border);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.content tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-body);
}
.content tbody tr:nth-child(even) {
  background: var(--surface);
}

/* ─── Horizontal rules ─── */
.content hr {
  border: none;
  height: 1px;
  margin: 32px auto;
  width: 60%;
  background: linear-gradient(90deg, transparent, var(--border), var(--accent-border), var(--border), transparent);
}

/* ─── Images ─── */
.content img {
  max-width: 100%;
  border-radius: 8px;
  margin: 16px 0;
}

/* ─── Footer ─── */
footer {
  margin-top: 64px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #b0b0b8;
  letter-spacing: 0.3px;
}
footer .brand { font-weight: 500; }
footer .timestamp { font-variant-numeric: tabular-nums; }

/* ─── Print optimizations ─── */
@media print {
  body {
    padding: 40px 36px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header, .content h2, .content h3, .content blockquote,
  .content .katex-display, .content pre, .content table {
    break-inside: avoid;
  }
  .content h2, .content h3 {
    break-after: avoid;
  }
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
<footer>
  <span class="brand">Generated by SocraticNovel</span>
  <span class="timestamp">${timestamp}</span>
</footer>
</body>
</html>`;
}
