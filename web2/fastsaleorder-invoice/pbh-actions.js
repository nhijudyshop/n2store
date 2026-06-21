// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// PBH order actions — confirm / cancel / print / createDelivery / createRefund /
// export / bulk (cancel, merge, print) / resetStt.
// ⚠ MONEY/ORDER ops — keep await + loading + confirm flows verbatim (NOT fire-and-forget).

(function () {
    'use strict';

    const { WORKER, STATE, $, notify, w2pConfirm } = window.PbhState;
    const load = () => window.PbhApi.load();
    const getSelectedNumbers = () => window.PbhFilters.getSelectedNumbers();
    const updateBulkBar = () => window.PbhFilters.updateBulkBar();

    // UI-first: confirm/cancel PBH — disable row + show pending state NGAY,
    // POST background. Lỗi → restore + notify. SSE web2:fast-sale-orders sẽ
    // catch-up nếu state thay đổi từ tab khác.
    function _findPbhRow(number) {
        return document.querySelector(`tr[data-number="${CSS.escape(String(number))}"]`);
    }
    async function confirmOrder(number) {
        if (!(await w2pConfirm(`Xác nhận PBH ${number}?`, { okText: 'Xác nhận' }))) return;
        const row = _findPbhRow(number);
        const prevOpacity = row?.style.opacity;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prevOpacity,
                apply: () => {
                    if (row) {
                        row.style.opacity = '0.6';
                        row.style.pointerEvents = 'none';
                    }
                },
                run: async () => {
                    const r = await fetch(
                        `${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}/confirm`,
                        { method: 'POST', headers: window.PbhApi._authHeaders() }
                    );
                    const data = await r.json();
                    if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
                    return data;
                },
                onSuccess: () => load(),
                rollback: (prev) => {
                    if (row) {
                        row.style.opacity = prev || '';
                        row.style.pointerEvents = '';
                    }
                },
                successMsg: 'Đã xác nhận ' + number,
                errLabel: `xác nhận PBH ${number}`,
            });
        } else {
            const r = await fetch(
                `${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}/confirm`,
                { method: 'POST', headers: window.PbhApi._authHeaders() }
            );
            const data = await r.json();
            if (!r.ok || !data.success) return notify('Lỗi: ' + (data.error || r.status), 'error');
            notify('Đã xác nhận ' + number, 'success');
            load();
        }
    }
    async function cancelOrder(number) {
        if (
            !(await w2pConfirm(`Hủy PBH ${number}?`, {
                type: 'warning',
                okText: 'Hủy đơn',
                cancelText: 'Đóng',
            }))
        )
            return;
        const row = _findPbhRow(number);
        const prevOpacity = row?.style.opacity;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prevOpacity,
                apply: () => {
                    if (row) {
                        row.style.opacity = '0.4';
                        row.style.textDecoration = 'line-through';
                        row.style.pointerEvents = 'none';
                    }
                },
                run: async () => {
                    const r = await fetch(
                        `${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}/cancel`,
                        { method: 'POST', headers: window.PbhApi._authHeaders() }
                    );
                    const data = await r.json();
                    if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
                    return data;
                },
                onSuccess: () => load(),
                rollback: (prev) => {
                    if (row) {
                        row.style.opacity = prev || '';
                        row.style.textDecoration = '';
                        row.style.pointerEvents = '';
                    }
                },
                successMsg: 'Đã hủy ' + number,
                errLabel: `hủy PBH ${number}`,
            });
        } else {
            const r = await fetch(
                `${WORKER}/api/fast-sale-orders/${encodeURIComponent(number)}/cancel`,
                { method: 'POST', headers: window.PbhApi._authHeaders() }
            );
            const data = await r.json();
            if (!r.ok || !data.success) return notify('Lỗi: ' + (data.error || r.status), 'error');
            notify('Đã hủy ' + number, 'success');
            load();
        }
    }
    function printOrder(number) {
        // Open print page in popup; page tự fetch detail + auto-call /print API
        const url = `print.html?number=${encodeURIComponent(number)}`;
        const w = window.open(url, `pbh_print_${number}`, 'width=900,height=1000');
        if (!w) notify('Trình duyệt chặn popup — hãy cho phép', 'warning');
        // Reload list sau 3s để print_count cập nhật
        setTimeout(() => load(), 3000);
    }

    async function createDelivery(number) {
        if (
            !(await w2pConfirm(`Tạo Phiếu Giao Hàng từ ${number}?`, {
                okText: 'Tạo phiếu giao',
                type: 'info',
            }))
        )
            return;
        try {
            const r = await fetch(`${WORKER}/api/delivery-invoices/from-pbh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.PbhApi._authHeaders() },
                body: JSON.stringify({ pbhNumber: number }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(`Đã tạo phiếu giao ${data.order.number}`, 'success');
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    // 1D-refunds-old-flow FIX (2026-06-12): flow refunds.js cũ là SỔ GHI CHẾT —
    // approve/complete không hoàn kho/ví. Nút "Trả hàng" giờ mở trang Thu về
    // (web2-returns: cộng kho + hoàn ví đúng vòng đời PBH, đã atomic từ 3H2)
    // với KH + đơn được chọn sẵn. POST /api/refunds/from-pbh server trả 410.
    function createRefund(number) {
        // FIX (2026-06-18): STATE.items không tồn tại (rows array là STATE.orders —
        // xem load() L101). Trước đây nút "Trả hàng" throw TypeError .find of undefined
        // → không mở được trang Thu về. Phát hiện qua click-all probe Web 2.0.
        const row = (STATE.orders || []).find((x) => x.number === number);
        const phone = row?.partner?.phone || row?.partnerPhone || '';
        const name = row?.partner?.name || row?.partnerName || '';
        const q = new URLSearchParams({
            prefillPhone: phone,
            prefillOrder: number,
            prefillName: name,
        });
        window.location.href = `../returns/index.html?${q}`;
    }

    function exportCsv() {
        const p = new URLSearchParams();
        if (STATE.search) p.set('search', STATE.search);
        if (STATE.state) p.set('state', STATE.state);
        if (STATE.customerId) p.set('customerId', String(STATE.customerId));
        const url = `${WORKER}/api/fast-sale-orders/export?${p}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
        notify('Đang tải Excel...', 'info');
    }

    async function bulkAction(endpoint, label) {
        const numbers = getSelectedNumbers();
        if (!numbers.length) return;
        const isCancel = /hủy/i.test(label);
        // C1 (2026-06-11): bulk-cancel server giờ restock + hoàn ví từng PBH —
        // confirm dialog ghi rõ để user biết hậu quả (kho + ví đổi theo).
        const confirmMsg = isCancel
            ? `${label} ${numbers.length} đơn? Hệ thống sẽ HOÀN KHO (trả tồn về Kho SP) + HOÀN VÍ (trả lại tiền đã trừ từ ví KH) cho từng PBH.`
            : `${label} ${numbers.length} đơn?`;
        if (
            !(await w2pConfirm(confirmMsg, {
                okText: label,
                type: isCancel ? 'warning' : 'question',
            }))
        )
            return;
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.PbhApi._authHeaders() },
                body: JSON.stringify({ numbers }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(`${label}: ${data.changed}/${data.requested} đơn`, 'success');
            // Uncheck check-all + reload
            const ca = $('#pbhCheckAll');
            if (ca) ca.checked = false;
            updateBulkBar();
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    // Gộp 2+ PBH cùng KH → 1 PBH mới với STT hiển thị "1 + 2"
    async function bulkMerge() {
        const numbers = getSelectedNumbers();
        if (numbers.length < 2) {
            notify('Cần chọn ít nhất 2 PBH để gộp', 'warning');
            return;
        }
        // Client-side preflight validation: same phone + all draft
        const selected = STATE.orders.filter((o) => numbers.includes(o.number));
        const phones = new Set(selected.map((o) => o.partner?.phone || ''));
        if (phones.size > 1) {
            notify(
                `Phải cùng SĐT khách. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
                'error'
            );
            return;
        }
        const nonDraft = selected.filter((o) => o.state !== 'draft');
        if (nonDraft.length) {
            notify(
                `Chỉ gộp được PBH trạng thái "draft". Đơn không hợp lệ: ${nonDraft.map((o) => o.number).join(', ')}`,
                'error'
            );
            return;
        }
        const phone = Array.from(phones)[0] || '';
        const customerName = selected[0]?.partner?.name || '';
        const stts = selected
            .map((o) => Number(o.displayStt) || 0)
            .filter(Boolean)
            .sort((a, b) => a - b);
        if (
            !(await w2pConfirm(
                `Gộp ${numbers.length} PBH của KH ${customerName} (${phone})?\n\n` +
                    `STT sẽ hiển thị: "${stts.join(' + ')}"\n` +
                    `Các PBH gốc (${numbers.join(', ')}) sẽ bị xóa và thay bằng 1 PBH mới.`,
                { okText: 'Gộp đơn', type: 'warning' }
            ))
        )
            return;
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.PbhApi._authHeaders() },
                body: JSON.stringify({ numbers }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
            notify(
                `✅ Đã gộp thành PBH ${data.order.number} (STT ${data.mergedStts.join(' + ')})`,
                'success'
            );
            const ca = $('#pbhCheckAll');
            if (ca) ca.checked = false;
            updateBulkBar();
            load();
        } catch (e) {
            notify('Lỗi gộp đơn: ' + e.message, 'error');
        }
    }

    // In thermal 80mm tất cả PBH đang chọn (1 popup, page-break giữa)
    async function bulkPrint() {
        const numbers = getSelectedNumbers();
        if (!numbers.length) {
            notify('Chưa chọn PBH nào để in', 'warning');
            return;
        }
        if (!window.Web2Bill) {
            notify('Web2Bill chưa load — kiểm tra script', 'error');
            return;
        }
        try {
            // 1 GET /batch cho tất cả numbers (load endpoint chỉ trả summary).
            // Fallback per-number nếu /batch lỗi/chưa deploy.
            let valid = [];
            try {
                const r = await fetch(
                    `${WORKER}/api/fast-sale-orders/batch?numbers=${encodeURIComponent(numbers.join(','))}`
                );
                const d = await r.json();
                if (r.ok && Array.isArray(d.orders)) valid = d.orders.filter(Boolean);
                else throw new Error('batch unavailable');
            } catch {
                const detailed = await Promise.all(
                    numbers.map(async (num) => {
                        const r = await fetch(`${WORKER}/api/fast-sale-orders/${num}`);
                        const d = await r.json();
                        return d.order || null;
                    })
                );
                valid = detailed.filter(Boolean);
            }
            if (!valid.length) {
                notify('Không lấy được data PBH', 'error');
                return;
            }
            if (valid.length === 1) {
                window.Web2Bill.openPrint(valid[0]);
            } else {
                window.Web2Bill.openCombinedPrint(valid);
            }
            notify(`Đang in ${valid.length} PBH...`, 'info');
        } catch (e) {
            notify('Lỗi in bill: ' + e.message, 'error');
        }
    }

    async function resetStt() {
        const renumber = await w2pConfirm(
            'OK để renumber TẤT CẢ PBH theo ngày HĐ.\nHuỷ để chỉ reset bộ đếm (PBH cũ giữ STT).',
            {
                title: 'Reset STT',
                type: 'warning',
                okText: 'Renumber tất cả',
                cancelText: 'Chỉ reset bộ đếm',
            }
        );
        try {
            const r = await fetch(`${WORKER}/api/fast-sale-orders/reset-stt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.PbhApi._authHeaders() },
                body: JSON.stringify({ renumber }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || r.status);
            notify(
                data.mode === 'renumber'
                    ? `Đã renumber ${data.renumbered} PBH`
                    : 'Đã reset bộ đếm — PBH mới từ 1',
                'success'
            );
            load();
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    window.PbhActions = {
        _findPbhRow,
        confirmOrder,
        cancelOrder,
        printOrder,
        createDelivery,
        createRefund,
        exportCsv,
        bulkAction,
        bulkMerge,
        bulkPrint,
        resetStt,
    };
})();
