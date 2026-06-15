// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — controller viewer comment live (mobile, chỉ xem).
// =====================================================================
// comments-mobile.js — viewer comment livestream MOBILE (chỉ XEM, không tạo
// đơn/chat). DÙNG CHUNG NGUỒN với live-chat/index.html để đỡ tốn tài nguyên:
//   • Avatar  : worker /api/fb-avatar (giống SharedUtils.getAvatarUrl).
//   • Thumbnail: Render /api/livestream/snapshots/by-comment-ids (frame thật).
//   • Ẩn người: module LiveHiddenCommenters (record server `global`, SSE-sync
//               mọi máy + desktop) — mặc định ẩn 2 page shop.
//   • Địa chỉ/trạng thái: kho web2_customers (batch-by-phone / batch-by-fbid).
//   • Tên bài : /posts (persist) + /page-posts (live).
// Múi giờ hiển thị = GMT+7. Anti-jank: render debounce + cap rows + lazy media.
// =====================================================================
(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    // Snapshot phục vụ TRỰC TIẾP từ Render (worker proxy /api/livestream/* → TPOS).
    const RENDER = 'https://web2-api-kv04.onrender.com';
    const LIMIT = 200; // "Tất cả livestream"
    const POST_LIMIT = 1000; // khi chọn 1 bài
    const RENDER_CAP_STEP = 100; // số dòng dựng mỗi lần (anti-jank)
    const THUMB_SCAN = 80; // số comment đầu xin thumbnail
    const LIVE_RECENT_MS = 12 * 60 * 1000;
    const PAGE = {
        270136663390370: { t: 'Store', c: 'pg-store' },
        117267091364524: { t: 'House', c: 'pg-house' },
    };

    // Shim cho LiveHiddenCommenters (module dùng chung): nó đọc workerUrl +
    // gọi LiveCommentList.renderComments() khi list ẩn đổi. ĐẶT TRƯỚC khi module
    // boot (script này load trước live-hidden-commenters.js).
    window.LiveState = window.LiveState || {};
    window.LiveState.workerUrl = WORKER;
    window.LiveCommentList = window.LiveCommentList || {};
    window.LiveCommentList.renderComments = () => scheduleRender();

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
    const hideCountEl = $('#hideCount');
    const postSel = $('#postSel');
    const postSelLabel = $('#postSelLabel');

    // ---------- state ----------
    let ALL = [];
    let THUMBS = {}; // commentId → { thumbnailUrl, livestreamUrl }
    let filter = '';
    let selectedPost = null;
    // MẶC ĐỊNH: chỉ xem các bài ĐANG LIVE (gộp House + Store nếu cả 2 đang live).
    // KHÔNG mặc định "Tất cả" (gồm cả bài đã xong). User chốt 2026-06-15.
    let liveMode = true;
    let posts = [];
    let anyLive = false;
    let topId = null;
    let renderCap = RENDER_CAP_STEP;
    const custMap = { phone: {}, fb: {} };

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
    // Avatar: DÙNG CHUNG worker /api/fb-avatar (giống SharedUtils.getAvatarUrl).
    // Lỗi/timeout → fallback initials màu (data-fb).
    function avatarHtml(c, big) {
        const cls = big ? 'sh-av' : 'av';
        const nm = nameOf(c);
        const initial = esc((nm || '?').trim().charAt(0).toUpperCase() || '?');
        const phDiv = `<div class="${cls} av-ph" style="background:${avHash(c.fb_id || nm)}">${initial}</div>`;
        const fid = String(c.fb_id || '');
        if (!fid) return phDiv;
        const pid = String(c.page_id || '');
        const url = `${WORKER}/api/fb-avatar?id=${encodeURIComponent(fid)}${pid ? '&page=' + encodeURIComponent(pid) : ''}`;
        return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.outerHTML=this.dataset.fb" data-fb='${phDiv.replace(/'/g, '&#39;')}'>`;
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
    // Đơn web (native-orders) tạo từ desktop (kéo SP vào comment) → đồng bộ xuống
    // mobile realtime qua SSE web2:native-orders. NATIVE: fbUserId → {stt, code}.
    // "Đã tạo đơn" = has_order Pancake HOẶC có đơn native.
    let NATIVE = {};
    const nativeOrder = (c) => (c && c.fb_id ? NATIVE[String(c.fb_id)] : null) || null;
    const ordered = (c) =>
        c.has_order === true || c.has_order === 't' || c.has_order === 1 || !!nativeOrder(c);
    const ST_CLS = {
        bom: 'st-bom',
        vip: 'st-vip',
        danger: 'st-danger',
        warn: 'st-warn',
        than: 'st-known',
        si: 'st-known',
        normal: 'st-known',
        other: 'st-known',
    };
    function statusOf(c) {
        if (ordered(c)) return { label: '✓ Đã tạo đơn', cls: 'st-order' };
        const w = whInfo(c);
        if (w) {
            // Trạng thái KH lấy ở KHO web2_customers (w.status) → nhãn VN (LiveStatus shared).
            const n = window.LiveStatus
                ? window.LiveStatus.normalize(w.status)
                : { label: w.status || 'Khách quen', key: 'other' };
            return { label: n.label, cls: ST_CLS[n.key] || 'st-known' };
        }
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
        if (!phones.length && !fbids.length) return;
        // NGUỒN CHUNG (shared) — cùng engine enrich với desktop (LiveCustomerSync).
        if (window.LiveCustomerSync) {
            const res = await window.LiveCustomerSync.enrich({
                workerUrl: WORKER,
                phones,
                fbIds: fbids,
            });
            for (const k of Object.keys(res.byPhone || {}))
                custMap.phone[normP(k)] = res.byPhone[k];
            for (const k of Object.keys(res.byFbId || {})) custMap.fb[String(k)] = res.byFbId[k];
            return;
        }
        // Fallback (module chưa load): fetch trực tiếp.
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

    // ---------- ẩn theo NGƯỜI (module dùng chung) ----------
    function isShopOwn(c) {
        const fid = String(c.fb_id || '');
        const pid = String(c.page_id || '');
        if (fid && pid && fid === pid) return true;
        return /nhijudy\s*(house|store)/i.test(String(c.customer_name || ''));
    }
    // Module dùng comment.from.id|fb_id + tên — shape mobile (fb_id/customer_name)
    // tương thích. Trước khi module load xong → fallback ẩn 2 page shop.
    function isHiddenPerson(c) {
        const H = window.LiveHiddenCommenters;
        if (H && H.isHidden) return H.isHidden(c);
        return isShopOwn(c);
    }
    function hiddenCount() {
        const H = window.LiveHiddenCommenters;
        return H && H.list ? H.list().length : 2;
    }

    // ---------- filters ----------
    const isStorePg = (c) => /store/i.test(c.page_name || '') || c.page_id == 270136663390370;
    const isHousePg = (c) => /house/i.test(c.page_name || '') || c.page_id == 117267091364524;
    function pass(c) {
        if (filter === 'store') return isStorePg(c);
        if (filter === 'house') return isHousePg(c);
        if (filter === 'order') return ordered(c);
        if (filter === 'phone') return !!(c.phone || '').trim();
        return true;
    }
    // Mode ĐANG LIVE: chỉ hiện comment của các bài đang live. Chưa biết bài nào live
    // (posts/Pancake chưa load) → cho qua tạm, lọc lại sau khi biết.
    function passLive(c) {
        if (!liveMode) return true;
        const s = livingSet();
        return s.size ? s.has(String(c.post_id)) : true;
    }
    const visible = (c) => pass(c) && !isHiddenPerson(c) && passLive(c);

    // Đếm SỐ ĐƠN đã tạo (distinct khách có has_order) theo page → badge trên chip
    // Store/House + tổng ở "Đã tạo đơn". Đếm trên ALL (không phụ thuộc filter/cap).
    function updateOrderCounts() {
        const cs = document.getElementById('cntStore');
        const ch = document.getElementById('cntHouse');
        const co = document.getElementById('cntOrder');
        if (!cs && !ch && !co) return;
        const store = new Set();
        const house = new Set();
        for (const c of ALL) {
            if (!ordered(c)) continue;
            const key = String(c.fb_id || c.id);
            if (isStorePg(c)) store.add(key);
            else if (isHousePg(c)) house.add(key);
        }
        if (cs) cs.textContent = store.size || '';
        if (ch) ch.textContent = house.size || '';
        if (co) co.textContent = store.size + house.size || '';
    }

    // ---------- render (debounce + cap → anti-jank) ----------
    function cardHtml(c) {
        const pg = pageOf(c);
        const st = statusOf(c);
        const no = nativeOrder(c); // đơn web (native-orders) của khách → STT badge
        const phone = (c.phone || '').trim();
        const addr = addrOf(c);
        const meta =
            phone || addr
                ? `<div class="meta">
                ${phone ? `<a class="mchip mc-phone" href="tel:${esc(phone)}" onclick="event.stopPropagation()">${ICO.phone}${esc(phone)}</a>` : ''}
                ${addr ? `<span class="mchip mc-addr">${ICO.pin}<span>${esc(addr)}</span></span>` : ''}
              </div>`
                : `<div class="meta"><span class="mchip mc-empty">Chưa có SĐT/địa chỉ</span></div>`;
        return `<article class="card${ordered(c) ? ' ordered' : ''}" data-id="${esc(c.id)}">
            <div class="c-top">
                ${avatarHtml(c)}
                <div class="c-id">
                    <div class="c-name"><span class="c-nm-txt">${esc(nameOf(c))}</span><span class="st ${st.cls}">${esc(st.label)}</span>${pg ? `<span class="pgbadge ${pg.c}">${esc(pg.t)}</span>` : ''}${no ? `<span class="cart-stt" title="Đơn web ${esc(no.code || '')} — STT ${esc(String(no.stt))}">🛒 ${esc(String(no.stt))}</span>` : ''}</div>
                    ${window.LiveTime ? window.LiveTime.markup(c.created_time, { tag: 'div', cls: 'c-time' }) : `<div class="c-time">${esc(fmtTime(c.created_time))}</div>`}
                </div>
            </div>
            <div class="c-body">
                <div class="c-main">
                    <p class="c-msg">${esc(c.message || '(không có nội dung)')}</p>
                    ${meta}
                </div>
            </div>
        </article>`;
    }

    let renderT;
    function scheduleRender() {
        clearTimeout(renderT);
        renderT = setTimeout(doRender, 80);
    }
    function doRender() {
        if (hideCountEl) hideCountEl.textContent = hiddenCount();
        updateOrderCounts();
        const rows = ALL.filter(visible);
        const _rt = realCommentTotal();
        countEl.textContent =
            (_rt != null
                ? _rt.toLocaleString('vi-VN')
                : rows.length + (rows.length >= LIMIT ? '+' : '')) + ' comment';
        if (!rows.length) {
            listEl.innerHTML = `<div class="empty"><div class="ic">🗒️</div>Chưa có comment ${filter || selectedPost || liveMode ? 'khớp bộ lọc' : 'nào'}.</div>`;
            return;
        }
        const shown = rows.slice(0, renderCap);
        let html = shown.map(cardHtml).join('');
        if (rows.length > renderCap)
            html += `<button class="more-btn" id="moreBtn">Xem thêm ${rows.length - renderCap} comment</button>`;
        listEl.innerHTML = html;
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
        const nm = nameOf(c);
        const fb = c.fb_id ? `https://facebook.com/${esc(c.fb_id)}` : '';
        const field = (k, v) =>
            `<div class="sh-field"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
        sheetBody.innerHTML = `
            <div class="sh-hero">
                ${avatarHtml(c, true)}
                <div style="min-width:0">
                    <div class="sh-name">${esc(nm)}</div>
                    <div class="sh-sub">${pg ? esc(pg.t) + ' · ' : ''}${esc(fmtTime(c.created_time))}</div>
                </div>
            </div>
            <div class="sh-quote">${esc(c.message || '(không có nội dung)')}</div>
            ${t.thumbnailUrl ? `<img class="sh-thumb" id="shThumb" src="${esc(t.thumbnailUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
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
            ${t.livestreamUrl ? `<a class="sh-hide" style="display:block;text-align:center;text-decoration:none;color:var(--c-primary)" href="${esc(t.livestreamUrl)}" target="_blank" rel="noopener">🎬 Xem khoảnh khắc trong livestream</a>` : ''}
            <button class="sh-hide" id="shHidePerson" data-fbid="${esc(c.fb_id || '')}" data-name="${esc(nm)}">🙈 Ẩn tất cả comment của người này</button>`;
        const sh = sheetBody.querySelector('#shThumb');
        if (sh)
            sh.addEventListener('click', () => {
                lightboxImg.src = t.thumbnailUrl;
                lightbox.classList.add('open');
            });
        const hp = sheetBody.querySelector('#shHidePerson');
        if (hp)
            hp.addEventListener('click', (e) => {
                const fid = e.currentTarget.dataset.fbid;
                if (!fid) return toast('Không có FB ID để ẩn');
                if (window.LiveHiddenCommenters?.hide)
                    window.LiveHiddenCommenters.hide(fid, e.currentTarget.dataset.name || '');
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

    // ---------- post picker ----------
    // post_id các bài ĐANG LIVE (= nhóm "Đang live" trong picker). Mode liveMode gộp
    // hết các bài này (House + Store nếu cả 2 đang live).
    const livingIds = () => posts.filter(postLiving).map((p) => String(p.post_id));
    const livingSet = () => new Set(livingIds()); // posts nhỏ → rebuild rẻ
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
                comment_count: p.comment_count || 0, // DB count (fallback)
                last_at: p.last_at,
                title: titleMap[String(p.post_id)] || p.title || '',
                living: liveMap[String(p.post_id)] || false,
            }));
            anyLive = posts.some(postLiving);
            updateLiveTag();
            // Nếu picker đang mở → refresh nội dung.
            if (pickerEl.classList.contains('open')) renderPicker();
            // Override comment_count = SỐ THẬT Pancake (comment_count post) — fetch trực
            // tiếp Pancake, KHÔNG poller. Fail (thiếu JWT) → giữ count DB (graceful).
            overrideRealCounts();
        } catch {
            /* giữ posts cũ */
        }
    }

    // Fetch tổng comment THẬT (comment_count) từ Pancake cho các page đang có bài →
    // override posts[].comment_count + living/title. Trực tiếp browser qua Web2Chat
    // (đã syncFromRenderDB), KHÔNG poller. Lỗi/thiếu JWT → giữ nguyên (graceful).
    async function overrideRealCounts() {
        if (!window.Web2Chat?.fetchLivePosts || !posts.length) return;
        try {
            const pageIds = [...new Set(posts.map((p) => p.page_id))];
            const results = await Promise.all(
                pageIds.map((pid) =>
                    window.Web2Chat.fetchLivePosts(pid).catch(() => ({ ok: false }))
                )
            );
            const real = {}; // post_id -> {commentCount, living, title}
            results.forEach((r) => {
                if (r && r.ok) r.posts.forEach((pp) => (real[pp.postId] = pp));
            });
            if (!Object.keys(real).length) return;
            posts = posts.map((p) => {
                const rp = real[p.post_id];
                if (!rp) return p;
                return {
                    ...p,
                    comment_count: rp.commentCount || p.comment_count,
                    living: rp.living || p.living,
                    title: rp.title || p.title,
                };
            });
            anyLive = posts.some(postLiving);
            updateLiveTag();
            scheduleRender(); // badge cập nhật số thật
            if (pickerEl.classList.contains('open')) renderPicker();
            // liveMode + giờ đã biết bài đang live → reload để query đúng bài live (gộp).
            if (liveMode && livingIds().length) load({ silent: true });
        } catch (_) {
            /* giữ count DB */
        }
    }

    // Tổng comment THẬT để hiển thị badge: post đang chọn → count post đó; "Tất cả" →
    // tổng count tất cả bài. Trả null nếu chưa có số thật (→ fallback đếm row đã load).
    function realCommentTotal() {
        if (!posts || !posts.length) return null;
        const inView = liveMode
            ? posts.filter(postLiving)
            : selectedPost
              ? posts.filter((p) => p.post_id === selectedPost.post_id)
              : posts;
        let sum = 0;
        let any = false;
        for (const p of inView) {
            if (p.comment_count > 0) {
                sum += p.comment_count;
                any = true;
            }
        }
        return any ? sum : null;
    }

    // Load đơn web (native-orders) → NATIVE map (fbUserId → {stt, code}) để hiện
    // "đã tạo đơn" + STT trên comment khách có đơn. STT = campaignStt ?? displayStt ??
    // sessionIndex (KHỚP trang Đơn Web). Scope theo bài đang có trong feed (tránh nhầm
    // đơn live cũ). Gọi lúc boot + khi SSE web2:native-orders báo (desktop tạo đơn).
    let _natT;
    function scheduleLoadNative() {
        clearTimeout(_natT);
        _natT = setTimeout(loadNativeOrders, 500);
    }
    async function loadNativeOrders() {
        try {
            // Endpoint LIST đúng là /load (giống NativeOrdersApi.list desktop). Gọi
            // /api/native-orders trần → worker đẩy sang TPOS → 404.
            const r = await fetch(`${WORKER}/api/native-orders/load?limit=500`, {
                credentials: 'omit',
            }).then((x) => x.json());
            const orders = (r && r.orders) || [];
            const postSet = new Set((posts || []).map((p) => String(p.post_id)));
            const m = {};
            for (const o of orders) {
                if (!o.fbUserId) continue;
                if (postSet.size && o.fbPostId && !postSet.has(String(o.fbPostId))) continue;
                const stt = o.campaignStt ?? o.displayStt ?? o.sessionIndex ?? '';
                if (m[o.fbUserId] === undefined)
                    m[o.fbUserId] = { stt: String(stt), code: o.code || '' };
            }
            NATIVE = m;
            scheduleRender();
        } catch (e) {
            /* giữ NATIVE cũ */
        }
    }

    function updateLiveTag() {
        const on = liveMode ? anyLive : selectedPost ? postLiving(selectedPost) : anyLive;
        liveTag.style.display = on ? '' : 'none';
    }
    function postLabel(p) {
        const pg = PAGE[p.page_id];
        const tag = pg ? pg.t : 'Live';
        const ttl = (p.title || '').trim();
        return ttl ? `${tag} · ${ttl.slice(0, 42)}` : `${tag} · ${fmtTime(p.last_at)}`;
    }
    function pickerRow(p, sel) {
        const pg = PAGE[p.page_id] || { t: 'Live', c: 'pg-store' };
        const ttl = (p.title || '').trim();
        return `<div class="pk-row${sel ? ' sel' : ''}" data-post="${esc(p.post_id)}" data-page="${esc(p.page_id)}">
            <span class="pk-pg ${pg.c}">${esc(pg.t)}</span>
            <div class="pk-main">
                <div class="pk-title">${esc(ttl || 'Buổi livestream')}</div>
                <div class="pk-sub">${esc(fmtTime(p.last_at))} · cập nhật gần nhất</div>
            </div>
            <span class="pk-cnt">${p.comment_count}</span>
            ${sel ? '<span class="pk-check">✓</span>' : ''}
        </div>`;
    }
    function renderPicker() {
        const live = posts.filter(postLiving);
        const ended = posts.filter((p) => !postLiving(p));
        const selId = !liveMode && selectedPost && selectedPost.post_id;
        const allSel = !liveMode && !selectedPost;
        let html = `<div class="pk-head">Chọn livestream</div>
            <div class="pk-row${liveMode ? ' sel' : ''}" data-post="__live">
                <span class="pk-pg" style="background:#ef4444">🔴</span>
                <div class="pk-main"><div class="pk-title">Đang livestream (gộp)</div>
                <div class="pk-sub">Chỉ bài đang live — House + Store (${live.length})</div></div>
                ${liveMode ? '<span class="pk-check">✓</span>' : ''}
            </div>
            <div class="pk-row${allSel ? ' sel' : ''}" data-post="">
                <span class="pk-pg" style="background:var(--c-primary)">All</span>
                <div class="pk-main"><div class="pk-title">Tất cả livestream</div>
                <div class="pk-sub">Gộp comment mới nhất mọi bài</div></div>
                ${allSel ? '<span class="pk-check">✓</span>' : ''}
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
    }
    function openPicker() {
        renderPicker();
        pickerBack.classList.add('open');
        pickerEl.classList.add('open');
        document.body.style.overflow = 'hidden';
        if (!posts.length) loadPosts();
    }
    function closePicker() {
        pickerBack.classList.remove('open');
        pickerEl.classList.remove('open');
        document.body.style.overflow = '';
    }
    function applyView() {
        postSelLabel.textContent = liveMode
            ? '🔴 Đang live'
            : selectedPost
              ? postLabel(selectedPost)
              : 'Tất cả livestream';
        updateLiveTag();
        closePicker();
        ALL = [];
        topId = null;
        renderCap = RENDER_CAP_STEP;
        load({ silent: false });
    }
    function selectLive() {
        liveMode = true;
        selectedPost = null;
        applyView();
    }
    function selectAll() {
        liveMode = false;
        selectedPost = null;
        applyView();
    }
    function selectPost(p) {
        liveMode = false;
        selectedPost = p;
        applyView();
    }

    // ---------- fetch ----------
    async function fetchThumbs(ids) {
        if (!ids.length) return {};
        try {
            const r = await fetch(
                `${RENDER}/api/livestream/snapshots/by-comment-ids?commentIds=${encodeURIComponent(ids.join(','))}`,
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
            // liveMode → query các bài ĐANG LIVE (gộp). Chưa biết bài live (posts chưa
            // load) → tạm tải all rồi reload sau khi biết. Specific post → bài đó. All → tất cả.
            let q;
            if (liveMode) {
                const ids = livingIds();
                q = ids.length
                    ? `?postIds=${encodeURIComponent(ids.join(','))}&limit=${POST_LIMIT}`
                    : `?limit=${LIMIT}`;
            } else if (selectedPost) {
                q = `?postIds=${encodeURIComponent(selectedPost.post_id)}&limit=${POST_LIMIT}`;
            } else {
                q = `?limit=${LIMIT}`;
            }
            const r = await fetch(`${WORKER}/api/web2-live-comments/${q}`, { credentials: 'omit' });
            const j = await r.json();
            const data = (j && j.data) || [];
            const newTop = data[0] && String(data[0].id);
            const hadNew = topId && newTop && newTop !== topId && window.scrollY > 240;
            ALL = data;
            scheduleRender();
            topId = newTop;
            primeFromData(data); // prime cursor cho LiveCommentsStream (SSE delta append)
            // KH mới từ comment → kho web2_customers (shared, dùng chung desktop).
            if (window.LiveCustomerSync)
                window.LiveCustomerSync.harvest(data, { workerUrl: WORKER });
            if (hadNew) showNewPill();
            // enrich kho (SĐT/địa chỉ/trạng thái). KHÔNG fetch thumbnail (user 2026-06-15:
            // mobile không hiện thumbnail → khỏi tốn băng thông).
            enrichWarehouse(data).then(scheduleRender);
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
        if (e.target.closest('#moreBtn')) {
            renderCap += RENDER_CAP_STEP;
            scheduleRender();
            return;
        }
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
        if (pid === '__live') return selectLive();
        if (!pid) return selectAll();
        const p = posts.find((x) => x.post_id === pid) || {
            post_id: pid,
            page_id: row.dataset.page,
        };
        selectPost(p);
    });
    $('#btnHidden').addEventListener('click', () => {
        if (window.LiveHiddenCommenters?.openManager) window.LiveHiddenCommenters.openManager();
        else toast('Đang tải danh sách ẩn…');
    });
    $('#btnRefresh').addEventListener('click', () => {
        loadPosts();
        load({ silent: false });
    });
    // Toàn màn hình (như F11): toggle Fullscreen API trên cả trang.
    const btnFull = $('#btnFull');
    if (btnFull) {
        btnFull.addEventListener('click', () => {
            try {
                if (!document.fullscreenElement) {
                    (
                        document.documentElement.requestFullscreen ||
                        document.documentElement.webkitRequestFullscreen
                    )?.call(document.documentElement);
                } else {
                    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
                }
            } catch (e) {
                toast('Trình duyệt không hỗ trợ toàn màn hình');
            }
        });
        document.addEventListener('fullscreenchange', () =>
            btnFull.classList.toggle('on', !!document.fullscreenElement)
        );
    }
    $('#chips').addEventListener('click', (e) => {
        const ch = e.target.closest('.chip');
        if (!ch) return;
        document
            .querySelectorAll('#chips .chip')
            .forEach((x) => x.classList.toggle('on', x === ch));
        filter = ch.dataset.pg || '';
        renderCap = RENDER_CAP_STEP;
        scheduleRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    newpill.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        newpill.classList.remove('show');
    });
    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));

    // pull-to-refresh
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

    // ---------- realtime SSE (engine SHARED LiveCommentsStream — BỎ poller comment) ----------
    let stream = null;

    function primeFromData(data) {
        if (!stream || !data || !data.length) return;
        let u = 0,
            c = 0;
        for (const r of data) {
            const uu = Number(r.updated_at) || 0;
            if (uu > u) u = uu;
            const cc = window.LiveTime ? window.LiveTime.parseMs(r.created_time) : 0;
            if (cc > c) c = cc;
        }
        stream.primeCursor({ updatedMs: u, createdMs: c });
    }

    function cardSel(id) {
        return '.card[data-id="' + String(id).replace(/["\\]/g, '\\$&') + '"]';
    }

    // Enrich KH (kho) cho các dòng MỚI rồi patch đúng card đó. KHÔNG fetch thumbnail
    // (user 2026-06-15: mobile không hiện thumbnail).
    async function enrichDelta(rows) {
        await enrichWarehouse(rows);
        for (const r of rows) {
            const cur = ALL.find((x) => String(x.id) === String(r.id));
            const el = listEl.querySelector(cardSel(r.id));
            if (cur && el) el.outerHTML = cardHtml(cur);
        }
    }

    // Burst guard fade card MỚI: flow thường → fade opacity thuần (dịu); dồn dập →
    // TẮT (hiện tức thì). Batch >5 HOẶC >12 card/2s = burst.
    let _animTimes = [];
    function shouldAnimateNew(n) {
        if (n > 5) return false;
        const now = Date.now();
        _animTimes = _animTimes.filter((t) => now - t < 2000);
        if (_animTimes.length >= 12) return false;
        for (let i = 0; i < n; i++) _animTimes.push(now);
        return true;
    }

    // APPEND incremental — KHÔNG full re-render. Dòng MỚI → prepend card lên đầu;
    // dòng CŨ (server fill phone/has_order) → patch đúng card theo data-id.
    function applyDelta(rows) {
        if (!rows || !rows.length) return;
        // KH mới từ comment realtime → kho web2_customers (shared).
        if (window.LiveCustomerSync) window.LiveCustomerSync.harvest(rows, { workerUrl: WORKER });
        // Chưa render gì (boot lỗi / list rỗng) → merge rồi render 1 lần (không lặp).
        if (!ALL.length || !listEl.querySelector('.card')) {
            const seen = {};
            ALL.forEach((x, i) => (seen[String(x.id)] = i));
            const fresh0 = [];
            rows.forEach((r) => {
                const i = seen[String(r.id)];
                if (i != null) ALL[i] = Object.assign({}, ALL[i], r);
                else {
                    ALL.unshift(r);
                    fresh0.push(r);
                }
            });
            scheduleRender();
            if (fresh0.length) enrichDelta(fresh0);
            return;
        }
        const fresh = [];
        for (const r of rows) {
            const idx = ALL.findIndex((x) => String(x.id) === String(r.id));
            if (idx >= 0) {
                ALL[idx] = Object.assign({}, ALL[idx], r);
                const el = listEl.querySelector(cardSel(r.id));
                if (el) el.outerHTML = cardHtml(ALL[idx]);
            } else {
                fresh.push(r);
            }
        }
        if (fresh.length) {
            // delta trả DESC (mới nhất trước) → unshift đảo để giữ DESC trong ALL.
            for (let i = fresh.length - 1; i >= 0; i--) ALL.unshift(fresh[i]);
            const vis = fresh.filter(visible);
            if (vis.length) {
                listEl.insertAdjacentHTML('afterbegin', vis.map(cardHtml).join(''));
                // Fade opacity thuần cho card mới (chuẩn livestream) — burst → bỏ qua.
                if (shouldAnimateNew(vis.length)) {
                    for (const r of vis) {
                        const el = listEl.querySelector(cardSel(r.id));
                        if (el) {
                            el.classList.add('is-new');
                            el.addEventListener(
                                'animationend',
                                () => el.classList.remove('is-new'),
                                { once: true }
                            );
                        }
                    }
                }
                if (window.scrollY > 240) showNewPill();
                topId = String(ALL[0] && ALL[0].id) || topId;
            }

            enrichDelta(fresh);
        }
        const vn = ALL.filter(visible).length;
        const _rt2 = realCommentTotal();
        countEl.textContent =
            (_rt2 != null ? _rt2.toLocaleString('vi-VN') : vn + (vn >= LIMIT ? '+' : '')) +
            ' comment';
        if (hideCountEl) hideCountEl.textContent = hiddenCount();
        updateOrderCounts();
    }

    function wireSse() {
        if (!window.LiveCommentsStream) {
            // Fallback (engine chưa load): SSE → silent full reload như cũ.
            if (!window.Web2SSE || !window.Web2SSE.subscribe) return;
            let sseT;
            window.Web2SSE.subscribe('web2:live-comments', () => {
                clearTimeout(sseT);
                sseT = setTimeout(() => load({ silent: true }), 800);
            });
            return;
        }
        stream = window.LiveCommentsStream.create({
            allowGlobal: true, // mobile xem toàn cục (hoặc 1 post nếu đã chọn)
            getWorkerUrl: () => WORKER,
            getPostIds: () => (liveMode ? livingIds() : selectedPost ? [selectedPost.post_id] : []),
            mapRow: (r) => r,
            getCreatedMs: (r) => (window.LiveTime ? window.LiveTime.parseMs(r.created_time) : 0),
            onDelta: (rows) => applyDelta(rows),
        });
        stream.start();
    }

    // ---------- boot ----------
    // Mặc định mode ĐANG LIVE (liveMode=true) → nhãn + tag phản ánh ngay.
    if (postSelLabel) postSelLabel.textContent = '🔴 Đang live';
    // Nạp JWT Pancake (Render DB) để Web2Chat.fetchLivePosts lấy comment_count THẬT.
    // Best-effort: lỗi → badge fallback đếm row đã load.
    if (window.Web2Chat?.syncFromRenderDB)
        window.Web2Chat.syncFromRenderDB()
            .then(() => loadPosts())
            .catch(() => {});
    load();
    loadPosts();
    loadNativeOrders();
    wireSse();
    // SERVER-DIRECT, KHÔNG POLL (user 2026-06-14/15): comment livestream về qua relay
    // web2-realtime Pancake WS join per-page `pages:{pageId}` → /ingest → DB → SSE
    // `web2:live-comments` → delta. Trang phải BẬT ở pancake-settings ("Server realtime").
    //
    // ZERO INTERVAL (user 2026-06-15): DANH SÁCH bài live cũng EVENT-DRIVEN qua SSE,
    // KHÔNG còn setInterval 90s. Có comment mới (web2:live-comments) → throttle 30s →
    // loadPosts (bắt bài live MỚI + cập nhật count/living). Leading-edge: comment đầu
    // sau quãng lặng chạy NGAY (bài mới hiện nhanh); đang live liên tục thì tối đa
    // 30s/lần. Idle (không ai comment) = KHÔNG chạy gì → không poll.
    if (window.Web2SSE && window.Web2SSE.subscribe) {
        let _postsAt = 0;
        window.Web2SSE.subscribe('web2:live-comments', () => {
            const now = Date.now();
            if (now - _postsAt < 30000) return;
            _postsAt = now;
            loadPosts();
        });
        // Desktop kéo SP tạo đơn native → SSE web2:native-orders → reload NATIVE map
        // (debounce 500ms) → comment khách đó tự hiện "đã tạo đơn" + STT, realtime.
        window.Web2SSE.subscribe('web2:native-orders', scheduleLoadNative);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (stream) stream.fetchNow();
            else load({ silent: true });
            loadPosts();
        }
    });
})();
