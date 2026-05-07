// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL SCRAPER CLIENT — wraps the JoeanAmier/TikTokDownloader (DouK-Downloader)
// service deployed at AIKOL_SCRAPER_URL.
//
// Sprint 2 endpoints used:
//   POST /tiktok/detail   — single video detail (works WITHOUT cookie)
//   POST /tiktok/share    — short URL resolver
//   POST /tiktok/account  — channel scrape (needs cookie, deferred)
// =====================================================

const SCRAPER = (
    process.env.AIKOL_SCRAPER_URL || 'https://n2store-aikol-scraper.onrender.com'
).replace(/\/+$/, '');

const TIKTOK_VIDEO_RE = /(?:tiktok\.com\/@[\w._-]+\/video\/(\d+))|(?:^(\d{12,25})$)/;
const TIKTOK_USER_RE = /tiktok\.com\/@([\w._-]+)/;

/**
 * Parse a TikTok video URL or raw video ID and return { videoId, username }.
 * Throws on invalid input.
 */
function parseTiktokUrl(input) {
    if (!input || typeof input !== 'string') {
        throw new Error('URL or video ID is required');
    }
    const trimmed = input.trim();
    const m = trimmed.match(TIKTOK_VIDEO_RE);
    if (!m) {
        throw new Error('URL không hợp lệ. Dán link kiểu https://tiktok.com/@user/video/<id>');
    }
    const videoId = m[1] || m[2];
    const userMatch = trimmed.match(TIKTOK_USER_RE);
    return { videoId, username: userMatch ? userMatch[1] : null };
}

/**
 * Convert "00:02:19" or "2:19" into seconds. Returns null if unparsable.
 */
function durationStringToSeconds(s) {
    if (!s || typeof s !== 'string') return null;
    const parts = s.split(':').map((x) => parseInt(x, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
}

async function scraperFetchJson(path, body) {
    const url = `${SCRAPER}${path}`;
    const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    };
    // Node 18+ has global fetch
    const res = await fetch(url, opts);
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Scraper ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`Scraper returned non-JSON (status ${res.status})`);
    }
}

/**
 * Fetch single TikTok video detail. Works WITHOUT cookie.
 * @param {string} videoId
 * @returns {Promise<object>} normalized clip data
 */
async function fetchTiktokVideoDetail(videoId) {
    const resp = await scraperFetchJson('/tiktok/detail', { detail_id: videoId });
    if (!resp || !resp.data) {
        throw new Error(resp && resp.message ? resp.message : 'No data from scraper');
    }
    const d = resp.data;
    return {
        videoId: d.id || videoId,
        title: d.desc || '',
        durationSeconds: durationStringToSeconds(d.duration),
        width: d.width || null,
        height: d.height || null,
        createdEpoch: d.create_timestamp || null,
        downloadUrl: d.downloads || null, // signed TikTok CDN MP4
        staticCover: d.static_cover || null,
        dynamicCover: d.dynamic_cover || null,
        uri: d.uri || null,
        creatorUid: d.uid || null,
        raw: d,
    };
}

/**
 * Stream-download a remote URL into a Buffer with size cap.
 */
async function downloadToBuffer(url, maxBytes = 200 * 1024 * 1024) {
    if (!url) throw new Error('Missing download URL');
    const res = await fetch(url, {
        headers: {
            // TikTok CDN sometimes 403s without referer
            Referer: 'https://www.tiktok.com/',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
    });
    if (!res.ok) throw new Error(`Download ${res.status} ${res.statusText}`);
    const cl = parseInt(res.headers.get('content-length') || '0', 10);
    if (cl > maxBytes) throw new Error(`File too large: ${cl} bytes > ${maxBytes}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`File too large: ${buf.length} bytes`);
    return {
        buffer: buf,
        contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
}

module.exports = {
    parseTiktokUrl,
    fetchTiktokVideoDetail,
    downloadToBuffer,
    durationStringToSeconds,
    SCRAPER_URL: SCRAPER,
};
