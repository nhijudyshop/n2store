// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// reconcile-api.js — load danh sách + lịch sử (audit log) + SSE realtime.
// Tách module (MOVE-only) từ reconcile-app.js gốc; logic giữ nguyên byte-for-byte.

(function () {
    'use strict';

    const RC = (window.RC = window.RC || {});
    const STATE = RC.STATE;
    const STATE_LABELS = RC.STATE_LABELS;
    const MANUAL_CAMERA_NOTE = RC.MANUAL_CAMERA_NOTE;
    const api = RC.api;
    const notify = RC.notify;

    // ---------- load list ----------
    async function loadList() {
        // Show skeleton while fetching
        const ul = document.getElementById('rcPbhList');
        const empty = document.getElementById('rcEmpty');
        if (ul) {
            ul.innerHTML =
                '<li class="w2-skel" style="height:62px;border-radius:8px;margin-bottom:4px;"></li>'.repeat(
                    4
                );
        }
        if (empty) empty.hidden = true;
        try {
            const q = new URLSearchParams({ state: STATE.filterState });
            if (STATE.search) q.set('search', STATE.search);
            const res = await api('GET', `/list?${q.toString()}`);
            STATE.items = res.items || [];
            RC.renderList();
        } catch (e) {
            if (ul) ul.innerHTML = '';
            notify('Lỗi tải DS PBH: ' + e.message, 'error');
        }
    }

    // ---------- history (audit log) ----------
    function historyNote(l) {
        const p = l.payload || {};
        const parts = [];
        if (p.productCode) parts.push(p.productCode);
        if (p.pickedQty != null) parts.push(`SL ${p.pickedQty}`);
        if (l.stateBefore && l.stateAfter && l.stateBefore !== l.stateAfter) {
            const a = STATE_LABELS[l.stateBefore] || l.stateBefore;
            const b = STATE_LABELS[l.stateAfter] || l.stateAfter;
            parts.push(`${a} → ${b}`);
        }
        // Tích tay (manual-pick) → luôn gắn cờ đối chiếu camera (suy ra từ action type,
        // bền vững kể cả log cũ chưa có payload.note). pickedQty=0 = bỏ tích, không gắn.
        if (l.action === 'manual-pick' && (p.pickedQty == null || p.pickedQty > 0)) {
            parts.push('📹 đối chiếu camera');
        }
        // p.note/reason khác (tránh lặp với cờ camera đã thêm ở trên)
        const extra = p.note || p.reason;
        if (extra && extra !== MANUAL_CAMERA_NOTE) parts.push(extra);
        return parts.join(' · ');
    }
    async function loadHistory(number) {
        if (!number) return;
        if (!STATE.historyOpen) return; // lịch sử ẩn → không fetch (lazy, chỉ tải khi mở)
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}/logs`);
            const items = (res.logs || []).map((l) => ({
                action: l.action,
                ts: l.createdAt,
                userName: l.userName,
                userId: l.userId,
                note: historyNote(l),
            }));
            // Logs về newest-first sẵn (ORDER BY created_at DESC) → giữ nguyên (newestFirst:false).
            STATE.historyHtml = window.Web2HistoryTimeline
                ? window.Web2HistoryTimeline.render(items, {
                      titleText: 'Lịch sử đối soát',
                      newestFirst: false,
                  })
                : '';
            // Chỉ inject nếu vẫn đang mở đúng PBH này.
            if (STATE.currentPbh?.number === number) {
                const el = document.getElementById('rcHistory');
                if (el) el.innerHTML = STATE.historyHtml;
            }
        } catch {
            /* lỗi tải lịch sử — không chặn flow chính */
        }
    }

    // ---------- SSE ----------
    // Debounce burst events (scan = nhiều event liên tiếp) để tránh race:
    // gom lại, gọi loadList 1 lần; detail của PBH đang chọn cũng debounce.
    const SSE_DEBOUNCE_MS = 500;
    let _sseListTimer = null;
    let _sseDetailTimer = null;
    function _scheduleSseList() {
        clearTimeout(_sseListTimer);
        _sseListTimer = setTimeout(loadList, SSE_DEBOUNCE_MS);
    }
    function _scheduleSseDetail(number) {
        clearTimeout(_sseDetailTimer);
        _sseDetailTimer = setTimeout(() => {
            api('GET', `/${encodeURIComponent(number)}`)
                .then((res) => {
                    STATE.currentPbh = res.pbh;
                    RC.renderDetail();
                    loadHistory(number);
                })
                .catch(() => {});
        }, SSE_DEBOUNCE_MS);
    }
    function setupSse() {
        if (!window.Web2SSE) return;
        // Topic riêng: web2:reconcile
        window.Web2SSE.subscribe('web2:reconcile', (msg) => {
            const data = msg?.data || msg;
            if (!data) return;
            // Refresh list (debounced)
            _scheduleSseList();
            // Nếu là PBH đang mở → refresh detail (debounced)
            if (data.number && STATE.selectedNumber === data.number) {
                _scheduleSseDetail(data.number);
            }
        });
        // Cross: PBH thay đổi (vd PBH mới được confirm) → refresh list (debounced)
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => {
            _scheduleSseList();
        });
    }

    RC.loadList = loadList;
    RC.historyNote = historyNote;
    RC.loadHistory = loadHistory;
    RC.setupSse = setupSse;
})();
