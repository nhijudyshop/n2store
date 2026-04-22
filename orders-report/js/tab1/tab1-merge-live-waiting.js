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
     * Convert saved campaign → { start, end } timestamps.
     * - customStartDate bắt buộc. Nếu thiếu → null (skip).
     * - customEndDate rỗng → fallback customStartDate + 3 ngày (matching default trong tab1-campaign-create.js).
     */
    function campaignDateRange(c) {
        if (!c || !c.customStartDate) return null;
        const start = new Date(c.customStartDate).getTime();
        if (!Number.isFinite(start)) return null;
        let end;
        if (c.customEndDate) {
            end = new Date(c.customEndDate).getTime();
            if (!Number.isFinite(end)) end = start + 3 * 24 * 3600 * 1000;
        } else {
            end = start + 3 * 24 * 3600 * 1000;
        }
        return { start, end };
    }

    function orderInRange(order, range) {
        if (!range || !order || !order.DateCreated) return false;
        const t = new Date(order.DateCreated).getTime();
        if (!Number.isFinite(t)) return false;
        return t >= range.start && t <= range.end;
    }

    /**
     * Lấy danh sách saved campaigns sort theo customStartDate DESC (newest đầu tiên).
     * Chỉ lấy những campaign có customStartDate hợp lệ.
     */
    function getSortedSavedCampaigns() {
        const mgr = window.campaignManager;
        if (!mgr || !mgr.allCampaigns) return [];
        return Object.values(mgr.allCampaigns)
            .filter(c => c && c.customStartDate)
            .slice()
            .sort((a, b) => new Date(b.customStartDate) - new Date(a.customStartDate));
    }

    /**
     * Tìm cluster theo mode.
     *  - campaign: dựa vào saved campaigns (Cài Đặt Chiến Dịch). Target = activeCampaign; sources = 2 campaign liền trước theo customStartDate. Chỉ lấy source orders có flag CHO_LIVE.
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
            const mgr = window.campaignManager;
            if (!mgr || !mgr.activeCampaignId || !mgr.allCampaigns) {
                return { clusters: [], meta: { mode, message: 'Chưa chọn chiến dịch active. Vào "Cài Đặt Chiến Dịch" chọn 1 chiến dịch trước.' } };
            }
            const activeCampaign = mgr.allCampaigns[mgr.activeCampaignId];
            if (!activeCampaign) {
                return { clusters: [], meta: { mode, message: `Chiến dịch active (${mgr.activeCampaignId}) không tồn tại trong danh sách.` } };
            }
            const activeRange = campaignDateRange(activeCampaign);
            if (!activeRange) {
                return { clusters: [], meta: { mode, message: `Chiến dịch "${activeCampaign.name}" chưa có Từ ngày hợp lệ.` } };
            }

            const sorted = getSortedSavedCampaigns();
            const activeIdx = sorted.findIndex(c => c.id === activeCampaign.id);
            const sourceCampaigns = activeIdx >= 0 ? sorted.slice(activeIdx + 1, activeIdx + 3) : [];

            meta.activeCampaign = activeCampaign;
            meta.sourceCampaigns = sourceCampaigns;

            if (sourceCampaigns.length === 0) {
                return { clusters: [], meta: { ...meta, message: `Không có chiến dịch nào cũ hơn "${activeCampaign.name}" để quét CHỜ LIVE.` } };
            }

            const sourceRanges = sourceCampaigns.map(campaignDateRange).filter(Boolean);
            targetOrders = data.filter(o => orderInRange(o, activeRange));
            sourceOrders = data.filter(o => sourceRanges.some(r => orderInRange(o, r)));

            if (targetOrders.length === 0) {
                return { clusters: [], meta: { ...meta, message: `Không có đơn nào trong chiến dịch active "${activeCampaign.name}". Hãy kiểm tra bộ lọc ngày/cache.` } };
            }
            if (sourceOrders.length === 0) {
                return { clusters: [], meta: { ...meta, message: `displayedData không chứa đơn nào trong 2 chiến dịch cũ. Hãy mở rộng bộ lọc ngày tab 1 để bao phủ ${sourceCampaigns.map(c => c.name).join(', ')}.` } };
            }
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

            // Annotate mỗi source với tên campaign (chỉ ở campaign mode)
            if (mode === 'campaign' && Array.isArray(meta.sourceCampaigns)) {
                const campaignRanges = meta.sourceCampaigns.map(c => ({ c, r: campaignDateRange(c) })).filter(x => x.r);
                sources.forEach(s => {
                    const hit = campaignRanges.find(({ r }) => orderInRange(s, r));
                    s._mlwCampaignName = hit ? hit.c.name : '-';
                });
            }

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
            const active = meta.activeCampaign;
            const activeRange = active ? campaignDateRange(active) : null;
            const activeRangeText = activeRange
                ? `${formatDateShort(new Date(activeRange.start).toISOString())} — ${formatDateShort(new Date(activeRange.end).toISOString())}`
                : '(chưa có ngày)';
            const srcParts = (meta.sourceCampaigns || []).map(c => {
                const r = campaignDateRange(c);
                const rangeText = r
                    ? `${formatDateShort(new Date(r.start).toISOString())} — ${formatDateShort(new Date(r.end).toISOString())}`
                    : '(-)';
                return `<div class="mlw-live-row">↳ ${_escape(c.name)} <small>${rangeText}</small></div>`;
            }).join('') || '<div class="mlw-live-row mlw-muted">(không có chiến dịch cũ)</div>';
            return `
                <div class="mlw-live-info">
                    <div><strong>Chiến dịch active (live mới):</strong> ${_escape(active?.name || '-')} <small>${activeRangeText}</small></div>
                    <div><strong>2 chiến dịch liền trước:</strong></div>
                    ${srcParts}
                </div>
            `;
        }
        return `<div class="mlw-live-info"><strong>Chế độ:</strong> Tìm theo ngày (lọc tab 1 hiện tại)</div>`;
    }

    // --- Tags rendering (regular + T-tags + flags) ---
    function parseRegularTags(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string' && raw.trim()) {
            try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; }
            catch { return []; }
        }
        return [];
    }

    function getXLFlagPills(orderCode) {
        // Chỉ hiển thị flags hiện có để user nhìn; KHÔNG chuyển qua target khi merge.
        const state = window.ProcessingTagState;
        if (!state || !orderCode) return [];
        const data = state.getOrderData(String(orderCode));
        if (!data) return [];
        const pills = [];
        (data.flags || []).forEach(f => {
            const id = (typeof f === 'object' && f) ? f.id : f;
            const name = (typeof f === 'object' && f && f.name) ? f.name : id;
            pills.push({ name, color: id === 'CHO_LIVE' ? '#10b981' : '#7c3aed', kind: 'flag' });
        });
        return pills;
    }

    function renderTagPills(order, { includeTTags = true, extraTags = [] } = {}) {
        const pills = [];
        parseRegularTags(order.Tags).forEach(t => {
            pills.push({ name: t.Name || '', color: t.Color || '#6b7280', kind: 'regular' });
        });
        if (includeTTags) {
            getTTagsForOrder(order.Code).forEach(t => {
                pills.push({ name: t.name, color: '#3b82f6', kind: 'ttag' });
            });
        }
        getXLFlagPills(order.Code).forEach(p => pills.push(p));
        extraTags.forEach(t => pills.push(t));
        if (!pills.length) return '<div class="merge-header-tags merge-empty"><span class="merge-tag-pill" style="background:#9ca3af;">Không có tag</span></div>';
        const html = pills.map(p =>
            `<span class="merge-tag-pill" style="background:${p.color}" title="${_escape(p.name)}">${_escape(p.name)}</span>`
        ).join('');
        return `<div class="merge-header-tags">${html}</div>`;
    }

    function renderMergedPreviewTags(cluster) {
        // "Sau khi gộp" = target tags (regular + T-tags + flags GIỮ NGUYÊN ở target) + T-tags từ sources (thêm mới)
        const target = cluster.targetOrder;
        const pills = [];
        parseRegularTags(target.Tags).forEach(t =>
            pills.push({ name: t.Name || '', color: t.Color || '#6b7280', kind: 'regular' })
        );
        getTTagsForOrder(target.Code).forEach(t =>
            pills.push({ name: t.name, color: '#3b82f6', kind: 'ttag' })
        );
        // Thêm T-tags từ sources (dedup theo name)
        const existingNames = new Set(pills.map(p => p.name));
        (cluster.sourceTTags || []).forEach(t => {
            if (!existingNames.has(t.name)) {
                pills.push({ name: t.name, color: '#3b82f6', kind: 'ttag' });
                existingNames.add(t.name);
            }
        });
        // Target flags giữ nguyên (XL tag của target không đổi)
        getXLFlagPills(target.Code).forEach(p => pills.push(p));
        if (!pills.length) return '<div class="merge-header-tags merge-empty"><span class="merge-tag-pill" style="background:#9ca3af;">Không có tag</span></div>';
        const html = pills.map(p =>
            `<span class="merge-tag-pill" style="background:${p.color}" title="${_escape(p.name)}">${_escape(p.name)}</span>`
        ).join('');
        return `<div class="merge-header-tags">${html}</div>`;
    }

    // --- Product rendering ---
    function renderProductCell(p, { markTransfer = false } = {}) {
        if (!p) return '';
        const imgUrl = p.ProductImageUrl || p.ImageUrl || '';
        const imgHtml = imgUrl
            ? `<img src="${_escape(imgUrl)}" alt="" class="merge-product-img" onerror="this.style.display='none'">`
            : `<div class="merge-product-img" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;"><i class="fas fa-box"></i></div>`;
        const productCode = p.ProductCode || (p.ProductName || '').match(/\[([^\]]+)\]/)?.[1] || '';
        const productName = p.ProductName || p.ProductNameGet || 'Sản phẩm';
        const price = p.Price ? `${Number(p.Price).toLocaleString('vi-VN')}đ` : '';
        const note = p.Note || '';
        const transferBadge = markTransfer ? '<span class="mlw-transfer-badge">Hàng Live Cũ</span>' : '';
        return `
            <div class="merge-product-item">
                ${imgHtml}
                <div class="merge-product-info">
                    <div class="merge-product-name" title="${_escape(productName)}">${_escape(productName)}</div>
                    ${productCode ? `<span class="merge-product-code">${_escape(productCode)}</span>` : ''}
                    <div class="merge-product-details">
                        <span class="qty">SL: ${_escape(p.Quantity || 0)}</span>
                        ${price ? ` | <span class="price">${_escape(price)}</span>` : ''}
                    </div>
                    ${note ? `<div class="merge-product-note">Note: ${_escape(note)}</div>` : ''}
                    ${transferBadge}
                </div>
            </div>
        `;
    }

    // --- Cluster card: layout bảng 3+ cột (Sau Khi Gộp | sources... | Đích) ---
    function renderClusterCard(cluster) {
        const tgt = cluster.targetOrder;
        const checked = mlwState.selected.has(cluster.id) ? 'checked' : '';

        // Build merged products: target Details + source Details (với note "Hàng Live Cũ")
        const targetDetails = Array.isArray(tgt.__fullDetails) ? tgt.__fullDetails : [];
        const sourcesFlatDetails = cluster.sourceOrders.flatMap(s =>
            (Array.isArray(s.__fullDetails) ? s.__fullDetails : []).map(d => ({
                ...d,
                Note: appendNote(d.Note, NOTE_MARKER),
                __isTransferred: true
            }))
        );
        const mergedProducts = [...targetDetails, ...sourcesFlatDetails];

        // Build headers: Sau Khi Gộp | sources (theo STT asc) | Đích
        const sourcesSorted = cluster.sourceOrders.slice().sort((a, b) => (a.SessionIndex || 0) - (b.SessionIndex || 0));

        const headers = [
            `<th class="merged-col">Sau Khi Gộp<br><small>(STT ${_escape(tgt.SessionIndex)})</small>${renderMergedPreviewTags(cluster)}</th>`
        ];
        sourcesSorted.forEach(s => {
            headers.push(`<th>
                STT ${_escape(s.SessionIndex || '')} — ${_escape(s.PartnerName || 'N/A')}
                <br><small>${_escape(s._mlwCampaignName || '-')} · ${formatDateShort(s.DateCreated)}</small>
                ${renderTagPills(s)}
            </th>`);
        });
        headers.push(`<th class="target-col">
            STT ${_escape(tgt.SessionIndex)} — ${_escape(tgt.PartnerName || 'N/A')} (Đích)
            <br><small>${formatDateShort(tgt.DateCreated)}</small>
            ${renderTagPills(tgt)}
        </th>`);

        // Rows: max = max(mergedProducts, each source, target)
        const maxRows = Math.max(
            mergedProducts.length,
            ...sourcesSorted.map(s => (s.__fullDetails || []).length),
            targetDetails.length,
            1
        );

        const rows = [];
        for (let i = 0; i < maxRows; i++) {
            const cells = [];
            // Merged col
            const mp = mergedProducts[i];
            cells.push(`<td class="merged-col">${mp ? renderProductCell(mp, { markTransfer: !!mp.__isTransferred }) : ''}</td>`);
            // Source cols
            sourcesSorted.forEach(s => {
                const p = (s.__fullDetails || [])[i];
                cells.push(`<td>${p ? renderProductCell(p) : ''}</td>`);
            });
            // Target col
            const tp = targetDetails[i];
            cells.push(`<td class="target-col">${tp ? renderProductCell(tp) : ''}</td>`);
            rows.push(`<tr>${cells.join('')}</tr>`);
        }

        return `
            <div class="merge-cluster-card mlw-cluster-card" data-cluster-id="${_escape(cluster.id)}">
                <div class="merge-cluster-header">
                    <input type="checkbox" class="merge-cluster-checkbox mlw-cluster-checkbox"
                        data-cluster-id="${_escape(cluster.id)}" ${checked} />
                    <div class="merge-cluster-title"># ${_escape(cluster.phone)} — ${_escape(tgt.PartnerName || 'N/A')}</div>
                    <div class="merge-cluster-phone"><i class="fas fa-phone"></i> ${_escape(cluster.phone)}</div>
                </div>
                <div class="merge-cluster-table-wrapper">
                    <table class="merge-cluster-table">
                        <thead><tr>${headers.join('')}</tr></thead>
                        <tbody>${rows.join('')}</tbody>
                    </table>
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

    async function fetchDetailsForClusters(clusters) {
        // Collect unique order IDs (target + sources)
        const ids = new Set();
        clusters.forEach(c => {
            if (c.targetOrder?.Id) ids.add(c.targetOrder.Id);
            c.sourceOrders.forEach(s => { if (s?.Id) ids.add(s.Id); });
        });
        const idArr = Array.from(ids);
        // Cache full order object (không chỉ Details) → tránh double-fetch khi execute merge
        const fullOrderMap = new Map();
        const batchSize = 5;
        const body = document.getElementById('mlwModalBody');
        for (let i = 0; i < idArr.length; i += batchSize) {
            const batch = idArr.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(id => window.getOrderDetails(id).catch(() => null)));
            results.forEach((r, idx) => {
                if (r) fullOrderMap.set(batch[idx], r);
            });
            const loaded = Math.min(i + batchSize, idArr.length);
            if (body) body.innerHTML = `<div class="mlw-loading"><i class="fas fa-spinner fa-spin"></i><p>Đang tải chi tiết ${loaded}/${idArr.length} đơn...</p></div>`;
            if (i + batchSize < idArr.length) await new Promise(r => setTimeout(r, 250));
        }
        // Attach __fullOrder (full object) + __fullDetails (cho render hiện tại)
        clusters.forEach(c => {
            const tgtFull = fullOrderMap.get(c.targetOrder.Id);
            c.targetOrder.__fullOrder = tgtFull || null;
            c.targetOrder.__fullDetails = Array.isArray(tgtFull?.Details) ? tgtFull.Details : [];
            c.sourceOrders.forEach(s => {
                const srcFull = fullOrderMap.get(s.Id);
                s.__fullOrder = srcFull || null;
                s.__fullDetails = Array.isArray(srcFull?.Details) ? srcFull.Details : [];
            });
        });
    }

    async function runScan() {
        const body = document.getElementById('mlwModalBody');
        if (body) body.innerHTML = `<div class="mlw-loading"><i class="fas fa-spinner fa-spin"></i><p>Đang quét...</p></div>`;

        const mode = document.querySelector('input[name="mlwMode"]:checked')?.value || 'campaign';
        mlwState.mode = mode;
        mlwState.selected.clear();

        const { clusters, meta } = findClusters(mode);

        // Cập nhật header info
        const header = document.getElementById('mlwLiveHeader');
        if (header) header.innerHTML = renderModeHeader(meta);

        if (meta.message) {
            mlwState.clusters = [];
            if (body) body.innerHTML = `<div class="mlw-empty"><i class="fas fa-info-circle"></i><p>${_escape(meta.message)}</p></div>`;
            updateConfirmBtn();
            return;
        }

        // Fetch Details (blocking) để render product list
        try {
            await fetchDetailsForClusters(clusters);
        } catch (err) {
            console.error(`${LOG} fetchDetailsForClusters error:`, err);
            if (body) body.innerHTML = `<div class="mlw-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444"></i><p>Lỗi tải chi tiết đơn: ${_escape(err.message || String(err))}</p></div>`;
            return;
        }

        mlwState.clusters = clusters;
        renderModalBody();
    }

    // =====================================================
    // EXECUTE MERGE
    // =====================================================

    async function mergeOneCluster(cluster) {
        const logs = [];
        const log = (m) => { logs.push(m); console.log(`${LOG} ${m}`); };

        // 1. Full target object — tận dụng __fullOrder cache từ scan để tránh double-fetch
        let targetFull = cluster.targetOrder.__fullOrder;
        if (!targetFull) {
            targetFull = await window.getOrderDetails(cluster.targetOrder.Id);
            if (!targetFull) throw new Error(`Không fetch được giỏ đích ${cluster.targetOrder.Id}`);
        }

        // 2. Gộp products qua productMap (dedup by ProductId) → tránh tạo row trùng trên TPOS.
        //    Cùng pattern với executeMergeOrderProducts (tab1-merge.js) để behavior đồng nhất.
        const productMap = new Map();
        const addDetail = (d, { fromSource = false } = {}) => {
            const key = d.ProductId;
            if (!key) {
                // Không có ProductId → synthetic key để giữ row riêng
                productMap.set(`_noid_${productMap.size}`, {
                    ...d,
                    Id: fromSource ? undefined : d.Id,
                    OrderId: targetFull.Id,
                    LiveCampaign_DetailId: fromSource ? null : d.LiveCampaign_DetailId,
                    Note: fromSource ? appendNote(d.Note, NOTE_MARKER) : d.Note
                });
                return;
            }
            if (productMap.has(key)) {
                const existing = productMap.get(key);
                const newQty = (Number(existing.Quantity) || 0) + (Number(d.Quantity) || 0);
                existing.Quantity = Math.min(newQty, 999999);
                // Concat note nếu source có note mới
                const incomingNote = fromSource ? appendNote(d.Note, NOTE_MARKER) : (d.Note || '');
                if (incomingNote && !(existing.Note || '').includes(incomingNote)) {
                    existing.Note = existing.Note ? `${existing.Note} | ${incomingNote}` : incomingNote;
                }
            } else {
                productMap.set(key, {
                    ...d,
                    Id: fromSource ? undefined : d.Id,
                    OrderId: targetFull.Id,
                    LiveCampaign_DetailId: fromSource ? null : d.LiveCampaign_DetailId,
                    Note: fromSource ? appendNote(d.Note, NOTE_MARKER) : (d.Note || null)
                });
            }
        };

        // Target products trước (giữ priority field: Id, LiveCampaign_DetailId, giá target)
        (Array.isArray(targetFull.Details) ? targetFull.Details : []).forEach(d => addDetail(d, { fromSource: false }));

        // Source products sau — dedup theo ProductId, cộng quantity, concat note
        let transferredCount = 0;
        for (const src of cluster.sourceOrders) {
            let srcDetails = Array.isArray(src.__fullDetails) ? src.__fullDetails : null;
            if (!srcDetails) {
                const srcFull = await window.getOrderDetails(src.Id);
                if (!srcFull) { log(`SKIP source ${src.Id} (fetch fail)`); continue; }
                srcDetails = Array.isArray(srcFull.Details) ? srcFull.Details : [];
                src.__fullDetails = srcDetails;
                src.__fullOrder = srcFull;
            }
            for (const d of srcDetails) {
                addDetail(d, { fromSource: true });
                transferredCount++;
            }
        }

        const newDetails = Array.from(productMap.values());

        // 3. Recompute totals
        const totalQuantity = newDetails.reduce((s, d) => s + (Number(d.Quantity) || 0), 0);
        const totalAmount = newDetails.reduce((s, d) => s + ((Number(d.Quantity) || 0) * (Number(d.Price) || 0)), 0);

        // 4. PUT target
        await window.updateOrderWithFullPayload(targetFull, newDetails, totalAmount, totalQuantity);
        log(`Đã cập nhật giỏ đích ${targetFull.Id} (+${transferredCount} SP, dedup → ${newDetails.length} rows)`);

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
        //    Tận dụng __fullOrder cache → tránh double-fetch. Track cleared IDs
        //    để đánh dấu InvoiceStatus merge-cancelled local-only.
        const clearedSourceIds = [];
        const failedSourceIds = [];
        for (const src of cluster.sourceOrders) {
            let srcFull2 = src.__fullOrder;
            if (!srcFull2) {
                try { srcFull2 = await window.getOrderDetails(src.Id); } catch {}
            }
            let cleared = false;
            if (srcFull2) {
                try {
                    await window.updateOrderWithFullPayload(srcFull2, [], 0, 0);
                    log(`Đã clear giỏ nguồn ${src.Id}`);
                    cleared = true;
                    clearedSourceIds.push(src.Id);
                } catch (e) {
                    console.warn(`${LOG} Clear source ${src.Id} fail:`, e);
                    failedSourceIds.push(src.Id);
                }
            } else {
                console.warn(`${LOG} Không có __fullOrder cho source ${src.Id}, skip clear`);
                failedSourceIds.push(src.Id);
            }
            // Chỉ gán category 3 cho source đã clear — tránh mark nhầm source chưa cleared
            if (cleared && typeof window.assignOrderCategory === 'function') {
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

        // Mark PBH (InvoiceStatus) của các source đã clear là merge-cancelled (local)
        if (clearedSourceIds.length > 0 && typeof window.markSourceOrdersMergeCancelled === 'function') {
            try { window.markSourceOrdersMergeCancelled(clearedSourceIds); } catch (e) {
                console.warn(`${LOG} markSourceOrdersMergeCancelled fail:`, e);
            }
        }

        // 7. Save history (reuse saveMergeHistory — cần shape cluster tương thích).
        //    Partial success: target đã gộp nhưng có source chưa clear → message reflect.
        const partial = failedSourceIds.length > 0;
        const historyMsg = partial
            ? `Chuyển ${transferredCount} SP; ${clearedSourceIds.length}/${cluster.sourceOrders.length} giỏ clear OK, ${failedSourceIds.length} giỏ CHƯA clear — có thể trùng SP`
            : `Chuyển ${transferredCount} SP từ ${cluster.sourceOrders.length} giỏ`;

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
                await window.saveMergeHistory(historyCluster, {
                    success: !partial,
                    partial,
                    message: historyMsg
                });
            } catch (e) {
                console.warn(`${LOG} saveMergeHistory fail:`, e);
            }
        }

        return {
            transferredCount,
            sourceCount: cluster.sourceOrders.length,
            clearedSourceIds,
            failedSourceIds,
            partial
        };
    }

    async function runConfirm() {
        if (mlwState.running) return;
        if (mlwState.selected.size === 0) return;

        mlwState.running = true;
        updateConfirmBtn();

        const body = document.getElementById('mlwModalBody');
        const progressHtml = (text) => `<div class="mlw-loading"><i class="fas fa-spinner fa-spin"></i><p>${_escape(text)}</p></div>`;

        const selectedClusters = mlwState.clusters.filter(c => mlwState.selected.has(c.id));
        let done = 0, ok = 0, fail = 0, partialCount = 0;
        let totalTransferred = 0;
        const partialPhones = [];

        for (const cluster of selectedClusters) {
            done++;
            if (body) body.innerHTML = progressHtml(`Đang gộp ${done}/${selectedClusters.length} — SĐT ${cluster.phone}...`);
            try {
                const res = await mergeOneCluster(cluster);
                if (res.partial) {
                    partialCount++;
                    partialPhones.push(cluster.phone);
                } else {
                    ok++;
                }
                totalTransferred += res.transferredCount;
            } catch (err) {
                fail++;
                console.error(`${LOG} Cluster ${cluster.id} fail:`, err);
            }
        }

        mlwState.running = false;
        const summary = partialCount > 0
            ? `⚠️ ${ok} cụm OK, ${partialCount} cụm GỘP DANG DỞ (kiểm tra ngay: ${partialPhones.join(', ')}), ${fail} lỗi. Chuyển ${totalTransferred} SP.`
            : `Gộp xong: ${ok} cụm thành công, ${fail} cụm lỗi. Chuyển ${totalTransferred} SP.`;
        const level = partialCount > 0 ? 'error' : (fail === 0 ? 'success' : 'warning');
        _notify(summary, level);
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
