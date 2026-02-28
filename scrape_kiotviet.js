const fs = require('fs');
const { JSDOM } = require('jsdom');
const TurndownService = require('turndown');

const urls = [
    { url: 'https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nhan-vien/quan-ly-nhan-vien', filename: 'quanlynhanvien.md' },
    { url: 'https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nhan-vien/quan-ly-cham-cong/', filename: 'quanlychamcong.md' },
    { url: 'https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nhan-vien/quan-ly-hoa-hong', filename: 'quanlyhoahong.md' },
    { url: 'https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nhan-vien/quan-ly-tinh-luong/', filename: 'quanlytinhluong.md' }
];

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});

turndownService.addRule('images', {
    filter: 'img',
    replacement: function (content, node) {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        const title = node.getAttribute('title') || '';
        const description = [alt, title].filter(Boolean).join(' - ');

        let md = `\n\n![${description}](${src})\n`;
        md += `*<div style="padding: 10px; background: #f0f0f0; border: 1px solid #ccc; font-style: italic; color: #333;">`;
        md += `[Mô tả ảnh cho AI: Hình ảnh minh họa với đường dẫn: ${src}`;
        if (description) md += ` | Nội dung: ${description}`;
        md += `]</div>*\n\n`;
        return md;
    }
});

turndownService.remove(['script', 'style', 'iframe', 'noscript', 'nav', 'footer', 'header', 'aside']);

async function scrapeDocs() {
    for (const item of urls) {
        console.log(`Fetching ${item.url}...`);
        try {
            const response = await fetch(item.url);
            const html = await response.text();

            const dom = new JSDOM(html);
            const doc = dom.window.document;

            // Re-inject Title if not present in contentNode
            let h1 = doc.querySelector('h1.supportMain-content_article-title') || doc.querySelector('h1');
            let h1Text = h1 ? h1.textContent.trim() : '';

            // Clean up unnecessary elements just in case they are nested
            const removeSelectors = ['.supportMain-content_sidebar', '.supportMain-breadcrumb', '.share-buttons', '#sidebar', '.sidebar'];
            removeSelectors.forEach(selector => {
                doc.querySelectorAll(selector).forEach(el => el.remove());
            });

            // Let's use article-wrapper if available
            let contentNode = doc.querySelector('.supportMain-content_article-wrapper')
                || doc.querySelector('.supportMain-content_article')
                || doc.querySelector('article')
                || doc.querySelector('.article-content')
                || doc.body;

            let markdown = '';

            // To ensure we get exactly `# **Title**`
            if (h1Text) {
                markdown += `# **${h1Text}**\n\n`;
            }

            markdown += turndownService.turndown(contentNode.innerHTML);

            // Now Let's post-process the markdown to remove everything before the H1 text (if it appeared as # **H1Text** or similar)
            if (h1Text) {
                // Find where the actual content starts (might be # Title, or # **Title**)
                let matchIndex = markdown.indexOf(`# **${h1Text}**`);
                if (matchIndex === -1) matchIndex = markdown.indexOf(`# ${h1Text}`);

                if (matchIndex > 0) {
                    markdown = markdown.substring(matchIndex);
                }
            }

            fs.writeFileSync(item.filename, markdown, 'utf8');
            console.log(`Saved ${item.filename}`);
        } catch (err) {
            console.error(`Error processing ${item.url}:`, err.message);
        }
    }
}

scrapeDocs().catch(console.error);
