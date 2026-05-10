// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Source channels page — channel-level dashboard. Group by (username, platform)
// với stats READY/FAILED/PENDING, last imported, action retry/view-clips.

(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function fmtDate(epoch) {
        if (!epoch) return '—';
        const d = new Date(epoch * 1000);
        return d.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    async function refreshCredits() {
        const chip = $('#aikol-credits');
        try {
            const { balance, plan } = await window.AikolAPI.getCredits();
            chip.textContent = `${balance} credits · ${plan}`;
        } catch (_) {
            chip.textContent = '— credits';
        }
    }

    function platformBadge(platform) {
        const p = (platform || '').toLowerCase();
        if (p === 'tiktok')
            return '<span style="background:#000; color:#fff; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; letter-spacing:0.05em">TIKTOK</span>';
        if (p === 'douyin')
            return '<span style="background:#fe2c55; color:#fff; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; letter-spacing:0.05em">DOUYIN</span>';
        return `<span style="background:#666; color:#fff; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; letter-spacing:0.05em">${escapeHtml((platform || 'UPLOAD').toUpperCase())}</span>`;
    }

    function channelCard(c) {
        const display = c.username === '_upload' ? '@upload (local)' : `@${c.username}`;
        const failedBadge =
            c.failed > 0
                ? `<span style="color:var(--aikol-warn, #d97706); font-weight:600">${c.failed} FAILED</span>`
                : '';
        const pendingBadge =
            c.pending > 0
                ? `<span style="color:var(--aikol-text-dim)">${c.pending} pending</span>`
                : '';
        return `
            <div class="aikol-panel" style="display:grid; grid-template-columns: 1fr auto; gap:0.75rem; align-items:center; padding:0.85rem 1rem">
                <div>
                    <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap">
                        <strong style="font-size:1rem">${escapeHtml(display)}</strong>
                        ${platformBadge(c.platform)}
                    </div>
                    <div style="display:flex; gap:1rem; align-items:center; margin-top:0.4rem; font-size:0.85rem; color:var(--aikol-text-dim); flex-wrap:wrap">
                        <span><strong style="color:var(--aikol-text)">${c.total}</strong> clips</span>
                        <span style="color:var(--aikol-success, #10b981)">${c.ready} ready</span>
                        ${failedBadge}
                        ${pendingBadge}
                        <span>· last ${fmtDate(c.last_imported_at)}</span>
                    </div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
                    <a class="aikol-btn aikol-btn--secondary" href="library.html?username=${encodeURIComponent(c.username)}" style="font-size:0.82rem">View clips</a>
                    <a class="aikol-btn aikol-btn--secondary" href="history.html?username=${encodeURIComponent(c.username)}" style="font-size:0.82rem">View outputs</a>
                </div>
            </div>`;
    }

    async function refreshChannels() {
        const list = $('#channels-list');
        const empty = $('#channels-empty');
        try {
            const { channels } = await window.AikolAPI.listChannels();
            if (!channels?.length) {
                empty.style.display = 'block';
                list.style.display = 'none';
                return;
            }
            empty.style.display = 'none';
            list.style.display = 'grid';
            list.innerHTML = channels.map(channelCard).join('');
        } catch (e) {
            console.error('[channels]', e);
            list.innerHTML = `<div class="aikol-empty">Lỗi tải: ${escapeHtml(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (window.lucide) window.lucide.createIcons();
        await Promise.all([refreshCredits(), refreshChannels()]);
    });
})();
