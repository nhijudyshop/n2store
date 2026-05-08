// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL SHARED MODAL — branded custom confirm dialog cho mọi aikol page.
// Replaces native window.confirm() (xấu, có thể auto-dismiss trên 1 số env).
//
// Usage:
//   const ok = await aikolConfirm({ title, body, confirmLabel, cancelLabel, danger });
//   if (!ok) return;
//
// opts:
//   - title: string  (default 'Xác nhận')
//   - body: string HTML hoặc text (caller phải escape — để truyền HTML safe)
//   - confirmLabel: string (default 'Xác nhận')
//   - cancelLabel: string (default 'Huỷ')
//   - danger: bool — red confirm button (default false)
// =====================================================

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function aikolConfirm(opts) {
        const o = opts || {};
        return new Promise((resolve) => {
            const back = document.createElement('div');
            back.className = 'aikol-modal-backdrop aikol-confirm-backdrop';
            back.innerHTML = `
                <div class="aikol-modal aikol-confirm" role="dialog" aria-modal="true" aria-labelledby="aikol-confirm-title">
                    <div class="aikol-confirm__head">
                        <h3 id="aikol-confirm-title">${escapeHtml(o.title || 'Xác nhận')}</h3>
                    </div>
                    <div class="aikol-confirm__body">${o.body || ''}</div>
                    <div class="aikol-confirm__foot">
                        <button type="button" class="aikol-btn aikol-btn--secondary" data-act="cancel">
                            ${escapeHtml(o.cancelLabel || 'Huỷ')}
                        </button>
                        <button type="button" class="aikol-btn ${o.danger ? 'aikol-btn--danger' : ''}" data-act="confirm">
                            ${escapeHtml(o.confirmLabel || 'Xác nhận')}
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(back);

            let resolved = false;
            const cleanup = (val) => {
                if (resolved) return;
                resolved = true;
                document.removeEventListener('keydown', onKey);
                try {
                    back.remove();
                } catch (_) {}
                resolve(val);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup(false);
                } else if (e.key === 'Enter') {
                    // Only confirm on Enter if confirm button has focus
                    if (document.activeElement?.dataset?.act === 'confirm') {
                        e.preventDefault();
                        cleanup(true);
                    }
                }
            };

            back.addEventListener('click', (e) => {
                if (e.target === back) cleanup(false);
            });
            back.querySelector('[data-act="cancel"]').addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(false);
            });
            back.querySelector('[data-act="confirm"]').addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(true);
            });
            document.addEventListener('keydown', onKey);
            // Focus confirm button so Enter works immediately
            setTimeout(() => back.querySelector('[data-act="confirm"]')?.focus(), 30);
        });
    }

    /**
     * Convenience helper for delete confirmations (auto danger=true,
     * auto "Xoá" label).
     */
    async function aikolConfirmDelete(label, extraNote) {
        return aikolConfirm({
            title: 'Xác nhận xoá',
            body:
                `<p style="margin:0">Xoá <strong>${escapeHtml(label)}</strong>?</p>` +
                (extraNote
                    ? `<p style="margin:0.5rem 0 0;color:var(--aikol-text-dim);font-size:0.85rem">${escapeHtml(
                          extraNote
                      )}</p>`
                    : ''),
            confirmLabel: 'Xoá',
            cancelLabel: 'Huỷ',
            danger: true,
        });
    }

    // Expose globally
    global.aikolConfirm = aikolConfirm;
    global.aikolConfirmDelete = aikolConfirmDelete;
})(typeof window !== 'undefined' ? window : globalThis);
