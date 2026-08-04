const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer');

const docsDir = path.join(__dirname, '..', '..', 'docs');
const artifactDocsDir = 'C:\\Users\\yoges\\.gemini\\antigravity-ide\\brain\\a30d3599-1fed-4efb-b2a0-0a1b8b00d58d\\docs';

// Read the combined markdown file
const mdPath = path.join(artifactDocsDir, 'ZeniaHR_Master_Documentation.md');
let mdContent = fs.readFileSync(mdPath, 'utf8');

// 1. Fix image paths (make them relative to the docs folder so Chrome can load them)
const absoluteScreenshotPathPrefix = '/C:/Users/yoges/.gemini/antigravity-ide/brain/a30d3599-1fed-4efb-b2a0-0a1b8b00d58d/docs/screenshots/';
mdContent = mdContent.split(absoluteScreenshotPathPrefix).join('screenshots/');

// 2. Convert Mermaid code blocks to mermaid divs for the library to render
mdContent = mdContent.replace(/```mermaid\n([\s\S]*?)```/g, '<div class="mermaid">\n$1\n</div>');

// 3. Convert Markdown to HTML
const htmlBody = marked.parse(mdContent);

// 4. Wrap in a styling template
const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>ZeniaHR Documentation</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: auto; padding: 20px; }
        h1, h2, h3 { color: #2c3e50; margin-top: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        h1 { font-size: 2.2em; text-align: center; border-bottom: none; }
        img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; padding: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.05); margin-top: 20px; margin-bottom: 20px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f8f9fa; }
        code { background-color: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        pre { background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .mermaid { text-align: center; margin: 30px 0; }
        /* Page breaks for PDF */
        h1, h2 { page-break-after: avoid; }
        table, img { page-break-inside: avoid; }
    </style>
</head>
<body>
    ${htmlBody}
    
    <!-- Include Mermaid.js -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({ startOnLoad: true, theme: 'default' });
    </script>
</body>
</html>
`;

const tempHtmlPath = path.join(artifactDocsDir, 'temp.html');
fs.writeFileSync(tempHtmlPath, fullHtml);

async function generatePdf() {
    console.log('Launching browser to generate PDF...');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Load the HTML file via file:// protocol
    const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');
    console.log('Loading temp HTML: ' + fileUrl);
    
    // Wait for networkidle0 so Mermaid scripts have time to execute and render SVGs
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Extra buffer to ensure rendering is visually complete
    await new Promise(r => setTimeout(r, 2000));
    
    const pdfPath = path.join(artifactDocsDir, 'ZeniaHR_Master_Documentation.pdf');
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
    
    console.log('PDF Successfully Generated at:', pdfPath);
    await browser.close();
    
    // Cleanup temp HTML
    fs.unlinkSync(tempHtmlPath);
}

generatePdf().catch(console.error);
