// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — controller viewer comment live (mobile, chỉ xem).
// =====================================================================
// comments-mobile.js — đọc comment livestream từ kho web2_live_comments
// (qua Cloudflare worker → Render), render card mobile, tap → bottom-sheet
// chi tiết, realtime SSE web2:live-comments. KHÔNG tạo đơn / KHÔNG chat —
// chỉ XEM. Thumbnail livestream lấy batch theo commentId.
// Múi giờ hiển thị = GMT+7 (Asia/Ho_Chi_Minh).
// =====================================================================
(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const LIMIT = 200;
    const PAGE = {
        270136663390370: { t: 'Store', c: 'pg-store' },
        117267091364524: { t: 'House', c: 'pg-house' },
    };

    const $ = (s) => document.querySelector(s);
    const listEl = $('#list');
    const countEl = $('#count');
    const sheetEl = $('#sheet');
    const sheetBack = $('#sheetBack');
    const sheetBody = $('#sheetBody');
    const newpill = $('#newpill');
    const toastEl = $('#toast');
    const lightbox = $('#lightbox');
    const lightboxImg = $('#lightboxImg');

    let ALL = []; // comments (newest-first)
    let THUMBS = {}; // commentId → {thumbnail_url, livestream_url}
    let filter = '';
    let topId = null; // id comment trên cùng (phát hiện comment mới khi đang cuộn)

    // ---------- helpers ----------
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
        );

    function pageOf(c) {
        const p = PAGE[String(c.page_id || '')];
        if (p) return p;
        const nm = String(c.page_name || '');
        if (/house/i.test(nm)) return { t: 'House', c: 'pg-house' };
        if (/store/i.test(nm)) return { t: 'Store', c: 'pg-store' };
        return nm ? { t: nm.slice(0, 8), c: 'pg-store' } : null;
    }

    const TZ = { timeZone: 'Asia/Ho_Chi_Minh' };
    function parseTs(v) {
        if (!v) return null;
        // TIMESTAMPTZ ISO có hậu tố Z/offset → an toàn. Naive string → coi là UTC.
        let s = String(v);
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s))
            s = s.replace(' ', 'T') + 'Z';
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }
    function fmtTime(v) {
        const d = parseTs(v);
        if (!d) return '';
        const now = Date.now();
        const diff = (now - d.getTime()) / 1000;
        if (diff < 60) return 'vừa xong';
        if (diff < 3600) return Math.floor(diff / 60) + ' phút';
        if (diff < 86400) return Math.floor(diff / 3600) + ' giờ';
        return new Intl.DateTimeFormat('vi-VN', {
            ...TZ,
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d);
    }
    function fmtFull(v) {
        const d = parseTs(v);
        if (!d) return '—';
        return new Intl.DateTimeFormat('vi-VN', {
            ...TZ,
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d);
    }

    const AVC = ['#0068ff', '#1aa251', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#ef4444'];
    function avHash(s) {
        let h = 0;
        for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
        return AVC[Math.abs(h) % AVC.length];
    }
    function avatarHtml(c, big) {
        const cls = big ? 'sh-av' : 'av';
        const url = c.avatar && /^https?:/.test(c.avatar) ? c.avatar : '';
        const initial = esc((c.customer_name || '?').trim().charAt(0).toUpperCase() || '?');
        if (url)
            return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=this.dataset.fb" data-fb='<div class="${cls} av-ph" style="background:${avHash(c.fb_id || c.customer_name)}">${initial}</div>'>`;
        return `<div class="${cls} av-ph" style="background:${avHash(c.fb_id || c.customer_name)}">${initial}</div>`;
    }

    const ICO = {
        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    };

    // ---------- render card ----------
    function cardHtml(c) {
        const pg = pageOf(c);
        const t = THUMBS[c.id];
        const thumb = t && t.thumbnail_url;
        const ordered = c.has_order === true || c.has_order === 't' || c.has_order === 1;
        const phone = (c.phone || '').trim();
        const addr = (c.address || '').trim();
        const meta =
            phone || addr
                ? `<div class="meta">
                ${phone ? `<a class="mchip mc-phone" href="tel:${esc(phone)}" onclick="event.stopPropagation()">${ICO.phone}${esc(phone)}</a>` : ''}
                ${addr ? `<span class="mchip mc-addr">${ICO.pin}<span>${esc(addr)}</span></span>` : ''}
              </div>`
                : `<div class="meta"><span class="mchip mc-empty">Chưa có SĐT/địa chỉ</span></div>`;
        return `<article class="card${ordered ? ' ordered' : ''}" data-id="${esc(c.id)}">
            <div class="c-top">
                ${avatarHtml(c)}
                <div class="c-id">
                    <div class="c-name">${esc(c.customer_name || 'Khách')}${pg ? `<span class="pgbadge ${pg.c}">${esc(pg.t)}</span>` : ''}</div>
                    <div class="c-time">${esc(fmtTime(c.created_time))}</div>
                </div>
                <span class="st ${ordered ? 'st-order' : 'st-new'}">${ordered ? '✓ Đã tạo đơn' : 'Mới'}</span>
            </div>
            <div class="c-body">
                <div class="c-main">
                    <p class="c-msg">${esc(c.message || '(không có nội dung)')}</p>
                    ${meta}
                </div>
                ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            </div>
        </article>`;
    }

    function pass(c) {
        if (filter === 'store')
            return /store/i.test(c.page_name || '') || c.page_id == 270136663390370;
        if (filter === 'house')
            return /house/i.test(c.page_name || '') || c.page_id == 117267091364524;
        if (filter === 'order')
            return c.has_order === true || c.has_order === 't' || c.has_order === 1;
        if (filter === 'phone') return !!(c.phone || '').trim();
        return true;
    }

    function render() {
        const rows = ALL.filter(pass);
        countEl.textContent = rows.length + (rows.length >= LIMIT ? '+' : '') + ' comment';
        if (!rows.length) {
            listEl.innerHTML = `<div class="empty"><div class="ic">🗒️</div>Chưa có comment ${filter ? 'khớp bộ lọc' : 'nào'}.</div>`;
            return;
        }
        listEl.innerHTML = rows.map(cardHtml).join('');
    }

    function skeleton() {
        listEl.innerHTML = Array.from({ length: 6 })
            .map(
                () => `<div class="sk">
            <div style="display:flex;gap:10px;align-items:center">
              <div class="sk-bar" style="width:44px;height:44px;border-radius:50%"></div>
              <div style="flex:1"><div class="sk-bar" style="width:46%;height:13px"></div>
              <div class="sk-bar" style="width:28%;height:10px;margin-top:7px"></div></div>
            </div>
            <div class="sk-bar" style="width:90%;height:13px;margin-top:12px"></div>
            <div class="sk-bar" style="width:60%;height:13px;margin-top:7px"></div>
          </div>`
            )
            .join('');
    }

    // ---------- detail bottom-sheet ----------
    function openSheet(id) {
        const c = ALL.find((x) => String(x.id) === String(id));
        if (!c) return;
        const pg = pageOf(c);
        const t = THUMBS[c.id] || {};
        const phone = (c.phone || '').trim();
        const addr = (c.address || '').trim();
        const fb = c.fb_id ? `https://facebook.com/${esc(c.fb_id)}` : '';
        const field = (k, v) =>
            `<div class="sh-field"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
        sheetBody.innerHTML = `
            <div class="sh-hero">
                ${avatarHtml(c, true)}
                <div style="min-width:0">
                    <div class="sh-name">${esc(c.customer_name || 'Khách')}</div>
                    <div class="sh-sub">${pg ? esc(pg.t) + ' · ' : ''}${esc(fmtTime(c.created_time))}</div>
                </div>
            </div>
            <div class="sh-quote">${esc(c.message || '(không có nội dung)')}</div>
            ${t.thumbnail_url ? `<img class="sh-thumb" id="shThumb" src="${esc(t.thumbnail_url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            ${field('SĐT', phone ? `<a href="tel:${esc(phone)}" style="color:var(--c-primary);text-decoration:none;font-weight:700">${esc(phone)}</a>` : '')}
            ${field('Địa chỉ', esc(addr))}
            ${field('Trạng thái', c.has_order === true || c.has_order === 't' || c.has_order === 1 ? '<span style="color:var(--c-green);font-weight:700">✓ Đã tạo đơn</span>' : '<span style="color:var(--c-amber);font-weight:700">Mới</span>')}
            ${field('Trang', esc(c.page_name || ''))}
            ${field('FB ID', esc(c.fb_id || ''))}
            ${field('Thời gian', esc(fmtFull(c.created_time)))}
            <div class="sh-actions">
                <a class="sh-act prim ${phone ? '' : 'dis'}" href="${phone ? 'tel:' + esc(phone) : '#'}">${ICO.phone}Gọi</a>
                <a class="sh-act sec ${fb ? '' : 'dis'}" href="${fb}" target="_blank" rel="noopener">Mở Facebook</a>
            </div>`;
        const sh = sheetBody.querySelector('#shThumb');
        if (sh)
            sh.addEventListener('click', () => {
                lightboxImg.src = t.thumbnail_url;
                lightbox.classList.add('open');
            });
        sheetBack.classList.add('open');
        sheetEl.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeSheet() {
        sheetBack.classList.remove('open');
        sheetEl.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ---------- fetch ----------
    async function fetchThumbs(ids) {
        if (!ids.length) return {};
        try {
            const r = await fetch(
                `${WORKER}/api/livestream/snapshots/by-comment-ids?commentIds=${encodeURIComponent(ids.join(','))}`,
                { credentials: 'omit' }
            );
            const j = await r.json();
            return j && j.byCommentId ? j.byCommentId : {};
        } catch {
            return {};
        }
    }

    async function load(opts) {
        opts = opts || {};
        const btn = $('#btnRefresh');
        btn.classList.add('spin');
        if (!ALL.length && !opts.silent) skeleton();
        try {
            const r = await fetch(`${WORKER}/api/web2-live-comments/?limit=${LIMIT}`, {
                credentials: 'omit',
            });
            const j = await r.json();
            const data = (j && j.data) || [];
            // phát hiện comment mới khi user đang cuộn (không ở đầu trang)
            const newTop = data[0] && String(data[0].id);
            const hadNew = topId && newTop && newTop !== topId && window.scrollY > 240;
            ALL = data;
            THUMBS = await fetchThumbs(data.slice(0, 60).map((c) => c.id));
            render();
            topId = newTop;
            if (hadNew) showNewPill();
        } catch (e) {
            if (!ALL.length)
                listEl.innerHTML = `<div class="empty"><div class="ic">⚠️</div>Lỗi tải comment.<br><small>${esc(e.message)}</small></div>`;
            toast('Lỗi tải: ' + e.message);
        } finally {
            btn.classList.remove('spin');
        }
    }

    // ---------- ui bits ----------
    let toastT;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }
    let pillT;
    function showNewPill() {
        newpill.classList.add('show');
        clearTimeout(pillT);
        pillT = setTimeout(() => newpill.classList.remove('show'), 6000);
    }

    // ---------- events ----------
    listEl.addEventListener('click', (e) => {
        if (e.target.closest('a')) return; // tel link
        const card = e.target.closest('.card');
        if (card) openSheet(card.dataset.id);
    });
    sheetBack.addEventListener('click', closeSheet);
    $('#btnRefresh').addEventListener('click', () => load({ silent: false }));
    document.getElementById('chips').addEventListener('click', (e) => {
        const ch = e.target.closest('.chip');
        if (!ch) return;
        document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === ch));
        filter = ch.dataset.pg || '';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    newpill.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        newpill.classList.remove('show');
    });
    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));

    // pull-to-refresh đơn giản (kéo xuống ở đỉnh)
    let startY = 0,
        pulling = false;
    window.addEventListener(
        'touchstart',
        (e) => {
            if (window.scrollY <= 0) {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        },
        { passive: true }
    );
    window.addEventListener(
        'touchend',
        (e) => {
            if (pulling && e.changedTouches[0].clientY - startY > 90 && window.scrollY <= 0) {
                load({ silent: false });
                toast('Đang làm mới…');
            }
            pulling = false;
        },
        { passive: true }
    );

    // ---------- realtime SSE ----------
    let sseT;
    function wireSse() {
        if (!window.Web2SSE || !window.Web2SSE.subscribe) return;
        window.Web2SSE.subscribe('web2:live-comments', () => {
            clearTimeout(sseT);
            sseT = setTimeout(() => load({ silent: true }), 800);
        });
    }

    // ---------- boot ----------
    load();
    wireSse();
    // refresh nhẹ định kỳ phòng SSE rớt (60s)
    setInterval(() => load({ silent: true }), 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') load({ silent: true });
    });
})();
