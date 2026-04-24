// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Transaction Evidence helpers
 *
 * Dùng chung giữa wallet-panel và transaction-activity (và customer-profile nếu cần).
 *
 * Exposed on window.TxEvidence:
 *   getSepayImageUrl(tx)   -> string|null
 *   getTicketCode(tx)      -> string|null (mã TV-YYYY-NNNNN)
 *   showSepayImage(url)    -> open lightbox
 *   showTicketDetail(code) -> open ticket history modal
 */
(function () {
    const STYLE_ID = 'tx-evidence-style';
    const LIGHTBOX_ID = 'tx-evidence-lightbox';

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = `
            .tx-eye-btn { background: transparent; border: 0; cursor: pointer; padding: 4px;
                border-radius: 6px; color: #64748b; flex-shrink: 0;
                display: inline-flex; align-items: center; justify-content: center; }
            .tx-eye-btn:hover { background: rgba(100, 116, 139, 0.12); }
            .tx-eye-btn[data-eye-kind="sepay"]:hover { color: #2563eb; }
            .tx-eye-btn[data-eye-kind="ticket"]:hover { color: #7c3aed; }
            .tx-eye-btn .material-symbols-outlined { font-size: 18px; }
            #${LIGHTBOX_ID} { position: fixed; inset: 0; background: rgba(0,0,0,0.75);
                z-index: 10000; display: flex; align-items: center; justify-content: center;
                padding: 24px; cursor: zoom-out; }
            #${LIGHTBOX_ID} img { max-width: 100%; max-height: 100%;
                border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        `;
        document.head.appendChild(el);
    }

    /**
     * Detect CK Sepay DEPOSIT that has an approval image attached.
     * Backend now returns `sepay_image_url` via LEFT JOIN balance_history.
     */
    function getSepayImageUrl(tx) {
        if (!tx) return null;
        if (tx.type !== 'DEPOSIT') return null;
        if (tx.reference_type !== 'balance_history') return null;
        return tx.sepay_image_url || null;
    }

    /**
     * Detect ticket-linked transaction (VIRTUAL_CREDIT from RETURN_SHIPPER,
     * DEPOSIT from RETURN_CLIENT, etc.). Match TV-YYYY-NNNNN in any ref field.
     */
    function getTicketCode(tx) {
        if (!tx) return null;
        const fields = [tx.reference_id, tx.note, tx.source].filter(Boolean);
        for (const f of fields) {
            const m = String(f).match(/TV-\d{4}-\d+/);
            if (m) return m[0];
        }
        return null;
    }

    /**
     * Pick which eye icon (if any) to show for a transaction.
     * Priority: sepay > ticket. Skip if note already contains [Ảnh GD:] (existing thumbnail).
     */
    function pickEvidence(tx) {
        const hasInlineImage = /\[Ảnh GD: https?:\/\//.test(String(tx?.note || ''));
        const sepay = !hasInlineImage ? getSepayImageUrl(tx) : null;
        if (sepay) return { kind: 'sepay', value: sepay };
        const ticket = getTicketCode(tx);
        if (ticket) return { kind: 'ticket', value: ticket };
        return null;
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Render HTML button for the evidence eye icon. Returns '' if no evidence.
     * extraClass: any layout class to merge.
     */
    function renderEyeButton(tx, extraClass = '') {
        const ev = pickEvidence(tx);
        if (!ev) return '';
        const title = ev.kind === 'sepay' ? 'Xem ảnh duyệt CK' : 'Xem chi tiết phiếu';
        const cls = `tx-eye-btn ${extraClass}`.trim();
        return `<button type="button" class="${cls}" data-eye-kind="${ev.kind}" data-eye-val="${escapeAttr(ev.value)}" title="${title}">
            <span class="material-symbols-outlined">visibility</span>
        </button>`;
    }

    function showSepayImage(imgUrl) {
        if (!imgUrl) return;
        injectStyle();
        let box = document.getElementById(LIGHTBOX_ID);
        if (box) box.remove();
        box = document.createElement('div');
        box.id = LIGHTBOX_ID;
        box.innerHTML = `<img src="${escapeAttr(imgUrl)}" alt="Ảnh duyệt CK">`;
        box.addEventListener('click', () => box.remove());
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', onEsc); }
        });
        document.body.appendChild(box);
    }

    let ticketViewerLoading = null;
    async function ensureTicketViewer() {
        if (typeof window.showTicketHistoryViewer === 'function') return;
        if (ticketViewerLoading) return ticketViewerLoading;
        ticketViewerLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '../shared/js/ticket-history-viewer.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Không tải được ticket-history-viewer.js'));
            document.head.appendChild(s);
        });
        return ticketViewerLoading;
    }

    async function showTicketDetail(ticketCode) {
        if (!ticketCode) return;
        try {
            await ensureTicketViewer();
            if (typeof window.showTicketHistoryViewer === 'function') {
                window.showTicketHistoryViewer(ticketCode);
            } else {
                alert('Không mở được chi tiết phiếu');
            }
        } catch (e) {
            console.error('[TxEvidence] ticket detail failed:', e);
            alert(`Không mở được chi tiết phiếu: ${e.message}`);
        }
    }

    /**
     * Bind click handlers on all .tx-eye-btn inside a given root.
     * Safe to call multiple times; uses data attr flag to avoid double-binding.
     */
    function bindHandlers(root) {
        if (!root) return;
        const buttons = root.querySelectorAll('.tx-eye-btn:not([data-eye-bound])');
        buttons.forEach((btn) => {
            btn.setAttribute('data-eye-bound', '1');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const kind = btn.getAttribute('data-eye-kind');
                const val = btn.getAttribute('data-eye-val');
                if (kind === 'sepay') showSepayImage(val);
                else if (kind === 'ticket') showTicketDetail(val);
            });
        });
    }

    // Inject styles eagerly so the button looks right on first paint.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
    } else {
        injectStyle();
    }

    window.TxEvidence = {
        getSepayImageUrl,
        getTicketCode,
        pickEvidence,
        renderEyeButton,
        showSepayImage,
        showTicketDetail,
        bindHandlers,
    };
})();
