// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — confirm dialog (soConfirmOpen/soConfirm) + showModal/hideModal. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // Body scroll-lock (iOS-safe: position:fixed + top:-scrollY) — MODAL-ANTI-LAG §5.2.
    // Ref-counted theo id modal đang lock: idempotent (mở lại id đang mở không cộng
    // dồn) + stack-safe (confirm mở trên order modal không unlock sớm). Chỉ unlock
    // khi modal CUỐI đóng, restore đúng scrollY ban đầu.
    let _soSavedScrollY = 0;
    const _soLockedModals = new Set();
    function _soLockBody(id) {
        if (_soLockedModals.has(id)) return; // idempotent
        const wasEmpty = _soLockedModals.size === 0;
        _soLockedModals.add(id);
        if (!wasEmpty) return; // đã lock bởi modal khác → giữ scrollY cũ
        _soSavedScrollY = window.scrollY || window.pageYOffset || 0;
        document.body.style.cssText = `position:fixed;top:-${_soSavedScrollY}px;left:0;right:0;width:100%;overflow:hidden;`;
    }
    function _soUnlockBody(id) {
        if (!_soLockedModals.delete(id)) return; // không từng lock id này → no-op
        if (_soLockedModals.size > 0) return; // còn modal khác đang mở → giữ lock
        document.body.style.cssText = '';
        window.scrollTo(0, _soSavedScrollY);
    }

    SO.showModal = function showModal(id) {
        const el = document.getElementById(id);
        if (el) {
            el.hidden = false;
            _soLockBody(id);
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    };

    SO.hideModal = function hideModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
        _soUnlockBody(id);
        // Đóng modal Tạo Đơn Hàng → ẩn luôn 2 float panel (suggest/variant) đang
        // treo ở <body>, tránh popup lơ lửng sau khi modal đóng.
        if (id === 'soOrderModal') SO._hideFloatPanels();
    };

    /**
     * Open confirm dialog instantly + return controller cho late update.
     * Khắc phục delay khi caller cần chạy async check (vd: stock check)
     * trước khi populate full content — popup hiện ngay với loading state,
     * caller chạy check trong nền, gọi ctrl.update() khi xong.
     *
     * @param {Object} opts
     * @param {string} [opts.title='Xác nhận']
     * @param {string} [opts.message='']
     * @param {string[]} [opts.items=null] - list rendered as <ul>
     * @param {string} [opts.footNote=''] - red foot warning box
     * @param {string} [opts.confirmText='OK']
     * @param {string} [opts.cancelText='Hủy']
     * @param {boolean} [opts.danger=true]
     * @param {boolean} [opts.loading=false] - show spinner + disable OK
     * @param {string} [opts.loadingText='Đang kiểm tra...']
     * @returns {{ result: Promise<boolean>, update: (patch) => void, close: (val?: boolean) => void, closed: boolean }}
     */
    SO.soConfirmOpen = function soConfirmOpen(opts = {}) {
        let modal = document.getElementById('soConfirmModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'soConfirmModal';
            modal.className = 'so-modal so-confirm-modal';
            modal.hidden = true;
            modal.innerHTML = `
                <div class="so-modal-backdrop" data-so-confirm-cancel></div>
                <div class="so-modal-panel so-modal-panel-narrow" role="dialog" aria-modal="true" aria-labelledby="soConfirmTitle">
                    <header class="so-modal-head">
                        <h2 id="soConfirmTitle" data-so-confirm-title></h2>
                        <button class="so-modal-close" type="button" data-so-confirm-cancel aria-label="Hủy">
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-modal-body so-confirm-body">
                        <p data-so-confirm-message></p>
                        <ul data-so-confirm-items hidden></ul>
                        <div class="so-confirm-foot-note" data-so-confirm-foot hidden></div>
                        <div class="so-confirm-loading" data-so-confirm-loading hidden>
                            <span class="so-confirm-spinner"></span>
                            <span data-so-confirm-loading-text>Đang kiểm tra...</span>
                        </div>
                    </div>
                    <footer class="so-modal-foot">
                        <span class="so-modal-foot-spacer"></span>
                        <button type="button" class="so-btn-confirm-cancel" data-so-confirm-cancel></button>
                        <button type="button" data-so-confirm-ok></button>
                    </footer>
                </div>
            `;
            document.body.appendChild(modal);
        }
        const titleEl = modal.querySelector('[data-so-confirm-title]');
        const msgEl = modal.querySelector('[data-so-confirm-message]');
        const itemsEl = modal.querySelector('[data-so-confirm-items]');
        const footEl = modal.querySelector('[data-so-confirm-foot]');
        const loadingEl = modal.querySelector('[data-so-confirm-loading]');
        const loadingTextEl = modal.querySelector('[data-so-confirm-loading-text]');
        const okBtn = modal.querySelector('[data-so-confirm-ok]');
        const cancelBtn = modal.querySelector('.so-btn-confirm-cancel');

        let current = {
            title: 'Xác nhận',
            message: '',
            items: null,
            footNote: '',
            confirmText: 'OK',
            cancelText: 'Hủy',
            danger: true,
            loading: false,
            loadingText: 'Đang kiểm tra...',
            ...opts,
        };

        const render = () => {
            titleEl.textContent = current.title;
            msgEl.textContent = current.message;
            msgEl.hidden = !current.message;
            if (Array.isArray(current.items) && current.items.length) {
                itemsEl.innerHTML = current.items
                    .map((it) => `<li>${SO.escapeHtml(String(it))}</li>`)
                    .join('');
                itemsEl.hidden = false;
            } else {
                itemsEl.innerHTML = '';
                itemsEl.hidden = true;
            }
            if (current.footNote) {
                footEl.textContent = current.footNote;
                footEl.hidden = false;
            } else {
                footEl.textContent = '';
                footEl.hidden = true;
            }
            if (current.loading) {
                loadingTextEl.textContent = current.loadingText;
                loadingEl.hidden = false;
                okBtn.disabled = true;
            } else {
                loadingEl.hidden = true;
                okBtn.disabled = false;
            }
            okBtn.textContent = current.confirmText;
            okBtn.className = current.danger ? 'so-btn-confirm-danger' : 'so-btn-confirm-primary';
            cancelBtn.textContent = current.cancelText;
            modal.classList.toggle('is-danger', !!current.danger);
        };

        render();
        modal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();

        let closed = false;
        let resolveFn;
        const result = new Promise((r) => {
            resolveFn = r;
        });
        const finish = (val) => {
            if (closed) return;
            closed = true;
            modal.hidden = true;
            modal.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKey);
            resolveFn(val);
        };
        const onClick = (e) => {
            const okEl = e.target.closest('[data-so-confirm-ok]');
            if (okEl) {
                if (!okBtn.disabled) finish(true);
                return;
            }
            if (e.target.closest('[data-so-confirm-cancel]')) finish(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') finish(false);
            else if (e.key === 'Enter' && !okBtn.disabled) finish(true);
        };
        modal.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey);
        setTimeout(() => {
            if (closed) return;
            if (!okBtn.disabled) okBtn.focus();
            else cancelBtn.focus();
        }, 30);

        return {
            result,
            get closed() {
                return closed;
            },
            update(patch) {
                if (closed) return;
                current = { ...current, ...(patch || {}) };
                render();
            },
            close(val = false) {
                finish(val);
            },
        };
    };

    /** Drop-in cho window.confirm() — returns Promise<boolean> trực tiếp. */
    SO.soConfirm = function soConfirm(opts = {}) {
        return SO.soConfirmOpen(opts).result;
    };
})();
