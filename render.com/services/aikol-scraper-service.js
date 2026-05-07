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

/**
 * Resolve a TikTok user URL or @handle into sec_user_id by parsing the
 * public profile HTML. Returns null if blocked (CAPTCHA / no cookie).
 *
 * Caller can fall back to user-supplied secUid if this returns null.
 *
 * @param {string} input — full URL `https://tiktok.com/@user`, `@user`, or already-secUid string
 * @returns {Promise<{secUid: string, uniqueId: string|null}|null>}
 */
async function resolveTiktokSecUid(input) {
    if (!input || typeof input !== 'string') return null;
    const s = input.trim();
    // Already a secUid? (TikTok secUids start with "MS4wLjAB" base64-ish, length 60+)
    if (/^MS4wLjAB[\w-]{40,}$/.test(s)) {
        return { secUid: s, uniqueId: null };
    }
    // Extract @handle from any URL or input form
    const handleMatch = s.match(/@([\w._-]+)/);
    if (!handleMatch) return null;
    const uniqueId = handleMatch[1];

    // Fetch profile HTML and pull secUid out via regex (no parsing libs).
    try {
        const res = await fetch(`https://www.tiktok.com/@${uniqueId}`, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        if (!res.ok) return null;
        const html = await res.text();
        const m = html.match(/"secUid":"(MS4wLjAB[\w-]{40,})"/);
        if (!m) return null;
        return { secUid: m[1], uniqueId };
    } catch (_) {
        return null;
    }
}

/**
 * Fetch a TikTok user's video list from the self-hosted scraper.
 * Cookie is optional — works for some accounts without, fails for others
 * (TikTok rate-limits anonymous account scraping aggressively).
 *
 * @param {object} opts
 * @param {string} opts.secUid — required
 * @param {string} [opts.cookie] — optional TikTok cookie
 * @param {number} [opts.count=20] — page size, max 35
 * @param {number} [opts.cursor=0] — pagination cursor
 * @returns {Promise<{videos: Array<{videoId,title,duration,cover,url}>, hasMore: boolean, cursor: number}>}
 */
async function fetchTiktokAccountVideos(opts) {
    const { secUid, cookie, count = 20, cursor = 0 } = opts || {};
    if (!secUid) throw new Error('secUid is required');
    const body = { sec_user_id: secUid, cursor, count };
    if (cookie) body.cookie = cookie;

    const resp = await scraperFetchJson('/tiktok/account', body);
    // JoeanAmier scraper returns:
    //   success: { message: <success>, data: [items], params, time }
    //   failure: { message: "Failed to retrieve data!", data: null, params, time }
    // Without cookie, TikTok's user-post endpoint returns 0 → data is null.
    if (!resp || resp.data === null || resp.data === undefined) {
        const reason = resp?.message || 'No data from scraper';
        const e = new Error(reason);
        e.code = 'scraper_no_data';
        e.needsCookie = !cookie;
        throw e;
    }
    // The scraper returns { data: [...items], message, params } per JoeanAmier convention.
    // Each item has: id, desc, duration, downloads, static_cover, dynamic_cover, create_timestamp
    const items = Array.isArray(resp.data) ? resp.data : [];
    const videos = items
        .filter((it) => it && (it.id || it.aweme_id))
        .map((it) => {
            const videoId = String(it.id || it.aweme_id);
            const author = it.author || it.nickname || '';
            const handle = it.uniqueId || it.author_username || '';
            const url = handle
                ? `https://www.tiktok.com/@${handle}/video/${videoId}`
                : `https://www.tiktok.com/video/${videoId}`;
            return {
                videoId,
                title: it.desc || '',
                duration: durationStringToSeconds(it.duration),
                cover: it.static_cover || it.dynamic_cover || null,
                url,
                author,
                createdEpoch: it.create_timestamp || null,
            };
        });
    return {
        videos,
        hasMore: Boolean(resp.has_more),
        cursor: typeof resp.next_cursor === 'number' ? resp.next_cursor : cursor + videos.length,
    };
}

module.exports = {
    parseTiktokUrl,
    fetchTiktokVideoDetail,
    downloadToBuffer,
    durationStringToSeconds,
    resolveTiktokSecUid,
    fetchTiktokAccountVideos,
    SCRAPER_URL: SCRAPER,
};
