// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — controller viewer comment live (mobile, chỉ xem).
// =====================================================================
// comments-mobile.js — đọc comment livestream từ kho web2_live_comments
// (qua Cloudflare worker → Render), render card mobile, tap → bottom-sheet
// chi tiết, realtime SSE web2:live-comments. KHÔNG tạo đơn / KHÔNG chat —
// chỉ XEM. Múi giờ hiển thị = GMT+7 (Asia/Ho_Chi_Minh).
//
// Tính năng:
//  • Avatar: comment.avatar (poller fill từ Pancake profile) → fallback initials.
//  • Địa chỉ + trạng thái KH: enrich từ KHO web2_customers (batch-by-phone +
//    batch-by-fbid) — KHO KH TRƯỚC, Pancake SAU (CLAUDE.md). Status: VIP/Bom/
//    Cảnh báo/Nguy hiểm/Khách quen/Mới.
//  • Ẩn comment: mặc định ẩn comment CỦA SHOP (NhiJudy House/Store tự reply) +
//    ẩn từng comment thủ công + nút "Đã ẩn" để xem lại.
//  • Chọn livestream: picker bài đang/đã live (GET /posts + /page-posts) → lọc
//    comment theo post_id.
// =====================================================================
(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const LIMIT = 200; // "Tất cả livestream"
    const POST_LIMIT = 1000; // khi chọn 1 bài cụ thể
    const LIVE_RECENT_MS = 12 * 60 * 1000; // last_at trong 12' → coi như đang live
    const PAGE = {
        270136663390370: { t: 'Store', c: 'pg-store' },
        117267091364524: { t: 'House', c: 'pg-house' },
    };
    const LS_HIDE_SHOP = 'cm_hideShop';
    const LS_HIDDEN = 'cm_hidden_ids';

    const $ = (s) => document.querySelector(s);
    const listEl = $('#list');
    const countEl = $('#count');
    const liveTag = $('#liveTag');
    const sheetEl = $('#sheet');
    const sheetBack = $('#sheetBack');
    const sheetBody = $('#sheetBody');
    const pickerEl = $('#picker');
    const pickerBack = $('#pickerBack');
    const pickerBody = $('#pickerBody');
    const newpill = $('#newpill');
    const toastEl = $('#toast');
    const lightbox = $('#lightbox');
    const lightboxImg = $('#lightboxImg');
    const tgShop = $('#tgShop');
    const tgHidden = $('#tgHidden');
    const tgHiddenLabel = $('#tgHiddenLabel');
    const postSel = $('#postSel');
    const postSelLabel = $('#postSelLabel');

    // ---------- state ----------
    let ALL = []; // comments (newest-first) ở scope hiện tại
    let THUMBS = {}; // commentId → { thumbnail_url, livestream_url }
    let filter = ''; // chip page/status: ''|store|house|order|phone
    let selectedPost = null; // null = tất cả | { post_id, page_id, living, title }
    let posts = []; // danh sách bài cho picker
    let anyLive = false; // có bài đang live (cho LIVE tag khi xem "tất cả")
    let topId = null;
    const custMap = { phone: {}, fb: {} }; // enrich từ kho (persistent cache)

    let hideShop = localStorage.getItem(LS_HIDE_SHOP) !== '0'; // mặc định ẩn shop
    let showHidden = false;
    const hiddenSet = new Set(loadHidden());

    function loadHidden() {
        try {
            return JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]');
        } catch {
            return [];
        }
    }
    function saveHidden() {
        try {
            localStorage.setItem(LS_HIDDEN, JSON.stringify([...hiddenSet]));
        } catch {
            /* quota */
        }
    }

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

    function normP(p) {
        let s = String(p == null ? '' : p).replace(/\D/g, '');
        if (s.startsWith('84')) s = '0' + s.slice(2);
        if (s.length === 9 && s[0] !== '0') s = '0' + s;
        return s;
    }

    const TZ = { timeZone: 'Asia/Ho_Chi_Minh' };
    function parseTs(v) {
        if (!v) return null;
        let s = String(v);
        if (/^\d+$/.test(s)) {
            const n = Number(s);
            const d = new Date(n > 9999999999 ? n : n * 1000);
            return isNaN(d) ? null : d;
        }
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s))
            s = s.replace(' ', 'T') + 'Z';
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }
    function fmtTime(v) {
        const d = parseTs(v);
        if (!d) return '';
        const diff = (Date.now() - d.getTime()) / 1000;
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
        const nm = nameOf(c);
        const initial = esc((nm || '?').trim().charAt(0).toUpperCase() || '?');
        const phDiv = `<div class="${cls} av-ph" style="background:${avHash(c.fb_id || nm)}">${initial}</div>`;
        if (url)
            return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=this.dataset.fb" data-fb='${phDiv.replace(/'/g, '&#39;')}'>`;
        return phDiv;
    }

    const ICO = {
        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    };

    // ---------- enrich từ KHO web2_customers ----------
    function whInfo(c) {
        const byP = c.phone && custMap.phone[normP(c.phone)];
        const byF = c.fb_id && custMap.fb[String(c.fb_id)];
        return byP || byF || null;
    }
    function nameOf(c) {
        const nm = String(c.customer_name || '').trim();
        if (nm && !/^khách(\s*hàng\s*mới)?$/i.test(nm)) return nm;
        const w = whInfo(c);
        return (w && w.name) || nm || 'Khách';
    }
    function addrOf(c) {
        const a = String(c.address || '').trim();
        if (a) return a;
        const w = whInfo(c);
        return (w && String(w.address || '').trim()) || '';
    }
    const ordered = (c) => c.has_order === true || c.has_order === 't' || c.has_order === 1;
    function statusOf(c) {
        if (ordered(c)) return { label: '✓ Đã tạo đơn', cls: 'st-order' };
        const w = whInfo(c);
        const s = String((w && w.status) || '').toLowerCase();
        if (s.includes('vip')) return { label: 'VIP', cls: 'st-vip' };
        if (s.includes('bom')) return { label: 'Bom hàng', cls: 'st-bom' };
        if (s.includes('danger') || s.includes('nguy'))
            return { label: 'Nguy hiểm', cls: 'st-danger' };
        if (s.includes('warn') || s.includes('cảnh')) return { label: 'Cảnh báo', cls: 'st-warn' };
        if (w) return { label: 'Khách quen', cls: 'st-known' };
        return { label: 'Mới', cls: 'st-new' };
    }

    async function postJson(path, body) {
        try {
            const r = await fetch(WORKER + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify(body),
            });
            return await r.json();
        } catch {
            return {};
        }
    }

    async function enrichWarehouse(data) {
        const phones = [
            ...new Set(data.map((c) => normP(c.phone)).filter((p) => p && p.length >= 9)),
        ].filter((p) => !custMap.phone[p]);
        const fbids = [
            ...new Set(data.map((c) => c.fb_id && String(c.fb_id)).filter(Boolean)),
        ].filter((f) => !custMap.fb[f]);
        const jobs = [];
        if (phones.length)
            jobs.push(
                postJson('/api/web2/customers/batch-by-phone', { phones }).then((j) => {
                    for (const [k, v] of Object.entries(j.data || {}))
                        custMap.phone[normP(k)] = {
                            name: v.Name,
                            address: v.Address,
                            status: v.Status,
                        };
                })
            );
        if (fbids.length)
            jobs.push(
                postJson('/api/web2/customers/batch-by-fbid', { fbIds: fbids }).then((j) => {
                    for (const [k, v] of Object.entries(j.data || {}))
                        custMap.fb[String(k)] = {
                            name: v.name,
                            address: v.address,
                            status: v.status,
                        };
                })
            );
        if (jobs.length) await Promise.allSettled(jobs);
    }

    // ---------- shop-own + hidden ----------
    function isShopOwn(c) {
        const fid = String(c.fb_id || '');
        const pid = String(c.page_id || '');
        if (fid && pid && fid === pid) return true;
        return /nhijudy\s*(house|store)/i.test(String(c.customer_name || ''));
    }

    // ---------- filters ----------
    function pass(c) {
        if (filter === 'store')
            return /store/i.test(c.page_name || '') || c.page_id == 270136663390370;
        if (filter === 'house')
            return /house/i.test(c.page_name || '') || c.page_id == 117267091364524;
        if (filter === 'order') return ordered(c);
        if (filter === 'phone') return !!(c.phone || '').trim();
        return true;
    }
    function visible(c) {
        if (!pass(c)) return false;
        if (isShopOwn(c) && hideShop) return false;
        if (hiddenSet.has(String(c.id)) && !showHidden) return false;
        return true;
    }

    // ---------- render card ----------
    function cardHtml(c) {
        const pg = pageOf(c);
        const t = THUMBS[c.id];
        const thumb = t && t.thumbnail_url;
        const st = statusOf(c);
        const phone = (c.phone || '').trim();
        const addr = addrOf(c);
        const isHid = hiddenSet.has(String(c.id));
        const meta =
            phone || addr
                ? `<div class="meta">
                ${phone ? `<a class="mchip mc-phone" href="tel:${esc(phone)}" onclick="event.stopPropagation()">${ICO.phone}${esc(phone)}</a>` : ''}
                ${addr ? `<span class="mchip mc-addr">${ICO.pin}<span>${esc(addr)}</span></span>` : ''}
              </div>`
                : `<div class="meta"><span class="mchip mc-empty">Chưa có SĐT/địa chỉ</span></div>`;
        return `<article class="card${ordered(c) ? ' ordered' : ''}${isHid ? ' is-hidden' : ''}" data-id="${esc(c.id)}">
            <div class="c-top">
                ${avatarHtml(c)}
                <div class="c-id">
                    <div class="c-name">${esc(nameOf(c))}${pg ? `<span class="pgbadge ${pg.c}">${esc(pg.t)}</span>` : ''}${isHid ? '<span class="hidetag">đã ẩn</span>' : ''}</div>
                    <div class="c-time">${esc(fmtTime(c.created_time))}</div>
                </div>
                <span class="st ${st.cls}">${esc(st.label)}</span>
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

    function render() {
        // cập nhật label toggle "Đã ẩn (N)"
        const nHidden = ALL.filter((c) => hiddenSet.has(String(c.id))).length;
        tgHiddenLabel.textContent = nHidden ? `Đã ẩn (${nHidden})` : 'Đã ẩn';
        tgShop.classList.toggle('on', hideShop);
        tgHidden.classList.toggle('on', showHidden);

        const rows = ALL.filter(visible);
        countEl.textContent = rows.length + (rows.length >= LIMIT ? '+' : '') + ' comment';
        if (!rows.length) {
            listEl.innerHTML = `<div class="empty"><div class="ic">🗒️</div>Chưa có comment ${filter || selectedPost || hideShop ? 'khớp bộ lọc' : 'nào'}.</div>`;
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
        const addr = addrOf(c);
        const st = statusOf(c);
        const fb = c.fb_id ? `https://facebook.com/${esc(c.fb_id)}` : '';
        const isHid = hiddenSet.has(String(c.id));
        const field = (k, v) =>
            `<div class="sh-field"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
        sheetBody.innerHTML = `
            <div class="sh-hero">
                ${avatarHtml(c, true)}
                <div style="min-width:0">
                    <div class="sh-name">${esc(nameOf(c))}</div>
                    <div class="sh-sub">${pg ? esc(pg.t) + ' · ' : ''}${esc(fmtTime(c.created_time))}</div>
                </div>
            </div>
            <div class="sh-quote">${esc(c.message || '(không có nội dung)')}</div>
            ${t.thumbnail_url ? `<img class="sh-thumb" id="shThumb" src="${esc(t.thumbnail_url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
            ${field('SĐT', phone ? `<a href="tel:${esc(phone)}" style="color:var(--c-primary);text-decoration:none;font-weight:700">${esc(phone)}</a>` : '')}
            ${field('Địa chỉ', esc(addr))}
            ${field('Trạng thái', `<span class="st ${st.cls}" style="display:inline-block">${esc(st.label)}</span>`)}
            ${field('Trang', esc(c.page_name || (pg ? 'NhiJudy ' + pg.t : '')))}
            ${field('FB ID', esc(c.fb_id || ''))}
            ${field('Thời gian', esc(fmtFull(c.created_time)))}
            <div class="sh-actions">
                <a class="sh-act prim ${phone ? '' : 'dis'}" href="${phone ? 'tel:' + esc(phone) : '#'}">${ICO.phone}Gọi</a>
                <a class="sh-act sec ${fb ? '' : 'dis'}" href="${fb}" target="_blank" rel="noopener">Mở Facebook</a>
            </div>
            <button class="sh-hide" id="shHide" data-id="${esc(c.id)}">${isHid ? '↩︎ Bỏ ẩn comment này' : '🚫 Ẩn comment này'}</button>`;
        const sh = sheetBody.querySelector('#shThumb');
        if (sh)
            sh.addEventListener('click', () => {
                lightboxImg.src = t.thumbnail_url;
                lightbox.classList.add('open');
            });
        sheetBody.querySelector('#shHide').addEventListener('click', (e) => {
            toggleHide(e.currentTarget.dataset.id);
            closeSheet();
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
    function toggleHide(id) {
        id = String(id);
        if (hiddenSet.has(id)) hiddenSet.delete(id);
        else hiddenSet.add(id);
        saveHidden();
        render();
    }

    // ---------- post picker (chọn livestream) ----------
    function postLiving(p) {
        if (p.living) return true;
        const d = parseTs(p.last_at || p.date);
        return d ? Date.now() - d.getTime() < LIVE_RECENT_MS : false;
    }
    async function loadPosts() {
        try {
            const [a, b] = await Promise.allSettled([
                fetch(`${WORKER}/api/web2-live-comments/posts`, { credentials: 'omit' }).then((r) =>
                    r.json()
                ),
                fetch(`${WORKER}/api/web2-live-comments/page-posts`, { credentials: 'omit' }).then(
                    (r) => r.json()
                ),
            ]);
            const withComments = (a.status === 'fulfilled' && a.value.data) || [];
            const pagePosts = (b.status === 'fulfilled' && b.value.data) || [];
            const liveMap = {};
            const titleMap = {};
            for (const pp of pagePosts) {
                liveMap[String(pp.postId)] = !!pp.living;
                if (pp.title) titleMap[String(pp.postId)] = pp.title;
            }
            posts = withComments.map((p) => ({
                post_id: String(p.post_id),
                page_id: String(p.page_id),
                comment_count: p.comment_count || 0,
                last_at: p.last_at,
                title: titleMap[String(p.post_id)] || '',
                living: liveMap[String(p.post_id)] || false,
            }));
            anyLive = posts.some(postLiving);
            updateLiveTag();
        } catch {
            /* giữ posts cũ */
        }
    }
    function updateLiveTag() {
        const on = selectedPost ? postLiving(selectedPost) : anyLive;
        liveTag.style.display = on ? '' : 'none';
    }
    function postLabel(p) {
        const pg = PAGE[p.page_id];
        const tag = pg ? pg.t : 'Live';
        const ttl = (p.title || '').trim();
        return ttl ? `${tag} · ${ttl.slice(0, 40)}` : `${tag} · ${fmtTime(p.last_at)}`;
    }
    function pickerRow(p, sel) {
        const pg = PAGE[p.page_id] || { t: 'Live', c: 'pg-store' };
        const ttl = (p.title || '').trim();
        return `<div class="pk-row${sel ? ' sel' : ''}" data-post="${esc(p.post_id)}" data-page="${esc(p.page_id)}">
            <span class="pk-pg ${pg.c}">${esc(pg.t)}</span>
            <div class="pk-main">
                <div class="pk-title">${esc(ttl || 'Livestream ' + p.post_id.split('_').pop())}</div>
                <div class="pk-sub">${esc(fmtTime(p.last_at))} · cập nhật gần nhất</div>
            </div>
            <span class="pk-cnt">${p.comment_count}</span>
            ${sel ? '<span class="pk-check">✓</span>' : ''}
        </div>`;
    }
    function openPicker() {
        const live = posts.filter(postLiving);
        const ended = posts.filter((p) => !postLiving(p));
        const selId = selectedPost && selectedPost.post_id;
        let html = `<div class="pk-head">Chọn livestream</div>
            <div class="pk-row${!selectedPost ? ' sel' : ''}" data-post="">
                <span class="pk-pg" style="background:var(--c-primary)">All</span>
                <div class="pk-main"><div class="pk-title">Tất cả livestream</div>
                <div class="pk-sub">Gộp comment mới nhất mọi bài</div></div>
                ${!selectedPost ? '<span class="pk-check">✓</span>' : ''}
            </div>`;
        if (live.length)
            html += `<div class="pk-group-h"><span class="pk-live-dot"></span>Đang live</div>${live
                .map((p) => pickerRow(p, p.post_id === selId))
                .join('')}`;
        if (ended.length)
            html += `<div class="pk-group-h">Đã live</div>${ended
                .map((p) => pickerRow(p, p.post_id === selId))
                .join('')}`;
        if (!posts.length) html += `<div class="pk-empty">Chưa có bài livestream nào.</div>`;
        pickerBody.innerHTML = html;
        pickerBack.classList.add('open');
        pickerEl.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closePicker() {
        pickerBack.classList.remove('open');
        pickerEl.classList.remove('open');
        document.body.style.overflow = '';
    }
    function selectPost(p) {
        selectedPost = p; // null = tất cả
        postSelLabel.textContent = p ? postLabel(p) : 'Tất cả livestream';
        updateLiveTag();
        closePicker();
        ALL = [];
        topId = null;
        load({ silent: false });
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
            const q = selectedPost
                ? `?postIds=${encodeURIComponent(selectedPost.post_id)}&limit=${POST_LIMIT}`
                : `?limit=${LIMIT}`;
            const r = await fetch(`${WORKER}/api/web2-live-comments/${q}`, { credentials: 'omit' });
            const j = await r.json();
            const data = (j && j.data) || [];
            const newTop = data[0] && String(data[0].id);
            const hadNew = topId && newTop && newTop !== topId && window.scrollY > 240;
            ALL = data;
            render(); // hiện ngay (initials + dữ liệu comment)
            topId = newTop;
            if (hadNew) showNewPill();
            // enrich kho + thumbnail song song → re-render khi xong
            Promise.allSettled([
                enrichWarehouse(data).then(render),
                fetchThumbs(data.slice(0, 60).map((c) => c.id)).then((t) => {
                    THUMBS = Object.assign({}, THUMBS, t);
                    render();
                }),
            ]);
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
        if (e.target.closest('a')) return;
        const card = e.target.closest('.card');
        if (card) openSheet(card.dataset.id);
    });
    sheetBack.addEventListener('click', closeSheet);
    pickerBack.addEventListener('click', closePicker);
    postSel.addEventListener('click', openPicker);
    pickerBody.addEventListener('click', (e) => {
        const row = e.target.closest('.pk-row');
        if (!row) return;
        const pid = row.dataset.post;
        if (!pid) return selectPost(null);
        const p = posts.find((x) => x.post_id === pid) || {
            post_id: pid,
            page_id: row.dataset.page,
        };
        selectPost(p);
    });
    $('#btnRefresh').addEventListener('click', () => {
        loadPosts();
        load({ silent: false });
    });
    $('#chips').addEventListener('click', (e) => {
        const ch = e.target.closest('.chip');
        if (!ch) return;
        if (ch.id === 'tgShop') {
            hideShop = !hideShop;
            localStorage.setItem(LS_HIDE_SHOP, hideShop ? '1' : '0');
            render();
            return;
        }
        if (ch.id === 'tgHidden') {
            showHidden = !showHidden;
            render();
            return;
        }
        // chip page/status (single-select)
        document
            .querySelectorAll('#chips .chip:not(.tg)')
            .forEach((x) => x.classList.toggle('on', x === ch));
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
    loadPosts();
    wireSse();
    setInterval(() => load({ silent: true }), 60000); // phòng SSE rớt
    setInterval(loadPosts, 90000); // refresh trạng thái live
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            load({ silent: true });
            loadPosts();
        }
    });
})();
