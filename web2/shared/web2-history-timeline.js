// #Note: WEB2.0 shared module — render audit history timeline.
// =====================================================
// Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user
// =====================================================
//
// Mục đích: 1 component render đồng nhất cho audit history trên TẤT CẢ
// trang Web 2.0. Đầu vào là data.history array, đầu ra là HTML string
// (timeline với marker tròn color per action, user badge xanh, timestamp).
//
// P1 2026-05-30: user ask "lịch sử chỉnh sửa kèm tên user tương tác" →
// apply cho tất cả trang Web 2.0. Pattern dùng:
//
//   const html = Web2HistoryTimeline.render(record.data?.history);
//   document.querySelector('.history-section').innerHTML = html;
//
// CSS: tự inject lần đầu render (idempotent). Pages KHÔNG cần copy CSS.

(function (global) {
    'use strict';

    if (global.Web2HistoryTimeline) return;

    const ACTION_LABEL = {
        create: '📝 Tạo',
        update: '✎ Cập nhật',
        delete: '🗑 Xóa',
        approve: '✓ Duyệt',
        'cancel-approve': '↩ Hủy duyệt',
        refunded: '💰 Hoàn tiền',
        reject: '✗ Từ chối',
        send: '📤 Gửi',
        receive: '📥 Nhận',
        purchase: '🛒 Mua hàng',
        payment: '💵 Thanh toán',
        return: '↩ Trả hàng',
        'stock-adjust': '📦 Chỉnh tồn',
        'toggle-active': '🔄 Đổi trạng thái',
    };

    function _escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _fmtDateTime(ts) {
        if (!ts) return '—';
        try {
            // GMT+7 (quy tắc 10)
            return new Date(ts).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        } catch {
            return String(ts);
        }
    }

    let _cssInjected = false;
    function _injectCss() {
        if (_cssInjected) return;
        _cssInjected = true;
        const css = `
.w2-history-timeline {
    margin-top: 18px;
    padding: 14px 16px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}
.w2-history-timeline h3 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #475569;
    font-weight: 700;
}
.w2-timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
}
.w2-timeline::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: #cbd5e1;
}
.w2-timeline-entry {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 6px 0 10px;
    position: relative;
}
.w2-timeline-marker {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid #94a3b8;
    flex-shrink: 0;
    margin-top: 3px;
    position: relative;
    z-index: 1;
}
.w2-timeline-create .w2-timeline-marker { border-color: #2563eb; background: #dbeafe; }
.w2-timeline-update .w2-timeline-marker { border-color: #0ea5e9; background: #e0f2fe; }
.w2-timeline-delete .w2-timeline-marker { border-color: #6b7280; background: #f3f4f6; }
.w2-timeline-approve .w2-timeline-marker { border-color: #16a34a; background: #dcfce7; }
.w2-timeline-cancel-approve .w2-timeline-marker { border-color: #d97706; background: #fef3c7; }
.w2-timeline-refunded .w2-timeline-marker { border-color: #059669; background: #d1fae5; }
.w2-timeline-reject .w2-timeline-marker { border-color: #dc2626; background: #fee2e2; }
.w2-timeline-purchase .w2-timeline-marker { border-color: #7c3aed; background: #ede9fe; }
.w2-timeline-payment .w2-timeline-marker { border-color: #16a34a; background: #dcfce7; }
.w2-timeline-return .w2-timeline-marker { border-color: #f59e0b; background: #fef3c7; }
.w2-timeline-body { flex: 1; min-width: 0; }
.w2-timeline-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
}
.w2-timeline-head strong { color: #0f172a; }
.w2-timeline-ts {
    font-size: 11px;
    color: #94a3b8;
    font-family: ui-monospace, SF Mono, Menlo, monospace;
    white-space: nowrap;
}
.w2-timeline-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
    font-size: 12px;
    color: #475569;
    flex-wrap: wrap;
}
.w2-timeline-user {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #e0f2fe;
    color: #075985;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
}
.w2-timeline-source {
    font-size: 10px;
    color: #94a3b8;
    font-family: ui-monospace, SF Mono, Menlo, monospace;
}
.w2-timeline-note { color: #64748b; font-style: italic; }
.w2-history-empty { color: #94a3b8; font-style: italic; text-align: center; padding: 12px; }
`;
        const style = document.createElement('style');
        style.id = 'w2-history-timeline-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Render timeline từ history array.
     * @param {Array} history - data.history từ record
     * @param {Object} [opts]
     * @param {boolean} [opts.title=true] - hiển thị h3 title
     * @param {string} [opts.titleText='Lịch sử chỉnh sửa'] - title text
     * @param {boolean} [opts.newestFirst=true] - sort newest first
     * @returns {string} HTML string
     */
    function render(history, opts) {
        _injectCss();
        const o = opts || {};
        const showTitle = o.title !== false;
        const titleText = o.titleText || 'Lịch sử chỉnh sửa';
        const newestFirst = o.newestFirst !== false;

        const items = Array.isArray(history) ? history.slice() : [];
        if (newestFirst) items.reverse();

        if (!items.length) {
            return `<div class="w2-history-timeline">
                ${showTitle ? `<h3>📋 ${_escapeHtml(titleText)}</h3>` : ''}
                <div class="w2-history-empty">Chưa có lịch sử chỉnh sửa</div>
            </div>`;
        }

        const entries = items
            .map((h) => {
                const action = h.action || 'unknown';
                const label = ACTION_LABEL[action] || action;
                const user = h.userName || h.userId || '(ẩn danh)';
                const source = h.sourcePage
                    ? `<span class="w2-timeline-source">${_escapeHtml(h.sourcePage)}</span>`
                    : '';
                return `<li class="w2-timeline-entry w2-timeline-${_escapeHtml(action)}">
                <div class="w2-timeline-marker"></div>
                <div class="w2-timeline-body">
                    <div class="w2-timeline-head">
                        <strong>${_escapeHtml(label)}</strong>
                        <span class="w2-timeline-ts">${_escapeHtml(_fmtDateTime(h.ts))}</span>
                    </div>
                    <div class="w2-timeline-meta">
                        <span class="w2-timeline-user">👤 ${_escapeHtml(user)}</span>
                        ${source}
                        ${h.note ? `<span class="w2-timeline-note">${_escapeHtml(h.note)}</span>` : ''}
                    </div>
                </div>
            </li>`;
            })
            .join('');

        return `<div class="w2-history-timeline">
            ${showTitle ? `<h3>📋 ${_escapeHtml(titleText)} (${items.length})</h3>` : ''}
            <ul class="w2-timeline">${entries}</ul>
        </div>`;
    }

    /** Render entry đơn (vd inline ở list item). */
    function renderEntry(entry) {
        if (!entry) return '';
        _injectCss();
        return render([entry], { title: false });
    }

    global.Web2HistoryTimeline = {
        render,
        renderEntry,
        ACTION_LABEL,
    };
})(typeof window !== 'undefined' ? window : globalThis);
