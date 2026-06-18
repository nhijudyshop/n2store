// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// comments-mobile-entry.js — EVENTS + BOOT cho viewer comment livestream
// MOBILE. Tách MOVE-only từ comments-mobile.js: tất cả listener UI (list/sheet/
// picker/chips/refresh/fullscreen/lightbox), pull-to-refresh, boot sequence
// (load + loadPosts + native + wireSse + SSE subscribe + visibilitychange).
// Load CUỐI CÙNG sau state/render/actions. Đọc-ghi qua window.LCM.
// =====================================================================
(function () {
    'use strict';

    const LCM = window.LCM;

    const $ = LCM.$;
    const listEl = LCM.listEl;
    const sheetBack = LCM.sheetBack;
    const pickerBack = LCM.pickerBack;
    const postSel = LCM.postSel;
    const pickerBody = LCM.pickerBody;
    const newpill = LCM.newpill;
    const lightbox = LCM.lightbox;
    const postSelLabel = LCM.postSelLabel;
    const RENDER_CAP_STEP = LCM.RENDER_CAP_STEP;

    // ---------- events ----------
    listEl.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        if (e.target.closest('#moreBtn')) {
            LCM.renderCap += RENDER_CAP_STEP;
            LCM.scheduleRender();
            return;
        }
        const card = e.target.closest('.card');
        if (card) LCM.openSheet(card.dataset.id);
    });
    sheetBack.addEventListener('click', LCM.closeSheet);
    pickerBack.addEventListener('click', LCM.closePicker);
    postSel.addEventListener('click', LCM.openPicker);
    pickerBody.addEventListener('click', (e) => {
        const row = e.target.closest('.pk-row');
        if (!row) return;
        const pid = row.dataset.post;
        if (pid === '__live') return LCM.selectLive();
        if (!pid) return LCM.selectAll();
        const p = LCM.posts.find((x) => x.post_id === pid) || {
            post_id: pid,
            page_id: row.dataset.page,
        };
        LCM.selectPost(p);
    });
    $('#btnHidden').addEventListener('click', () => {
        if (window.LiveHiddenCommenters?.openManager) window.LiveHiddenCommenters.openManager();
        else LCM.toast('Đang tải danh sách ẩn…');
    });
    $('#btnRefresh').addEventListener('click', () => {
        LCM.loadPosts();
        LCM.load({ silent: false });
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
                LCM.toast('Trình duyệt không hỗ trợ toàn màn hình');
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
        LCM.filter = ch.dataset.pg || '';
        LCM.renderCap = RENDER_CAP_STEP;
        LCM.scheduleRender();
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
                LCM.load({ silent: false });
                LCM.toast('Đang làm mới…');
            }
            pulling = false;
        },
        { passive: true }
    );

    // ---------- boot ----------
    // Mặc định mode ĐANG LIVE (liveMode=true) → nhãn + tag phản ánh ngay.
    if (postSelLabel) postSelLabel.textContent = '🔴 Đang live';
    // Nạp JWT Pancake (Render DB) để Web2Chat.fetchLivePosts lấy comment_count THẬT.
    // Best-effort: lỗi → badge fallback đếm row đã load.
    if (window.Web2Chat?.syncFromRenderDB)
        window.Web2Chat.syncFromRenderDB()
            .then(() => LCM.loadPosts())
            .catch(() => {});
    LCM.load();
    LCM.loadPosts();
    LCM.loadNativeOrders();
    LCM.wireSse();
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
            LCM.loadPosts();
        });
        // Desktop kéo SP tạo đơn native → SSE web2:native-orders → reload NATIVE map
        // (debounce 500ms) → comment khách đó tự hiện "đã tạo đơn" + STT, realtime.
        window.Web2SSE.subscribe('web2:native-orders', LCM.scheduleLoadNative);
        // Kho KH (web2_customers) đổi (trạng thái/tên/SĐT ở bất kỳ trang nào) → xoá
        // cache enrich + nạp lại → trạng thái/tên trên comment tự cập nhật (1 nguồn chung).
        let _custT;
        window.Web2SSE.subscribe('web2:customers', () => {
            clearTimeout(_custT);
            _custT = setTimeout(LCM.refreshWarehouse, 600);
        });
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const stream = LCM.getStream();
            if (stream) stream.fetchNow();
            else LCM.load({ silent: true });
            LCM.loadPosts();
        }
    });
})();
