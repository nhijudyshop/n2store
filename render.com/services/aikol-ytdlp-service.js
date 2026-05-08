// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL YT-DLP — wraps the yt-dlp standalone binary (statically-linked Python)
// to extract a TikTok user's video list WITHOUT needing TikTok cookies.
//
// Why yt-dlp?
//   JoeanAmier scraper /tiktok/account requires a TikTok cookie to enumerate
//   a user's posts. yt-dlp uses TikTok's signed-msToken/X-Bogus path that
//   works for many users without auth. It's what 99% of TikTok bulk-download
//   tools standardize on, and updates frequently to match TikTok changes.
//
// Binary is downloaded lazily on first call (idempotent — skips if exists).
// Render disk is ephemeral but binary install is ~5s on cold start.
// =====================================================

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execFileP = promisify(execFile);

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BIN_PATH = path.join(BIN_DIR, 'yt-dlp');
// Linux x86_64 single-file build (~6MB). Self-contained, no Python install needed.
const RELEASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

let installPromise = null;

async function ensureYtDlp() {
    if (fs.existsSync(BIN_PATH)) return BIN_PATH;
    if (installPromise) return installPromise;
    installPromise = (async () => {
        try {
            fs.mkdirSync(BIN_DIR, { recursive: true });
            const tmpPath = BIN_PATH + '.tmp';
            try {
                fs.unlinkSync(tmpPath);
            } catch (_) {}
            console.log('[ytdlp] Downloading yt-dlp_linux to', BIN_PATH);
            // curl follows redirects natively; --silent --fail surfaces errors.
            await execFileP('curl', ['-fsSL', '--max-time', '60', '-o', tmpPath, RELEASE_URL], {
                timeout: 70000,
            });
            const stat = fs.statSync(tmpPath);
            if (stat.size < 1_000_000) {
                fs.unlinkSync(tmpPath);
                throw new Error(`Downloaded file too small: ${stat.size} bytes`);
            }
            fs.chmodSync(tmpPath, 0o755);
            fs.renameSync(tmpPath, BIN_PATH);
            console.log('[ytdlp] Install OK · size=' + stat.size);
            return BIN_PATH;
        } catch (e) {
            installPromise = null;
            throw e;
        }
    })();
    return installPromise;
}

/**
 * Extract a TikTok user's video list using yt-dlp --flat-playlist.
 * Works without TikTok cookies for most public users.
 *
 * @param {string} userUrl — full TikTok user URL or @handle
 * @param {object} [opts]
 * @param {number} [opts.limit=20] — max videos to return (yt-dlp --playlist-end)
 * @param {number} [opts.timeoutMs=60000]
 * @returns {Promise<Array<{videoId, url, title, duration, cover}>>}
 */
async function listUserVideos(userUrl, opts = {}) {
    const limit = Math.max(1, Math.min(opts.limit || 20, 100));
    const timeoutMs = opts.timeoutMs || 60000;

    const bin = await ensureYtDlp();

    // Normalize user URL: accept "@handle", "tiktok.com/@user", or full URL
    let url = String(userUrl || '').trim();
    if (url.startsWith('@')) url = `https://www.tiktok.com/${url}`;
    else if (!url.startsWith('http')) url = `https://www.tiktok.com/${url.replace(/^\/+/, '')}`;
    // Strip /video/... if user pasted a single-video URL — keep just user root
    url = url.replace(/(\/@[\w._-]+)\/video\/.*$/, '$1');

    // Extract @handle from URL so each video URL is unambiguous downstream
    const handleFromInput = (url.match(/@([\w._-]+)/) || [])[1] || '';

    return new Promise((resolve, reject) => {
        // --flat-playlist returns metadata WITHOUT downloading video files.
        // -J prints a single JSON tree with "entries" array.
        const args = [
            '--flat-playlist',
            '-J',
            '--playlist-end',
            String(limit),
            '--no-warnings',
            '--no-check-certificate',
            url,
        ];
        const proc = spawn(bin, args, { timeout: timeoutMs });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        const killTimer = setTimeout(() => {
            try {
                proc.kill('SIGKILL');
            } catch (_) {}
        }, timeoutMs);

        proc.on('close', (code) => {
            clearTimeout(killTimer);
            if (code !== 0) {
                return reject(
                    new Error(
                        `yt-dlp exit ${code}: ${stderr.split('\n').pop() || stderr.slice(-200) || 'no stderr'}`
                    )
                );
            }
            let parsed;
            try {
                parsed = JSON.parse(stdout);
            } catch (e) {
                return reject(new Error('yt-dlp returned non-JSON: ' + stdout.slice(0, 200)));
            }
            const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
            const uploader = parsed.uploader || parsed.channel || handleFromInput || '';
            const videos = entries
                .filter((e) => e && (e.id || e.url))
                .map((e) => {
                    const videoId = String(e.id || '').replace(/[^\d]/g, '');
                    const handle = String(uploader).replace(/^@/, '');
                    // Prefer entry URL if it has /@handle/video/, else build from handle.
                    // /import/single parser also accepts raw videoId → safe fallback.
                    let videoUrl = e.url || '';
                    if (!/\/@[\w._-]+\/video\//.test(videoUrl)) {
                        videoUrl = handle
                            ? `https://www.tiktok.com/@${handle}/video/${videoId}`
                            : videoId; // raw ID — parser accepts ^\d{12,25}$
                    }
                    return {
                        videoId,
                        url: videoUrl,
                        title: e.title || '',
                        duration: typeof e.duration === 'number' ? Math.round(e.duration) : null,
                        cover: e.thumbnails?.[0]?.url || e.thumbnail || null,
                    };
                })
                .filter((v) => v.videoId);
            resolve({ videos, uploader });
        });

        proc.on('error', (err) => {
            clearTimeout(killTimer);
            reject(err);
        });
    });
}

module.exports = {
    ensureYtDlp,
    listUserVideos,
    BIN_PATH,
};
