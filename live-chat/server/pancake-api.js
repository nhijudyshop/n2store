// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE API - Auto-discover pageIds
// Side-effect-free on require: discoverPageIds only calls fetch when invoked.
// Uses Node 18+ global fetch (same as the original file).
// =====================================================

async function discoverPageIds(token) {
    try {
        const res = await fetch(
            `https://pancake.vn/api/v1/pages?access_token=${encodeURIComponent(token)}`,
            {
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
                    Origin: 'https://pancake.vn',
                    Referer: 'https://pancake.vn/multi_pages',
                    Cookie: `jwt=${token}; locale=vi`,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                    'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                },
            }
        );

        if (!res.ok) {
            console.error(`[PANCAKE-API] Failed to fetch pages: ${res.status} ${res.statusText}`);
            return { pageIds: [], pages: [] };
        }

        const data = await res.json();

        if (!data.success || !data.categorized) {
            console.error(
                '[PANCAKE-API] Unexpected response:',
                JSON.stringify(data).substring(0, 200)
            );
            return { pageIds: [], pages: [] };
        }

        const allPages = data.categorized.activated || [];
        const allPageIds = data.categorized.activated_page_ids || [];

        // Filter out Instagram pages (igo_) to avoid subscription errors
        const pageIds = allPageIds.filter((id) => !id.startsWith('igo_'));
        const pages = allPages.filter((p) => !String(p.id).startsWith('igo_'));

        console.log(
            `[PANCAKE-API] Discovered ${pageIds.length} pages: ${pages.map((p) => p.name || p.id).join(', ')}`
        );
        return { pageIds, pages };
    } catch (err) {
        console.error('[PANCAKE-API] Discover pages error:', err.message);
        return { pageIds: [], pages: [] };
    }
}

module.exports = { discoverPageIds };
