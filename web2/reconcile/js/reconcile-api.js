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
            loadCounts(); // #15: cập nhật badge số PBH mỗi tab (không chặn render list)
        } catch (e) {
            if (ul) ul.innerHTML = '';
            notify('Lỗi tải DS PBH: ' + e.message, 'error');
        }
    }

    // ---------- tab counts (#15) ----------
    // /health đã trả counts per fulfillment_state (kể cả 'returned') — FE trước đây
    // không hề dùng. Render số vào badge mỗi tab để biết backlog từng bước.
    async function loadCounts() {
        try {
            const res = await api('GET', '/health');
            const c = res.counts || {};
            const map = {
                active: (c.pending || 0) + (c.picking || 0) + (c.picked || 0) + (c.packed || 0),
                pending: c.pending || 0,
                picking: c.picking || 0,
                picked: c.picked || 0,
                packed: c.packed || 0,
                shipped: c.shipped || 0,
                delivered: c.delivered || 0,
                returned: c.returned || 0,
            };
            document.querySelectorAll('#rcStateTabs .rc-tab').forEach((t) => {
                const n = map[t.dataset.state] || 0;
                let b = t.querySelector('.rc-tab-badge');
                if (n > 0) {
                    if (!b) {
                        b = document.createElement('span');
                        b.className = 'rc-tab-badge';
                        t.appendChild(b);
                    }
                    b.textContent = n > 99 ? '99+' : String(n);
                } else if (b) {
                    b.remove();
                }
            });
        } catch {
            /* /health lỗi — bỏ qua badge, không chặn flow */
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
            // #33: lỗi tải lịch sử — KHÔNG nuốt im (trước đây kẹt "Đang tải lịch sử…").
            // Không toast (không chặn flow chính), chỉ hiện trạng thái lỗi để khỏi treo spinner.
            if (STATE.currentPbh?.number === number) {
                const el = document.getElementById('rcHistory');
                if (el)
                    el.innerHTML =
                        '<div class="rc-history-loading">Không tải được lịch sử — đóng/mở lại để thử.</div>';
            }
        }
    }

    // ---------- snapshots (ảnh bằng chứng tích-tay) ----------
    const _snapTsFmt = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    function fmtSnapTs(ts) {
        try {
            return _snapTsFmt.format(new Date(Number(ts)));
        } catch {
            return '';
        }
    }
    // Ảnh cần x-web2-token (router gate) → fetch blob → objectURL (<img> không set header được).
    async function fetchSnapshotBlobUrl(id) {
        try {
            const r = await fetch(`${RC.API}/snapshot/${id}/image`, {
                headers: { ...((window.Web2Auth && window.Web2Auth.authHeaders()) || {}) },
            });
            if (!r.ok) return null;
            return URL.createObjectURL(await r.blob());
        } catch {
            return null;
        }
    }
    async function loadSnapshots(number) {
        const box = document.getElementById('rcSnapshots');
        if (!box) return;
        try {
            const res = await api('GET', `/${encodeURIComponent(number)}/snapshots`);
            const snaps = res.snapshots || [];
            if (!snaps.length) {
                box.hidden = true;
                box.innerHTML = '';
                return;
            }
            box.hidden = false;
            box.innerHTML =
                `<div class="rc-snap-title"><i data-lucide="camera"></i> Ảnh đối soát tay (${snaps.length})</div>` +
                '<div class="rc-snap-grid">' +
                snaps
                    .map(
                        (s) => `<figure class="rc-snap-item" data-id="${s.id}">
                        <div class="rc-snap-imgwrap"><img alt="ảnh đối soát tay" loading="lazy" /></div>
                        <figcaption>${RC.escapeHtml(s.productCode || '(chung)')}<br>
                            <span>${fmtSnapTs(s.capturedAt)}${s.userName ? ' · ' + RC.escapeHtml(s.userName) : ''}</span>
                        </figcaption>
                    </figure>`
                    )
                    .join('') +
                '</div>';
            if (window.lucide) window.lucide.createIcons();
            // Nạp ảnh (auth) → objectURL → src + click mở lightbox.
            for (const s of snaps) {
                const img = box.querySelector(`.rc-snap-item[data-id="${s.id}"] img`);
                if (!img) continue;
                fetchSnapshotBlobUrl(s.id).then((url) => {
                    if (!url) return;
                    img.src = url;
                    img.style.cursor = 'zoom-in';
                    img.addEventListener('click', () => window.Web2ImageLightbox?.open?.(url));
                });
            }
        } catch {
            box.hidden = true;
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
                    // Chống race: user đã chuyển sang PBH khác trong lúc debounce/fetch
                    // → bỏ qua, không clobber detail/lịch sử của PBH đang mở (mirror selectPbh).
                    if (STATE.selectedNumber !== number) return;
                    STATE.currentPbh = res.pbh;
                    RC.renderDetail();
                    loadHistory(number);
                })
                .catch(() => {});
        }, SSE_DEBOUNCE_MS);
    }
    // #31: lưu unsub fn của mỗi subscribe → gỡ khi rời trang (tránh listener leak
    // + callback chạy trên DOM/STATE đã detach nếu setupSse gọi lại).
    let _sseUnsubs = [];
    function setupSse() {
        if (!window.Web2SSE) return;
        // Topic riêng: web2:reconcile
        _sseUnsubs.push(
            window.Web2SSE.subscribe('web2:reconcile', (msg) => {
                const data = msg?.data || msg;
                if (!data) return;
                // Refresh list (debounced)
                _scheduleSseList();
                // Nếu là PBH đang mở → refresh detail (debounced)
                if (data.number && STATE.selectedNumber === data.number) {
                    _scheduleSseDetail(data.number);
                }
            })
        );
        // Cross: PBH thay đổi (vd PBH mới được confirm) → refresh list (debounced)
        _sseUnsubs.push(
            window.Web2SSE.subscribe('web2:fast-sale-orders', () => {
                _scheduleSseList();
            })
        );
        window.addEventListener(
            'pagehide',
            () => {
                _sseUnsubs.forEach((u) => {
                    try {
                        u && u();
                    } catch {
                        /* unsub lỗi — bỏ qua */
                    }
                });
                _sseUnsubs = [];
                clearTimeout(_sseListTimer);
                clearTimeout(_sseDetailTimer);
            },
            { once: true }
        );
    }

    RC.loadList = loadList;
    RC.loadCounts = loadCounts;
    RC.loadSnapshots = loadSnapshots;
    RC.historyNote = historyNote;
    RC.loadHistory = loadHistory;
    RC.setupSse = setupSse;
})();
