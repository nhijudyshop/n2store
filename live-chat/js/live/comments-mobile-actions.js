// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// comments-mobile-actions.js — DATA + REALTIME cho viewer comment livestream
// MOBILE. Tách MOVE-only từ comments-mobile.js: đếm đơn theo page, post picker
// data (loadPosts/overrideRealCounts/realCommentTotal), native-orders map,
// live tag, fetch thumbnail + load comment, toast/pill, SSE delta stream
// (LiveCommentsStream). Đọc-ghi state qua window.LCM.
// =====================================================================
(function () {
    'use strict';

    const LCM = (window.LCM = window.LCM || {});

    // Helpers ổn định (state module, load TRƯỚC). State mutable + render gọi qua LCM.*.
    const { esc, parseTs, fmtTime, normP, enrichWarehouse, ordered, isStorePg, isHousePg, PAGE } =
        LCM;

    const WORKER = LCM.WORKER;
    const RENDER = LCM.RENDER;
    const LIMIT = LCM.LIMIT;
    const POST_LIMIT = LCM.POST_LIMIT;
    const LIVE_RECENT_MS = LCM.LIVE_RECENT_MS;
    const $ = LCM.$;
    const listEl = LCM.listEl;
    const liveTag = LCM.liveTag;
    const toastEl = LCM.toastEl;
    const newpill = LCM.newpill;
    const pickerEl = LCM.pickerEl;

    // Đếm SỐ GIỎ đã tạo (distinct khách có has_order) theo page → badge trên chip
    // Store/House + tổng ở "Đã tạo giỏ". Đếm trên ALL (không phụ thuộc filter/cap).
    function updateOrderCounts() {
        const cs = document.getElementById('cntStore');
        const ch = document.getElementById('cntHouse');
        const co = document.getElementById('cntOrder');
        if (!cs && !ch && !co) return;
        const store = new Set();
        const house = new Set();
        for (const c of LCM.ALL) {
            if (!ordered(c)) continue;
            const key = String(c.fb_id || c.id);
            if (isStorePg(c)) store.add(key);
            else if (isHousePg(c)) house.add(key);
        }
        if (cs) cs.textContent = store.size || '';
        if (ch) ch.textContent = house.size || '';
        if (co) co.textContent = store.size + house.size || '';
    }

    // ---------- post picker ----------
    // post_id các bài ĐANG LIVE (= nhóm "Đang live" trong picker). Mode liveMode gộp
    // hết các bài này (House + Store nếu cả 2 đang live).
    const livingIds = () => LCM.posts.filter(postLiving).map((p) => String(p.post_id));
    const livingSet = () => new Set(livingIds()); // posts nhỏ → rebuild rẻ
    function postLiving(p) {
        if (p.living) return true;
        const d = parseTs(p.last_at || p.date);
        return d ? Date.now() - d.getTime() < LIVE_RECENT_MS : false;
    }
    async function loadPosts() {
        try {
            const _h = (window.Web2Auth && window.Web2Auth.authHeaders()) || {}; // x-web2-token (API gate)
            const [a, b] = await Promise.allSettled([
                fetch(`${WORKER}/api/web2-live-comments/posts`, {
                    credentials: 'omit',
                    headers: _h,
                }).then((r) => r.json()),
                fetch(`${WORKER}/api/web2-live-comments/page-posts`, {
                    credentials: 'omit',
                    headers: _h,
                }).then((r) => r.json()),
            ]);
            const withComments = (a.status === 'fulfilled' && a.value.data) || [];
            const pagePosts = (b.status === 'fulfilled' && b.value.data) || [];
            const liveMap = {};
            const titleMap = {};
            for (const pp of pagePosts) {
                liveMap[String(pp.postId)] = !!pp.living;
                if (pp.title) titleMap[String(pp.postId)] = pp.title;
            }
            LCM.posts = withComments.map((p) => ({
                post_id: String(p.post_id),
                page_id: String(p.page_id),
                comment_count: p.comment_count || 0, // DB count (fallback)
                last_at: p.last_at,
                title: titleMap[String(p.post_id)] || p.title || '',
                living: liveMap[String(p.post_id)] || false,
            }));
            LCM.anyLive = LCM.posts.some(postLiving);
            updateLiveTag();
            // Nếu picker đang mở → refresh nội dung.
            if (pickerEl.classList.contains('open')) LCM.renderPicker();
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
        if (!window.Web2Chat?.fetchLivePosts || !LCM.posts.length) return;
        try {
            const pageIds = [...new Set(LCM.posts.map((p) => p.page_id))];
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
            LCM.posts = LCM.posts.map((p) => {
                const rp = real[p.post_id];
                if (!rp) return p;
                return {
                    ...p,
                    comment_count: rp.commentCount || p.comment_count,
                    living: rp.living || p.living,
                    title: rp.title || p.title,
                };
            });
            LCM.anyLive = LCM.posts.some(postLiving);
            updateLiveTag();
            LCM.scheduleRender(); // badge cập nhật số thật
            if (pickerEl.classList.contains('open')) LCM.renderPicker();
            // liveMode + giờ đã biết bài đang live → reload để query đúng bài live (gộp).
            if (LCM.liveMode && livingIds().length) load({ silent: true });
        } catch (_) {
            /* giữ count DB */
        }
    }

    // Tổng comment THẬT để hiển thị badge: post đang chọn → count post đó; "Tất cả" →
    // tổng count tất cả bài. Trả null nếu chưa có số thật (→ fallback đếm row đã load).
    function realCommentTotal() {
        if (!LCM.posts || !LCM.posts.length) return null;
        const inView = LCM.liveMode
            ? LCM.posts.filter(postLiving)
            : LCM.selectedPost
              ? LCM.posts.filter((p) => p.post_id === LCM.selectedPost.post_id)
              : LCM.posts;
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
            // /api/native-orders trần → worker đẩy sang catch-all → 404.
            const r = await fetch(`${WORKER}/api/native-orders/load?limit=500`, {
                credentials: 'omit',
            }).then((x) => x.json());
            const orders = (r && r.orders) || [];
            const postSet = new Set((LCM.posts || []).map((p) => String(p.post_id)));
            const m = {};
            for (const o of orders) {
                if (!o.fbUserId) continue;
                if (postSet.size && o.fbPostId && !postSet.has(String(o.fbPostId))) continue;
                const stt = o.campaignStt ?? o.displayStt ?? o.sessionIndex ?? '';
                if (m[o.fbUserId] === undefined)
                    m[o.fbUserId] = { stt: String(stt), code: o.code || '' };
            }
            LCM.NATIVE = m;
            LCM.scheduleRender();
        } catch (e) {
            /* giữ NATIVE cũ */
        }
    }

    function updateLiveTag() {
        const on = LCM.liveMode
            ? LCM.anyLive
            : LCM.selectedPost
              ? postLiving(LCM.selectedPost)
              : LCM.anyLive;
        liveTag.style.display = on ? '' : 'none';
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
        if (!LCM.ALL.length && !opts.silent) LCM.skeleton();
        try {
            // liveMode → query các bài ĐANG LIVE (gộp). Chưa biết bài live (posts chưa
            // load) → tạm tải all rồi reload sau khi biết. Specific post → bài đó. All → tất cả.
            let q;
            if (LCM.liveMode) {
                const ids = livingIds();
                q = ids.length
                    ? `?postIds=${encodeURIComponent(ids.join(','))}&limit=${POST_LIMIT}`
                    : `?limit=${LIMIT}`;
            } else if (LCM.selectedPost) {
                q = `?postIds=${encodeURIComponent(LCM.selectedPost.post_id)}&limit=${POST_LIMIT}`;
            } else {
                q = `?limit=${LIMIT}`;
            }
            const r = await fetch(`${WORKER}/api/web2-live-comments/${q}`, {
                credentials: 'omit',
                headers: (window.Web2Auth && window.Web2Auth.authHeaders()) || {}, // x-web2-token
            });
            const j = await r.json();
            const data = (j && j.data) || [];
            LCM.ALL = data;
            LCM.topId = (data[0] && String(data[0].id)) || null;
            // Reconciler giữ nguyên card cũ (cùng id) → reload full KHÔNG nháy; pill
            // "comment mới" tự hiện khi có card mới + đang cuộn xuống (xem doRender).
            LCM.scheduleRender();
            primeFromData(data); // prime cursor cho LiveCommentsStream (SSE delta append)
            // KH mới từ comment → kho web2_customers (shared, dùng chung desktop).
            if (window.LiveCustomerSync)
                window.LiveCustomerSync.harvest(data, { workerUrl: WORKER });
            // enrich kho (SĐT/địa chỉ/trạng thái). KHÔNG fetch thumbnail (user 2026-06-15:
            // mobile không hiện thumbnail → khỏi tốn băng thông).
            enrichWarehouse(data).then(LCM.scheduleRender);
        } catch (e) {
            if (!LCM.ALL.length)
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

    // Enrich KH (kho) cho các dòng MỚI rồi re-render — reconciler tự patch ĐÚNG card
    // đổi nội dung (giữ avatar đã tải). KHÔNG fetch thumbnail (mobile không hiện).
    async function enrichDelta(rows) {
        await enrichWarehouse(rows);
        LCM.scheduleRender();
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

    // Delta SSE → MERGE vào ALL rồi 1 lần scheduleRender. Reconciler giữ nguyên card
    // cũ (không nháy avatar/SĐT/địa chỉ/nội dung), chỉ chèn card mới (fade-in) + patch
    // card đổi nội dung. KHÔNG full re-render, KHÔNG dual-path lệch nhau.
    function applyDelta(rows) {
        if (!rows || !rows.length) return;
        // KH mới từ comment realtime → kho web2_customers (shared).
        if (window.LiveCustomerSync) window.LiveCustomerSync.harvest(rows, { workerUrl: WORKER });
        const seen = new Map();
        LCM.ALL.forEach((x, i) => seen.set(String(x.id), i));
        const fresh = [];
        for (const r of rows) {
            const i = seen.get(String(r.id));
            if (i != null) LCM.ALL[i] = Object.assign({}, LCM.ALL[i], r);
            else fresh.push(r);
        }
        if (fresh.length) {
            // delta trả DESC (mới nhất trước) → unshift đảo để giữ DESC trong ALL.
            for (let i = fresh.length - 1; i >= 0; i--) LCM.ALL.unshift(fresh[i]);
            LCM.topId = String(LCM.ALL[0] && LCM.ALL[0].id) || LCM.topId;
        }
        LCM.scheduleRender();
        if (fresh.length) enrichDelta(fresh);
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
            getPostIds: () =>
                LCM.liveMode ? livingIds() : LCM.selectedPost ? [LCM.selectedPost.post_id] : [],
            mapRow: (r) => r,
            getCreatedMs: (r) => (window.LiveTime ? window.LiveTime.parseMs(r.created_time) : 0),
            onDelta: (rows) => applyDelta(rows),
            // Boost-purge: server gỡ spam → lọc khỏi LCM.ALL + render lại (delta chỉ append).
            onReconcile: (ids) => {
                const idSet = new Set((ids || []).map(String));
                if (!idSet.size) return;
                const before = LCM.ALL.length;
                LCM.ALL = LCM.ALL.filter((c) => !idSet.has(String(c.id)));
                if (LCM.ALL.length !== before) LCM.scheduleRender();
            },
        });
        stream.start();
    }

    // ---- expose ----
    LCM.updateOrderCounts = updateOrderCounts;
    LCM.livingIds = livingIds;
    LCM.livingSet = livingSet;
    LCM.postLiving = postLiving;
    LCM.loadPosts = loadPosts;
    LCM.overrideRealCounts = overrideRealCounts;
    LCM.realCommentTotal = realCommentTotal;
    LCM.scheduleLoadNative = scheduleLoadNative;
    LCM.loadNativeOrders = loadNativeOrders;
    LCM.updateLiveTag = updateLiveTag;
    LCM.fetchThumbs = fetchThumbs;
    LCM.load = load;
    LCM.toast = toast;
    LCM.showNewPill = showNewPill;
    LCM.primeFromData = primeFromData;
    LCM.enrichDelta = enrichDelta;
    LCM.shouldAnimateNew = shouldAnimateNew;
    LCM.applyDelta = applyDelta;
    LCM.wireSse = wireSse;
    LCM.getStream = () => stream; // entry visibilitychange cần stream.fetchNow()
})();
