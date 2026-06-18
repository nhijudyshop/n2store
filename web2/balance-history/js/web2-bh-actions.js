// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-actions — toolbar button handlers (money/reconcile ops):
// reprocessUnmatched / autoAssign / autoReprocessOnLoad / autoMatchSingle.
// ⚠ MONEY surface — giữ nguyên await + loading state verbatim.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const { dom, withFallback, notify } = W2BH;

    // Auto-reprocess: fire-and-forget background reprocess khi page load.
    // Web 2.0 = 100% auto — không có nút thủ công, hệ thống tự handle. Throttle
    // 30s/page-load để chống spam khi user F5 liên tục.
    let _autoReprocessRunning = false;
    async function autoReprocessOnLoad() {
        if (_autoReprocessRunning) return;
        const lastRun = Number(sessionStorage.getItem('w2bh_last_auto_reprocess') || 0);
        if (Date.now() - lastRun < 30 * 1000) return; // throttle 30s
        _autoReprocessRunning = true;
        sessionStorage.setItem('w2bh_last_auto_reprocess', String(Date.now()));
        try {
            const r = await withFallback('/reprocess-unmatched', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 200 }),
            });
            const s = r?.data || {};
            if (s.picked > 0 && (s.matched > 0 || s.pending > 0)) {
                notify(
                    `Auto-process: ${s.matched} cộng ví, ${s.pending} chờ chọn KH, ${s.no_match} không match`,
                    'info'
                );
                await W2BH.load();
                // Nếu còn rows chưa xử lý → loop tiếp (max 5 lần để chống vô hạn)
                if (
                    s.picked === 200 &&
                    Number(sessionStorage.getItem('w2bh_loop_count') || 0) < 5
                ) {
                    sessionStorage.setItem(
                        'w2bh_loop_count',
                        String(Number(sessionStorage.getItem('w2bh_loop_count') || 0) + 1)
                    );
                    sessionStorage.removeItem('w2bh_last_auto_reprocess');
                    setTimeout(() => {
                        _autoReprocessRunning = false;
                        autoReprocessOnLoad();
                    }, 1500);
                    return;
                }
                sessionStorage.removeItem('w2bh_loop_count');
            }
        } catch (e) {
            console.warn('[w2bh] auto-reprocess failed:', e.message);
        } finally {
            _autoReprocessRunning = false;
        }
    }

    async function reprocessUnmatched() {
        const btn = dom.reprocessBtn;
        if (!btn) return;
        // No confirm — Web 2.0 = 100% auto, no friction. User chỉ click khi muốn
        // force-run thay vì đợi auto-reprocess on load.
        sessionStorage.removeItem('w2bh_last_auto_reprocess');
        btn.disabled = true;
        const origText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
        if (window.lucide) window.lucide.createIcons();
        try {
            const r = await withFallback('/reprocess-unmatched', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 200 }),
            });
            const s = r?.data || {};
            notify(
                `✅ Reprocess ${s.picked} GD: ${s.matched} auto match, ${s.pending} pending, ${s.no_match} no match, ${s.errors} lỗi`,
                'success'
            );
            await W2BH.load();
        } catch (e) {
            notify('Lỗi reprocess: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // Tự động gán GD chưa gán vào KH (khớp đuôi SĐT + tên người gửi).
    async function autoAssign() {
        const btn = dom.autoAssignBtn;
        if (!btn) return;
        btn.disabled = true;
        const origText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang gán…';
        if (window.lucide) window.lucide.createIcons();
        try {
            const r = await withFallback('/auto-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit: 300 }),
            });
            const s = r || {};
            notify(
                `✅ Tự động gán: ${s.assigned} GD gán KH · ${s.ambiguous} mơ hồ (nhiều KH) · ${s.noIdentifier} không có SĐT/tên`,
                'success'
            );
            await W2BH.load();
        } catch (e) {
            notify('Lỗi tự động gán: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    async function autoMatchSingle(id) {
        try {
            const r = await withFallback(`/${encodeURIComponent(id)}/auto-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = r?.data || {};
            if (data.success && data.phone) {
                notify(
                    `✅ Match ${data.method}: ${data.customerName || data.phone} (conf ${data.confidenceScore || '-'})`,
                    'success'
                );
            } else if (
                data.method === 'pending_match_created' ||
                data.method === 'pending_low_confidence'
            ) {
                notify(`⏳ Push to pending (${data.method})`, 'warning');
            } else {
                notify(`❌ Không match được: ${data.reason || 'unknown'}`, 'warning');
            }
            await W2BH.load();
        } catch (e) {
            notify('Lỗi auto-match: ' + e.message, 'error');
        }
    }

    // Expose to namespace
    W2BH.autoReprocessOnLoad = autoReprocessOnLoad;
    W2BH.reprocessUnmatched = reprocessUnmatched;
    W2BH.autoAssign = autoAssign;
    W2BH.autoMatchSingle = autoMatchSingle;
})(window);
