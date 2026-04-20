// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// MERGE "SP CHỜ LIVE" — Gộp sản phẩm từ giỏ cũ có flag CHO_LIVE sang giỏ live mới nhất cùng SĐT.
//
// Phụ thuộc (đã expose window bởi các file nạp trước):
//   - normalizeMergePhone, getOrderDetails, updateOrderWithFullPayload, saveMergeHistory (tab1-merge.js)
//   - ProcessingTagState, assignTTagToOrder, assignOrderCategory (tab1-processing-tags.js)
//   - displayedData (tab1-core.js — global let, truy cập trực tiếp)
//   - escapeHtml, showNotification (global helpers)
// =====================================================

(function () {
    'use strict';

    const LOG = '[MERGE-LIVE-WAITING]';
    const NOTE_MARKER = 'Hàng Live Cũ';
    const SOURCE_LABEL = 'Gộp SP Chờ Live';

    // Module state (tái tạo mỗi lần mở modal)
    let mlwState = {
        mode: 'campaign',       // 'campaign' | 'date'
        clusters: [],           // Array<{ id, phone, targetOrder, sourceOrders, sourceTTags, previewProducts }>
        selected: new Set(),    // Set<clusterId>
        running: false
    };

    // =====================================================
    // HELPERS
    // =====================================================

    function _escape(s) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(s == null ? '' : String(s));
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _notify(msg, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type || 'info');
        } else {
            console.log(`${LOG} [${type || 'info'}] ${msg}`);
        }
    }

    function appendNote(existing, marker) {
        const cur = (existing || '').trim();
        if (!cur) return marker;
        if (cur.includes(marker)) return cur;
        return `${cur} | ${marker}`;
    }

    function hasChoLiveFlag(orderCode) {
        const state = window.ProcessingTagState;
        if (!state || !orderCode) return false;
        const data = state.getOrderData(String(orderCode));
        if (!data || !Array.isArray(data.flags)) return false;
        return data.flags.some(f => {
            const id = (typeof f === 'object' && f) ? f.id : f;
            return id === 'CHO_LIVE';
        });
    }

    function getTTagsForOrder(orderCode) {
        const state = window.ProcessingTagState;
        if (!state || !orderCode) return [];
        const data = state.getOrderData(String(orderCode));
        if (!data || !Array.isArray(data.tTags)) return [];
        return data.tTags.map(t => {
            if (typeof t === 'object' && t && t.id) return { id: t.id, name: t.name || t.id };
            return { id: String(t), name: String(t) };
        });
    }

    function unionTTags(listOfLists) {
        const map = new Map();
        listOfLists.forEach(arr => {
            (arr || []).forEach(t => {
                if (t && t.id && !map.has(t.id)) map.set(t.id, t);
            });
        });
        return Array.from(map.values());
    }

    function formatDateShort(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch { return String(iso); }
    }

    function formatVND(n) {
        const v = Number(n) || 0;
        return v.toLocaleString('vi-VN') + 'đ';
    }

    // =====================================================
    // CORE: PHÂN LOẠI LIVE VÀ TÌM CLUSTER
    // =====================================================

    /**
     * Group displayedData theo LiveCampaignId, sort desc theo thời gian mới nhất.
     * Orders không có LiveCampaignId → gom vào nhóm riêng '__no_live__' (không dùng làm target/source live).
     * @returns {Array<{campaignId, campaignName, latestDate, orders}>}
     */
    function groupByLiveCampaign(orders) {
        const map = new Map();
        for (const o of orders) {
            const cid = o.LiveCampaignId || '__no_live__';
            if (!map.has(cid)) {
                map.set(cid, {
                    campaignId: cid,
                    campaignName: o.LiveCampaignName || (cid === '__no_live__' ? '(Không live)' : cid),
                    latestDate: o.DateCreated,
                    orders: []
                });
            }
            const g = map.get(cid);
            g.orders.push(o);
            if (new Date(o.DateCreated) > new Date(g.latestDate)) g.latestDate = o.DateCreated;
        }
        const arr = Array.from(map.values()).filter(g => g.campaignId !== '__no_live__');
        arr.sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
        return arr;
    }

    /**
     * Pick latest order theo DateCreated (fallback SessionIndex) từ danh sách orders cùng SĐT.
     */
    function pickLatestOrder(orders) {
        return orders.slice().sort((a, b) => {
            const dt = new Date(b.DateCreated) - new Date(a.DateCreated);
            if (dt !== 0) return dt;
            return (b.SessionIndex || 0) - (a.SessionIndex || 0);
        })[0];
    }

    /**
     * Tìm cluster theo mode.
     *  - campaign: group by LiveCampaignId → target = live [0], sources = live [1..2]. Chỉ lấy source orders có flag CHO_LIVE.
     *  - date:    target = order mới nhất theo DateCreated per phone; sources = các order cũ hơn cùng SĐT có CHO_LIVE.
     */
    function findClusters(mode) {
        const data = Array.isArray(window.displayedData)
            ? window.displayedData
            : (typeof displayedData !== 'undefined' ? displayedData : []);

        if (!Array.isArray(data) || data.length === 0) {
            return { clusters: [], meta: { mode, message: 'Không có đơn nào trong bộ lọc hiện tại.' } };
        }

        let targetOrders = [];
        let sourceOrders = [];
        let meta = { mode };

        if (mode === 'campaign') {
            const lives = groupByLiveCampaign(data);
            if (lives.length === 0) {
                return { clusters: [], meta: { mode, message: 'Không tìm thấy LiveCampaign nào trong dữ liệu hiện tại.' } };
            }
            const targetLive = lives[0];
            const sourceLives = lives.slice(1, 3); // tối đa 2 live liền trước
            meta.targetLive = targetLive;
            meta.sourceLives = sourceLives;
            targetOrders = targetLive.orders;
            sourceOrders = sourceLives.flatMap(l => l.orders);
        } else {
            // date mode: dùng toàn bộ displayedData; phân loại per-phone
            targetOrders = data;
            sourceOrders = data;
        }

        // Group target orders per phone → latest only
        const targetByPhone = new Map();
        for (const o of targetOrders) {
            const p = window.normalizeMergePhone ? window.normalizeMergePhone(o.Telephone) : (o.Telephone || '');
            if (!p) continue;
            if (!targetByPhone.has(p)) targetByPhone.set(p, []);
            targetByPhone.get(p).push(o);
        }

        // Build clusters
        const clusters = [];
        for (const [phone, orders] of targetByPhone.entries()) {
            const latest = pickLatestOrder(orders);
            if (!latest) continue;

            // Source candidates: cùng SĐT, có flag CHO_LIVE, KHÁC order target.
            // Ở mode 'date', cần thêm điều kiện DateCreated cũ hơn target.
            const sources = sourceOrders.filter(o => {
                if (!o || !o.Id || o.Id === latest.Id) return false;
                const p = window.normalizeMergePhone ? window.normalizeMergePhone(o.Telephone) : (o.Telephone || '');
                if (p !== phone) return false;
                if (!hasChoLiveFlag(o.Code)) return false;
                if (mode === 'date') {
                    if (new Date(o.DateCreated) >= new Date(latest.DateCreated)) return false;
                }
                return true;
            });

            if (sources.length === 0) continue;

            const sourceTTags = unionTTags(sources.map(s => getTTagsForOrder(s.Code)));
            clusters.push({
                id: `mlw_${phone}_${latest.Id}`,
                phone: latest.Telephone || phone,
                targetOrder: latest,
                sourceOrders: sources,
                sourceTTags
            });
        }

        // Sort clusters theo số source desc rồi theo SessionIndex target desc
        clusters.sort((a, b) => {
            const dif = b.sourceOrders.length - a.sourceOrders.length;
            if (dif !== 0) return dif;
            return (b.targetOrder.SessionIndex || 0) - (a.targetOrder.SessionIndex || 0);
        });

        return { clusters, meta };
    }

    // =====================================================
    // MODAL RENDERING
    // =====================================================

    function renderModeHeader(meta) {
        if (meta.mode === 'campaign') {
            const t = meta.targetLive;
            const srcNames = (meta.sourceLives || []).map(s => _escape(s.campaignName)).join(', ') || '(không có live cũ)';
            return `
                <div class="mlw-live-info">
                    <div><strong>Live mới nhất:</strong> ${_escape(t?.campaignName || '-')} <small>(${formatDateShort(t?.latestDate)})</small></div>
                    <div><strong>2 live liền trước:</strong> ${srcNames}</div>
                </div>
            `;
        }
        return `<div class="mlw-live-info"><strong>Chế độ:</strong> Tìm theo ngày (lọc tab 1 hiện tại)</div>`;
    }

    function renderClusterCard(cluster) {
        const tgt = cluster.targetOrder;
        const checked = mlwState.selected.has(cluster.id) ? 'checked' : '';
        const tTagsHtml = cluster.sourceTTags.length
            ? cluster.sourceTTags.map(t => `<span class="mlw-tag-pill mlw-tag-ttag">${_escape(t.name)}</span>`).join('')
            : '<span class="mlw-muted">(không có T-tag)</span>';

        const sourcesHtml = cluster.sourceOrders.map(s => `
            <tr>
                <td>${_escape(s.SessionIndex || '')}</td>
                <td>${_escape(s.Code || '')}</td>
                <td>${_escape(s.LiveCampaignName || '-')}</td>
                <td>${formatDateShort(s.DateCreated)}</td>
                <td>${_escape(s.TotalQuantity || 0)}</td>
                <td>${formatVND(s.TotalAmount)}</td>
            </tr>
        `).join('');

        return `
            <div class="mlw-cluster-card" data-cluster-id="${_escape(cluster.id)}">
                <div class="mlw-cluster-header">
                    <label class="mlw-cluster-select">
                        <input type="checkbox" class="mlw-cluster-checkbox" data-cluster-id="${_escape(cluster.id)}" ${checked} />
                        <span><strong>${_escape(cluster.phone)}</strong> — ${_escape(tgt.PartnerName || '(không tên)')}</span>
                    </label>
                    <div class="mlw-cluster-meta">
                        <span class="mlw-badge mlw-badge-target">Target STT ${_escape(tgt.SessionIndex || '')}</span>
                        <span class="mlw-badge mlw-badge-src">${cluster.sourceOrders.length} giỏ nguồn</span>
                    </div>
                </div>
                <div class="mlw-cluster-body">
                    <div class="mlw-target-info">
                        <strong>Giỏ đích (live mới):</strong>
                        STT ${_escape(tgt.SessionIndex)} — ${_escape(tgt.LiveCampaignName || '-')}
                        — ${formatDateShort(tgt.DateCreated)}
                        — SL ${_escape(tgt.TotalQuantity || 0)}, ${formatVND(tgt.TotalAmount)}
                    </div>
                    <div class="mlw-sources-block">
                        <strong>Giỏ nguồn (có CHỜ LIVE):</strong>
                        <table class="mlw-sources-table">
                            <thead><tr><th>STT</th><th>Code</th><th>Live</th><th>Ngày</th><th>SL</th><th>Tiền</th></tr></thead>
                            <tbody>${sourcesHtml}</tbody>
                        </table>
                    </div>
                    <div class="mlw-ttags-block"><strong>T-tags sẽ chuyển:</strong> ${tTagsHtml}</div>
                </div>
            </div>
        `;
    }

    function renderModalBody() {
        const body = document.getElementById('mlwModalBody');
        if (!body) return;

        const countEl = document.getElementById('mlwClusterCount');
        if (countEl) countEl.textContent = `${mlwState.clusters.length} cụm SĐT`;

        if (mlwState.clusters.length === 0) {
            body.innerHTML = `
                <div class="mlw-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>Không tìm thấy giỏ nào có tag <strong>CHỜ LIVE</strong> cần gộp vào live mới nhất.</p>
                </div>
            `;
            return;
        }

        const cardsHtml = mlwState.clusters.map(renderClusterCard).join('');
        body.innerHTML = cardsHtml;

        // Wire checkbox
        body.querySelectorAll('.mlw-cluster-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.clusterId;
                if (e.target.checked) mlwState.selected.add(id);
                else mlwState.selected.delete(id);
                updateConfirmBtn();
            });
        });
        updateConfirmBtn();
    }

    function updateConfirmBtn() {
        const btn = document.getElementById('mlwConfirmBtn');
        if (!btn) return;
        const n = mlwState.selected.size;
        btn.disabled = n === 0 || mlwState.running;
        btn.innerHTML = `<i class="fas fa-check"></i> Xác nhận Gộp (${n})`;
    }

    // =====================================================
    // SCAN (click "Quét")
    // =====================================================

    async function runScan() {
        const body = document.getElementById('mlwModalBody');
        if (body) body.innerHTML = `<div class="mlw-loading"><i class="fas fa-spinner fa-spin"></i><p>Đang quét...</p></div>`;

        const mode = document.querySelector('input[name="mlwMode"]:checked')?.value || 'campaign';
        mlwState.mode = mode;
        mlwState.selected.clear();

        const { clusters, meta } = findClusters(mode);
        mlwState.clusters = clusters;

        // Cập nhật header info
        const header = document.getElementById('mlwLiveHeader');
        if (header) header.innerHTML = renderModeHeader(meta);

        if (meta.message) {
            if (body) body.innerHTML = `<div class="mlw-empty"><i class="fas fa-info-circle"></i><p>${_escape(meta.message)}</p></div>`;
            updateConfirmBtn();
            return;
        }

        renderModalBody();
    }

    // =====================================================
    // EXECUTE MERGE
    // =====================================================

    async function mergeOneCluster(cluster) {
        const logs = [];
        const log = (m) => { logs.push(m); console.log(`${LOG} ${m}`); };

        // 1. Fetch full target
        const targetFull = await window.getOrderDetails(cluster.targetOrder.Id);
        if (!targetFull) throw new Error(`Không fetch được giỏ đích ${cluster.targetOrder.Id}`);

        const newDetails = Array.isArray(targetFull.Details) ? [...targetFull.Details] : [];
        let transferredCount = 0;

        // 2. For each source: fetch + copy
        for (const src of cluster.sourceOrders) {
            const srcFull = await window.getOrderDetails(src.Id);
            if (!srcFull) { log(`SKIP source ${src.Id} (fetch fail)`); continue; }
            const srcDetails = Array.isArray(srcFull.Details) ? srcFull.Details : [];
            for (const d of srcDetails) {
                const copy = {
                    ...d,
                    Id: undefined,
                    OrderId: targetFull.Id,
                    LiveCampaign_DetailId: null,
                    Note: appendNote(d.Note, NOTE_MARKER)
                };
                newDetails.push(copy);
                transferredCount++;
            }
            // Cache source details để saveMergeHistory ghi lại
            src.__fullDetails = srcDetails;
        }

        // 3. Recompute totals
        const totalQuantity = newDetails.reduce((s, d) => s + (Number(d.Quantity) || 0), 0);
        const totalAmount = newDetails.reduce((s, d) => s + ((Number(d.Quantity) || 0) * (Number(d.Price) || 0)), 0);

        // 4. PUT target
        await window.updateOrderWithFullPayload(targetFull, newDetails, totalAmount, totalQuantity);
        log(`Đã cập nhật giỏ đích ${targetFull.Id} (+${transferredCount} SP)`);

        // 5. Transfer T-tags (đặc điểm) sang target
        if (typeof window.assignTTagToOrder === 'function') {
            for (const t of cluster.sourceTTags) {
                try {
                    await window.assignTTagToOrder(String(cluster.targetOrder.Code), t.id, SOURCE_LABEL);
                } catch (e) {
                    console.warn(`${LOG} assignTTagToOrder fail for ${t.id}:`, e);
                }
            }
        }

        // 6. Clear source orders + gán category 3 / DA_GOP_KHONG_CHOT
        for (const src of cluster.sourceOrders) {
            try {
                const srcFull2 = await window.getOrderDetails(src.Id);
                if (srcFull2) {
                    await window.updateOrderWithFullPayload(srcFull2, [], 0, 0);
                    log(`Đã clear giỏ nguồn ${src.Id}`);
                }
            } catch (e) {
                console.warn(`${LOG} Clear source ${src.Id} fail:`, e);
            }
            if (typeof window.assignOrderCategory === 'function') {
                try {
                    await window.assignOrderCategory(String(src.Code), 3, {
                        subTag: 'DA_GOP_KHONG_CHOT',
                        source: SOURCE_LABEL
                    });
                } catch (e) {
                    console.warn(`${LOG} assignOrderCategory fail for ${src.Code}:`, e);
                }
            }
        }

        // 7. Save history (reuse saveMergeHistory — cần shape cluster tương thích)
        if (typeof window.saveMergeHistory === 'function') {
            try {
                const historyCluster = {
                    phone: cluster.phone,
                    targetOrder: {
                        ...cluster.targetOrder,
                        Details: Array.isArray(targetFull.Details) ? targetFull.Details : []
                    },
                    sourceOrders: cluster.sourceOrders.map(s => ({
                        ...s,
                        Details: s.__fullDetails || []
                    })),
                    mergedProducts: newDetails,
                    type: 'live_waiting'
                };
                await window.saveMergeHistory(historyCluster, { success: true, message: `Chuyển ${transferredCount} SP từ ${cluster.sourceOrders.length} giỏ` });
            } catch (e) {
                console.warn(`${LOG} saveMergeHistory fail:`, e);
            }
        }

        return { transferredCount, sourceCount: cluster.sourceOrders.length };
    }

    async function runConfirm() {
        if (mlwState.running) return;
        if (mlwState.selected.size === 0) return;

        mlwState.running = true;
        updateConfirmBtn();

        const body = document.getElementById('mlwModalBody');
        const progressHtml = (text) => `<div class="mlw-loading"><i class="fas fa-spinner fa-spin"></i><p>${_escape(text)}</p></div>`;

        const selectedClusters = mlwState.clusters.filter(c => mlwState.selected.has(c.id));
        let done = 0, ok = 0, fail = 0;
        let totalTransferred = 0;

        for (const cluster of selectedClusters) {
            done++;
            if (body) body.innerHTML = progressHtml(`Đang gộp ${done}/${selectedClusters.length} — SĐT ${cluster.phone}...`);
            try {
                const res = await mergeOneCluster(cluster);
                ok++;
                totalTransferred += res.transferredCount;
            } catch (err) {
                fail++;
                console.error(`${LOG} Cluster ${cluster.id} fail:`, err);
            }
        }

        mlwState.running = false;
        const summary = `Gộp xong: ${ok} cụm thành công, ${fail} cụm lỗi. Chuyển ${totalTransferred} SP.`;
        _notify(summary, fail === 0 ? 'success' : 'warning');
        if (body) {
            body.innerHTML = `
                <div class="mlw-empty">
                    <i class="fas fa-check-circle" style="color:#10b981;"></i>
                    <p>${_escape(summary)}</p>
                    <p class="mlw-muted">Nhấn <em>Tải lại</em> ở tab 1 để cập nhật danh sách.</p>
                </div>
            `;
        }
        mlwState.clusters = [];
        mlwState.selected.clear();
        updateConfirmBtn();
    }

    // =====================================================
    // MODAL OPEN/CLOSE
    // =====================================================

    function openModal() {
        const modal = document.getElementById('mergeLiveWaitingModal');
        if (!modal) {
            console.error(`${LOG} Modal element #mergeLiveWaitingModal không tồn tại trong DOM.`);
            _notify('Lỗi: modal Gộp SP Chờ Live chưa được load.', 'error');
            return;
        }
        mlwState = { mode: 'campaign', clusters: [], selected: new Set(), running: false };
        modal.classList.add('show');
        // Reset header + body
        const header = document.getElementById('mlwLiveHeader');
        if (header) header.innerHTML = '<em class="mlw-muted">Chọn chế độ rồi bấm Quét.</em>';
        const body = document.getElementById('mlwModalBody');
        if (body) body.innerHTML = '<div class="mlw-empty"><i class="fas fa-search"></i><p>Bấm nút <strong>Quét</strong> để tìm các giỏ Chờ Live cần gộp.</p></div>';
        updateConfirmBtn();
    }

    function closeModal() {
        const modal = document.getElementById('mergeLiveWaitingModal');
        if (modal) modal.classList.remove('show');
        mlwState.selected.clear();
        mlwState.clusters = [];
    }

    // =====================================================
    // EXPORT
    // =====================================================

    window.showMergeLiveWaitingModal = openModal;
    window.closeMergeLiveWaitingModal = closeModal;
    window.runMergeLiveWaitingScan = runScan;
    window.confirmMergeLiveWaiting = runConfirm;
})();
