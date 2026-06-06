// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Lịch sử thay đổi bảng công nợ NCC (supplier-debt).
// Ghi lại 4 loại hành động per-NCC: kéo đổi vị trí hàng, sửa/xóa ghi chú web,
// xóa thanh toán, reset thứ tự về mặc định. Lưu Firestore + localStorage cache +
// realtime listener (giống RowOrderStore — đây là trang legacy/Web 1.0 dùng Firestore).
//
// Hiển thị: nút "Lịch sử" ở tab Công nợ → modal timeline của NCC đang xem.
// Phụ thuộc globals từ main.js (load TRƯỚC): escapeHtml, State, renderCongNoTab,
// RowOrderStore, window.db/getFirestore, firebase, window.authManager, window.notificationManager.

(function () {
    'use strict';

    const HISTORY_CAP = 50; // giữ tối đa 50 sự kiện gần nhất / NCC

    function currentUser() {
        try {
            const info = window.authManager?.getUserInfo?.();
            return info?.displayName || info?.username || 'N/A';
        } catch (_) {
            return 'N/A';
        }
    }

    function esc(s) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(String(s ?? ''));
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function fmtTime(ts) {
        try {
            return new Date(ts).toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (_) {
            return '';
        }
    }

    function fmtNum(n) {
        return (Number(n) || 0).toLocaleString('vi-VN');
    }

    // =====================================================
    // STORE (Firestore + localStorage cache + realtime)
    // =====================================================
    const RowHistoryStore = {
        _data: new Map(), // supplierCode -> [event, ...] (mới nhất ở đầu)
        _unsubscribe: null,
        _isListening: false,
        COLLECTION: 'supplier_debt_history',

        _getDocRef() {
            const db = window.db || (typeof getFirestore === 'function' ? getFirestore() : null);
            if (!db) return null;
            return db.collection(this.COLLECTION).doc('events');
        },

        async init() {
            try {
                const saved = localStorage.getItem('supplierDebt_rowHistory');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    for (const [k, v] of Object.entries(parsed)) this._data.set(k, v);
                }
            } catch (_) {
                /* ignore */
            }

            const docRef = this._getDocRef();
            if (docRef) {
                try {
                    const doc = await docRef.get();
                    if (doc.exists && doc.data()?.data) {
                        this._data = new Map(Object.entries(doc.data().data));
                        this._saveLocal();
                    }
                } catch (e) {
                    console.error('[RowHistoryStore] Firestore load error:', e);
                }

                this._unsubscribe = docRef.onSnapshot(
                    (doc) => {
                        if (doc.exists && doc.data()?.data) {
                            this._isListening = true;
                            this._data = new Map(Object.entries(doc.data().data));
                            this._saveLocal();
                            this._isListening = false;
                            refreshOpenHistoryModal();
                        }
                    },
                    (err) => console.error('[RowHistoryStore] Listener error:', err)
                );
            }
            console.log('[RowHistoryStore] Initialized with', this._data.size, 'suppliers');
        },

        _saveLocal() {
            try {
                localStorage.setItem(
                    'supplierDebt_rowHistory',
                    JSON.stringify(Object.fromEntries(this._data))
                );
            } catch (_) {
                /* ignore */
            }
        },

        get(supplierCode) {
            return this._data.get(supplierCode) || [];
        },

        async add(supplierCode, event) {
            if (!supplierCode || !event || !event.type) return;
            const evt = { ts: Date.now(), user: currentUser(), ...event };
            const list = [evt, ...(this._data.get(supplierCode) || [])].slice(0, HISTORY_CAP);
            this._data.set(supplierCode, list);
            this._saveLocal();

            const docRef = this._getDocRef();
            if (docRef && !this._isListening) {
                try {
                    await docRef.set(
                        { data: Object.fromEntries(this._data), lastUpdated: Date.now() },
                        { merge: true }
                    );
                } catch (e) {
                    console.error('[RowHistoryStore] Save error:', e);
                }
            }
        },
    };
    window.RowHistoryStore = RowHistoryStore;

    // =====================================================
    // EVENT RENDERING
    // =====================================================
    function describeEvent(e) {
        switch (e.type) {
            case 'reorder':
                return {
                    icon: '⇅',
                    cls: 'rh-reorder',
                    text: `Kéo <b>${esc(e.moveName)}</b> từ vị trí <b>#${e.from}</b> → <b>#${e.to}</b>`,
                };
            case 'note': {
                const oldN = e.oldNote ? `“${esc(e.oldNote)}”` : '<i>(trống)</i>';
                const newN = e.newNote ? `“${esc(e.newNote)}”` : '<i>(xóa ghi chú)</i>';
                return {
                    icon: '✎',
                    cls: 'rh-note',
                    text: `Ghi chú <b>${esc(e.moveName)}</b>: ${oldN} → ${newN}`,
                };
            }
            case 'payment_delete':
                return {
                    icon: '🗑',
                    cls: 'rh-delete',
                    text: `Xóa thanh toán <b>${esc(e.moveName)}</b> <span class="rh-amount">(${fmtNum(e.amount)})</span>`,
                };
            case 'reset_order':
                return {
                    icon: '↺',
                    cls: 'rh-reset',
                    text: 'Khôi phục thứ tự mặc định (sắp xếp theo ngày)',
                };
            default:
                return { icon: '•', cls: '', text: esc(e.type) };
        }
    }

    // =====================================================
    // MODAL
    // =====================================================
    let _modalState = { supplierCode: null, partnerId: null };

    function openRowHistoryModal(supplierCode, partnerId) {
        _modalState = { supplierCode, partnerId };
        const modal = document.getElementById('rowHistoryModal');
        if (!modal) return;
        const title = document.getElementById('rowHistoryTitle');
        if (title) title.textContent = `Lịch sử thay đổi: ${supplierCode}`;
        renderHistoryBody();
        modal.classList.add('show');
    }

    function renderHistoryBody() {
        const { supplierCode } = _modalState;
        const body = document.getElementById('rowHistoryBody');
        const footer = document.getElementById('rowHistoryFooter');
        if (!body) return;

        const events = RowHistoryStore.get(supplierCode);
        if (!events.length) {
            body.innerHTML =
                '<div class="row-history-empty">Chưa có thay đổi nào được ghi lại cho NCC này.</div>';
        } else {
            body.innerHTML =
                '<div class="row-history-timeline">' +
                events
                    .map((e) => {
                        const d = describeEvent(e);
                        return `
                        <div class="row-history-item ${d.cls}">
                            <span class="rh-icon">${d.icon}</span>
                            <div class="rh-main">
                                <div class="rh-text">${d.text}</div>
                                <div class="rh-meta">${fmtTime(e.ts)} · <b>${esc(e.user)}</b></div>
                            </div>
                        </div>`;
                    })
                    .join('') +
                '</div>';
        }

        // Nút reset chỉ hiện khi NCC đang có thứ tự kéo tay tùy chỉnh
        if (footer) {
            const hasCustomOrder = (window.RowOrderStore?.get?.(supplierCode) || []).length > 0;
            footer.innerHTML = hasCustomOrder
                ? '<button class="btn btn-reset-order" onclick="resetRowOrder()">↺ Khôi phục thứ tự mặc định</button>'
                : '<span class="row-history-hint">Thứ tự hiện theo mặc định (ngày).</span>';
        }
    }

    function refreshOpenHistoryModal() {
        const modal = document.getElementById('rowHistoryModal');
        if (modal?.classList.contains('show') && _modalState.supplierCode) {
            renderHistoryBody();
        }
    }

    function closeRowHistoryModal() {
        document.getElementById('rowHistoryModal')?.classList.remove('show');
    }

    async function resetRowOrder() {
        const { supplierCode, partnerId } = _modalState;
        if (!supplierCode) return;

        let confirmed = true;
        if (window.notificationManager?.confirm) {
            confirmed = await window.notificationManager.confirm(
                `Khôi phục thứ tự mặc định (theo ngày) cho NCC [${supplierCode}]? Thứ tự kéo tay sẽ bị xóa.`,
                'Xác nhận khôi phục'
            );
        } else {
            confirmed = confirm('Khôi phục thứ tự mặc định?');
        }
        if (!confirmed) return;

        try {
            await window.RowOrderStore?.delete?.(supplierCode);
            await RowHistoryStore.add(supplierCode, { type: 'reset_order' });
            window.notificationManager?.success?.('Đã khôi phục thứ tự mặc định');

            if (partnerId && typeof window.renderCongNoTab === 'function') {
                const tab = document.getElementById(`tab-congno-${partnerId}`);
                if (tab) {
                    tab.innerHTML = window.renderCongNoTab(partnerId);
                    if (window.lucide) window.lucide.createIcons();
                }
            }
            renderHistoryBody();
        } catch (e) {
            console.error('[RowHistoryStore] resetRowOrder error:', e);
            window.notificationManager?.error?.('Lỗi khôi phục thứ tự: ' + e.message);
        }
    }

    // Expose handlers used by inline onclick + main.js
    window.openRowHistoryModal = openRowHistoryModal;
    window.closeRowHistoryModal = closeRowHistoryModal;
    window.resetRowOrder = resetRowOrder;

    // =====================================================
    // INIT
    // =====================================================
    document.addEventListener('DOMContentLoaded', () => {
        RowHistoryStore.init();

        const modal = document.getElementById('rowHistoryModal');
        document
            .getElementById('btnCloseRowHistory')
            ?.addEventListener('click', closeRowHistoryModal);
        document
            .getElementById('btnCloseRowHistoryFooter')
            ?.addEventListener('click', closeRowHistoryModal);
        modal?.addEventListener('click', (e) => {
            if (e.target.id === 'rowHistoryModal') closeRowHistoryModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal?.classList.contains('show')) closeRowHistoryModal();
        });
    });
})();
