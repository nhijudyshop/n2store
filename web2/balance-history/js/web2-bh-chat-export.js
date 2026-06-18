// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-chat-export — mở hội thoại FB của KH (Web2CustomerChat dùng chung)
// + xuất CSV theo filter hiện tại.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const { state, dom, withFallback, notify, fmtTime, FB_CONV_BASE, FB_CONV_FALLBACK } = W2BH;

    // ----- Mở hội thoại FB của KH ngay từ row (nút 💬) -----
    async function fbConversation(phone) {
        const path = `/${encodeURIComponent(phone)}/fb-conversation`;
        for (const base of [FB_CONV_BASE, FB_CONV_FALLBACK]) {
            try {
                const r = await fetch(base + path);
                if (r.ok) return await r.json();
            } catch {}
        }
        return null;
    }
    async function openChatForPhone(phone, name) {
        // Có SĐT → FULL chat (Pancake + Zalo) qua launcher dùng chung Web2CustomerChat.
        if (phone && window.Web2CustomerChat?.open) {
            window.Web2CustomerChat.open({ phone, name });
            return;
        }
        if (!window.Web2CustomerChat?.open) {
            notify('Module hội thoại chưa load', 'warning');
            return;
        }
        // Row chưa gán KH (không có phone) → mở modal tìm kiếm (readonly), user tự gõ.
        if (!phone) {
            window.Web2CustomerChat.open({ layout: 'modal', readonly: true });
            return;
        }
        const r = await fbConversation(phone);
        if (r && r.found) {
            window.Web2CustomerChat.open({
                layout: 'modal',
                readonly: true,
                fbId: r.psid,
                pageId: r.pageId || null,
                name: r.name || name || '',
            });
        } else {
            // Chưa resolve được FB → mở modal tìm seed tên/SĐT (linh hoạt).
            window.Web2CustomerChat.open({
                layout: 'modal',
                readonly: true,
                query: name || phone,
            });
        }
    }

    // ----- CSV export -----
    async function exportCsv() {
        const btn = dom.csvBtn;
        if (!btn) return;
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xuất…';
        if (window.lucide) window.lucide.createIcons();
        try {
            const params = new URLSearchParams();
            params.set('limit', '500');
            params.set('offset', '0');
            if (state.status !== 'all') params.set('status', state.status);
            if (state.search) params.set('search', state.search);
            if (state.dateFrom) params.set('since', state.dateFrom);
            if (state.dateTo) params.set('until', state.dateTo);
            const r = await withFallback(`?${params.toString()}`);
            const rows = r?.data || [];
            const header = [
                'Thời gian',
                'Loại',
                'Số tiền',
                'SĐT KH',
                'Tên KH',
                'Trạng thái',
                'Match method',
                'Confidence',
                'Sepay ID',
                'Reference',
                'Nội dung',
            ];
            const escape = (v) => {
                if (v == null) return '';
                const s = String(v).replace(/"/g, '""');
                return /[",\n]/.test(s) ? `"${s}"` : s;
            };
            const lines = [header.join(',')];
            for (const row of rows) {
                lines.push(
                    [
                        fmtTime(row.transaction_date),
                        row.transfer_type === 'in' ? 'Vào' : 'Ra',
                        row.transfer_amount || 0,
                        row.linked_customer_phone || '',
                        row.display_name || '',
                        row.verification_status || '',
                        row.match_method || '',
                        row.confidence_score || '',
                        row.sepay_id || '',
                        row.reference_code || '',
                        row.content || '',
                    ]
                        .map(escape)
                        .join(',')
                );
            }
            const csv = '﻿' + lines.join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `balance-history-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            notify(`Xuất ${rows.length} dòng CSV`, 'success');
        } catch (e) {
            notify('Lỗi xuất CSV: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // Expose to namespace
    W2BH.fbConversation = fbConversation;
    W2BH.openChatForPhone = openChatForPhone;
    W2BH.exportCsv = exportCsv;
})(window);
