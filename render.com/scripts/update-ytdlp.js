// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Update yt-dlp binary lên LATEST tại Render build (postinstall).
//
// Lý do: youtube-dl-exec ^3.0.10 bundle 1 yt-dlp binary cũ → extractor Facebook
// hỏng khi FB đổi web ("[facebook] Cannot parse data") → force extract fail "no
// m3u8 URL". yt-dlp release liên tục để theo kịp FB. Chạy `yt-dlp -U` (self-update
// về bản mới nhất từ GitHub releases); nếu fail → download trực tiếp binary Linux.
// Non-fatal: lỗi update KHÔNG được làm hỏng build (giữ binary bundle).
// =====================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findBinary() {
    // 1) youtube-dl-exec expose path qua constants
    try {
        const c = require('youtube-dl-exec').constants;
        const p = c && (c.YOUTUBE_DL_PATH || c.YOUTUBE_DL_FILE);
        if (p && fs.existsSync(p)) return p;
    } catch (_) {}
    // 2) common locations trong node_modules
    try {
        const dir = path.dirname(require.resolve('youtube-dl-exec/package.json'));
        for (const rel of ['bin/yt-dlp', 'bin/yt-dlp.exe', 'bin/youtube-dl']) {
            const p = path.join(dir, rel);
            if (fs.existsSync(p)) return p;
        }
    } catch (_) {}
    return null;
}

const bin = findBinary();
if (!bin) {
    console.warn('[update-ytdlp] yt-dlp binary not found — skip update');
    process.exit(0);
}

// (a) self-update
try {
    console.log('[update-ytdlp] yt-dlp -U trên', bin);
    execFileSync(bin, ['-U'], { stdio: 'inherit', timeout: 180000 });
    const ver = execFileSync(bin, ['--version'], { timeout: 30000 }).toString().trim();
    console.log('[update-ytdlp] OK, version =', ver);
    process.exit(0);
} catch (e) {
    console.warn('[update-ytdlp] -U fail (non-fatal):', e.message);
}

// (b) fallback: download latest Linux binary trực tiếp (Render = Linux x86_64)
try {
    if (process.platform === 'linux') {
        console.log('[update-ytdlp] fallback: curl latest yt-dlp binary');
        execFileSync(
            'sh',
            [
                '-c',
                `curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${bin}" && chmod +x "${bin}"`,
            ],
            { stdio: 'inherit', timeout: 180000 }
        );
        const ver = execFileSync(bin, ['--version'], { timeout: 30000 }).toString().trim();
        console.log('[update-ytdlp] fallback OK, version =', ver);
    }
} catch (e2) {
    console.warn('[update-ytdlp] fallback fail (non-fatal):', e2.message);
}
process.exit(0);
