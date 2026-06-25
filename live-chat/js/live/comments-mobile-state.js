// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// comments-mobile-state.js — STATE + HELPERS dùng chung cho viewer comment
// livestream MOBILE (chỉ XEM). Tách MOVE-only từ comments-mobile.js (1132 dòng):
// hằng số, DOM refs, state mutable (1 nơi DUY NHẤT), helpers thuần (esc/time/
// avatar/enrich/filter). Các module render/actions/entry đọc-ghi qua window.LCM.
//   • Avatar  : worker /api/fb-avatar (giống SharedUtils.getAvatarUrl).
//   • Thumbnail: Render /api/livestream/snapshots/by-comment-ids (frame thật).
//   • Ẩn người: module LiveHiddenCommenters (record server `global`, SSE-sync).
//   • Địa chỉ/trạng thái: kho web2_customers (batch-by-phone / batch-by-fbid).
// Múi giờ hiển thị = GMT+7. Anti-jank: render debounce + cap rows + lazy media.
// =====================================================================
(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    // Snapshot phục vụ TRỰC TIẾP từ Render (worker proxy /api/livestream/*).
    const RENDER =
        (window.API_CONFIG && window.API_CONFIG.WEB2_API) || 'https://web2-api-kv04.onrender.com';
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
    window.LiveCommentList.renderComments = () => LCM.scheduleRender();

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
    // SĐT VN = ĐÚNG 10 số, bắt đầu '0' (0xxxxxxxxx). Tránh nhầm fb_id / dãy số dài
    // khác (vd fb_24084091254523635) thành SĐT khi enrich/khớp KH/hiển thị.
    function validPhone(p) {
        return /^0\d{9}$/.test(normP(p));
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
        const byP = validPhone(c.phone) && custMap.phone[normP(c.phone)];
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
    // SĐT: ưu tiên SĐT chính trên comment (10 số), nếu không có thì lấy SĐT trong
    // KHO web2_customers (khớp theo phone/fb_id) — GIỐNG desktop. Nhờ vậy KH chỉ có
    // SĐT ở kho (không kèm trong comment) vẫn hiện SĐT cùng lúc với địa chỉ.
    function phoneOf(c) {
        if (validPhone(c.phone)) return normP(c.phone);
        const w = whInfo(c);
        return w && validPhone(w.phone) ? normP(w.phone) : '';
    }
    // Đơn web (native-orders) tạo từ desktop (kéo SP vào comment) → đồng bộ xuống
    // mobile realtime qua SSE web2:native-orders. NATIVE: fbUserId → {stt, code}.
    // "Đã tạo giỏ" = has_order Pancake HOẶC có giỏ native.
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
    // Trạng thái KH = LUÔN lấy ở KHO web2_customers (w.status) → nhãn VN (LiveStatus
    // shared). KHÔNG để "Đã tạo giỏ" đè trạng thái — giỏ là badge RIÊNG (xem cardHtml).
    function statusOf(c) {
        const w = whInfo(c);
        if (w) {
            const n = window.LiveStatus
                ? window.LiveStatus.normalize(w.status)
                : { label: w.status || 'Khách quen', key: 'other' };
            return { label: n.label, cls: ST_CLS[n.key] || 'st-known' };
        }
        return { label: 'Mới', cls: 'st-new' };
    }

    async function postJson(path, body) {
        try {
            // x-web2-token bắt buộc (WEB2_AUTH_ENFORCE=1) — batch-by-phone/fbid đã gate
            // (audit r2). Thiếu token → 401 → enrich KH rỗng. (2026-06-21)
            let headers = { 'Content-Type': 'application/json' };
            if (window.Web2Auth?.authHeaders) {
                headers = window.Web2Auth.authHeaders(headers);
            } else {
                try {
                    const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                    if (t) headers['x-web2-token'] = t;
                } catch {
                    /* no token */
                }
            }
            const r = await fetch(WORKER + path, {
                method: 'POST',
                headers,
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
            ...new Set(data.map((c) => normP(c.phone)).filter((p) => /^0\d{9}$/.test(p))),
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
                            phone: normP(v.Phone || v.phone || k),
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
                            phone: normP(v.phone || v.Phone || ''),
                        };
                })
            );
        if (jobs.length) await Promise.allSettled(jobs);
    }

    // Kho KH đổi (SSE web2:customers) → xoá cache enrich + nạp lại cho comment đang
    // hiển thị → trạng thái/tên/địa chỉ tự cập nhật (1 nguồn chung web2_customers).
    async function refreshWarehouse() {
        custMap.phone = {};
        custMap.fb = {};
        try {
            await enrichWarehouse(LCM.ALL);
        } catch (_) {
            /* giữ map rỗng */
        }
        LCM.scheduleRender();
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
        if (filter === 'phone') return validPhone(c.phone);
        return true;
    }
    // Mode ĐANG LIVE: chỉ hiện comment của các bài đang live. Chưa biết bài nào live
    // (posts/Pancake chưa load) → cho qua tạm, lọc lại sau khi biết.
    function passLive(c) {
        if (!LCM.liveMode) return true;
        const s = LCM.livingSet();
        return s.size ? s.has(String(c.post_id)) : true;
    }
    const visible = (c) => pass(c) && !isHiddenPerson(c) && passLive(c);

    // =====================================================================
    // window.LCM — namespace cầu nối giữa các module (state mutable 1 nơi + helper).
    // Getter/setter cho state để render/actions/entry đọc-ghi đúng biến closure.
    // =====================================================================
    const LCM = (window.LCM = window.LCM || {});

    // constants
    LCM.WORKER = WORKER;
    LCM.RENDER = RENDER;
    LCM.LIMIT = LIMIT;
    LCM.POST_LIMIT = POST_LIMIT;
    LCM.RENDER_CAP_STEP = RENDER_CAP_STEP;
    LCM.THUMB_SCAN = THUMB_SCAN;
    LCM.LIVE_RECENT_MS = LIVE_RECENT_MS;
    LCM.PAGE = PAGE;
    LCM.AVC = AVC;
    LCM.ICO = ICO;
    LCM.TZ = TZ;

    // DOM refs
    LCM.$ = $;
    LCM.listEl = listEl;
    LCM.countEl = countEl;
    LCM.liveTag = liveTag;
    LCM.sheetEl = sheetEl;
    LCM.sheetBack = sheetBack;
    LCM.sheetBody = sheetBody;
    LCM.pickerEl = pickerEl;
    LCM.pickerBack = pickerBack;
    LCM.pickerBody = pickerBody;
    LCM.newpill = newpill;
    LCM.toastEl = toastEl;
    LCM.lightbox = lightbox;
    LCM.lightboxImg = lightboxImg;
    LCM.hideCountEl = hideCountEl;
    LCM.postSel = postSel;
    LCM.postSelLabel = postSelLabel;

    // state accessors (đọc/ghi đúng biến closure, KHÔNG copy)
    Object.defineProperties(LCM, {
        ALL: { get: () => ALL, set: (v) => (ALL = v), configurable: true },
        THUMBS: { get: () => THUMBS, set: (v) => (THUMBS = v), configurable: true },
        filter: { get: () => filter, set: (v) => (filter = v), configurable: true },
        selectedPost: {
            get: () => selectedPost,
            set: (v) => (selectedPost = v),
            configurable: true,
        },
        liveMode: { get: () => liveMode, set: (v) => (liveMode = v), configurable: true },
        posts: { get: () => posts, set: (v) => (posts = v), configurable: true },
        anyLive: { get: () => anyLive, set: (v) => (anyLive = v), configurable: true },
        topId: { get: () => topId, set: (v) => (topId = v), configurable: true },
        renderCap: { get: () => renderCap, set: (v) => (renderCap = v), configurable: true },
        NATIVE: { get: () => NATIVE, set: (v) => (NATIVE = v), configurable: true },
    });
    LCM.custMap = custMap;

    // helpers
    LCM.esc = esc;
    LCM.pageOf = pageOf;
    LCM.normP = normP;
    LCM.validPhone = validPhone;
    LCM.parseTs = parseTs;
    LCM.fmtTime = fmtTime;
    LCM.fmtFull = fmtFull;
    LCM.avHash = avHash;
    LCM.avatarHtml = avatarHtml;
    LCM.whInfo = whInfo;
    LCM.nameOf = nameOf;
    LCM.addrOf = addrOf;
    LCM.phoneOf = phoneOf;
    LCM.nativeOrder = nativeOrder;
    LCM.ordered = ordered;
    LCM.statusOf = statusOf;
    LCM.postJson = postJson;
    LCM.enrichWarehouse = enrichWarehouse;
    LCM.refreshWarehouse = refreshWarehouse;
    LCM.isShopOwn = isShopOwn;
    LCM.isHiddenPerson = isHiddenPerson;
    LCM.hiddenCount = hiddenCount;
    LCM.isStorePg = isStorePg;
    LCM.isHousePg = isHousePg;
    LCM.pass = pass;
    LCM.passLive = passLive;
    LCM.visible = visible;
})();
