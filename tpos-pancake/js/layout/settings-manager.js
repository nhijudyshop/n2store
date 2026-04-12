// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Settings Manager - TPOS and Pancake settings modals
 * Extracted from inline JS in index.html
 */

const SettingsManager = (() => {

    // ---- TPOS Settings ----

    function _initTposSettings() {
        const btnOpen = document.getElementById('btnTposSettings');
        const modal = document.getElementById('tposSettingsModal');
        const btnClose = modal?.querySelector('.close-modal');

        if (btnOpen) {
            btnOpen.addEventListener('click', () => {
                if (modal) modal.style.display = 'flex';
                _loadTposSettingsValues();
            });
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
            });
        }

        // Debt display toggle
        const debtToggle = document.getElementById('tposShowDebt');
        if (debtToggle) {
            debtToggle.checked = localStorage.getItem('tpos_show_debt') !== 'false';
            debtToggle.addEventListener('change', () => {
                localStorage.setItem('tpos_show_debt', debtToggle.checked);
                window.eventBus?.emit('layout:settingsChanged', { key: 'tpos_show_debt', value: debtToggle.checked });
            });
        }

        // Show zero debt toggle
        const zeroDebtToggle = document.getElementById('tposShowZeroDebt');
        if (zeroDebtToggle) {
            zeroDebtToggle.checked = localStorage.getItem('tpos_show_zero_debt') === 'true';
            zeroDebtToggle.addEventListener('change', () => {
                localStorage.setItem('tpos_show_zero_debt', zeroDebtToggle.checked);
                window.eventBus?.emit('layout:settingsChanged', { key: 'tpos_show_zero_debt', value: zeroDebtToggle.checked });
            });
        }
    }

    function _loadTposSettingsValues() {
        const debtToggle = document.getElementById('tposShowDebt');
        const zeroDebtToggle = document.getElementById('tposShowZeroDebt');
        if (debtToggle) debtToggle.checked = localStorage.getItem('tpos_show_debt') !== 'false';
        if (zeroDebtToggle) zeroDebtToggle.checked = localStorage.getItem('tpos_show_zero_debt') === 'true';
    }

    // ---- Pancake Settings ----

    function _initPancakeSettings() {
        const btnOpen = document.getElementById('btnPancakeSettings');
        const modal = document.getElementById('pancakeSettingsModal');
        const btnClose = modal?.querySelector('.close-modal');

        if (btnOpen) {
            btnOpen.addEventListener('click', () => {
                if (modal) modal.style.display = 'flex';
                _loadPancakeAccounts();
            });
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
            });
        }

        // Server mode toggle
        const serverModeSwitch = document.getElementById('serverModeSwitch');
        if (serverModeSwitch) {
            const savedMode = localStorage.getItem('pancake_server_mode') || 'pancake';
            serverModeSwitch.checked = savedMode === 'n2store';
            _updateServerModeIndicator(savedMode);

            serverModeSwitch.addEventListener('change', () => {
                const mode = serverModeSwitch.checked ? 'n2store' : 'pancake';
                localStorage.setItem('pancake_server_mode', mode);
                _updateServerModeIndicator(mode);
                window.eventBus?.emit('layout:settingsChanged', { key: 'pancake_server_mode', value: mode });
            });
        }

        // Add account button
        const btnAdd = document.getElementById('btnAddAccount');
        if (btnAdd) {
            btnAdd.addEventListener('click', _handleAddAccount);
        }
    }

    function _updateServerModeIndicator(mode) {
        const indicator = document.getElementById('serverModeIndicator');
        if (indicator) {
            indicator.textContent = mode === 'n2store' ? 'N2Store' : 'Pancake';
            indicator.className = `server-mode-indicator mode-${mode}`;
        }
    }

    function _loadPancakeAccounts() {
        const listEl = document.getElementById('accountsList');
        if (!listEl || !window.pancakeTokenManager) return;

        const accounts = window.pancakeTokenManager.getAllAccounts?.() || [];
        const activeId = window.pancakeTokenManager.getActiveAccountId?.();

        if (accounts.length === 0) {
            listEl.innerHTML = '<div class="empty-accounts">Chưa có tài khoản nào. Thêm JWT token để bắt đầu.</div>';
            return;
        }

        listEl.innerHTML = accounts.map(acc => {
            const isActive = acc.id === activeId;
            return `
                <div class="account-item ${isActive ? 'active' : ''}" data-id="${acc.id}">
                    <div class="account-info">
                        <span class="account-name">${SharedUtils.escapeHtml(acc.name || acc.fb_name || 'Unknown')}</span>
                        <span class="account-status">${isActive ? '✓ Active' : ''}</span>
                    </div>
                    <div class="account-actions">
                        ${!isActive ? `<button class="btn-select-account" onclick="SettingsManager.selectAccount('${acc.id}')">Chọn</button>` : ''}
                        <button class="btn-delete-account" onclick="SettingsManager.deleteAccount('${acc.id}')">Xóa</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function _handleAddAccount() {
        const tokenInput = document.getElementById('pancakeTokenInput');
        const token = tokenInput?.value?.trim();
        if (!token) {
            window.showNotification?.('Vui lòng nhập JWT token', 'error');
            return;
        }

        try {
            if (window.pancakeTokenManager?.addAccount) {
                await window.pancakeTokenManager.addAccount(token);
                tokenInput.value = '';
                _loadPancakeAccounts();
                window.showNotification?.('Đã thêm tài khoản thành công!', 'success');
                window.eventBus?.emit('layout:settingsChanged', { key: 'pancake_account_added' });
            }
        } catch (error) {
            window.showNotification?.('Token không hợp lệ: ' + error.message, 'error');
        }
    }

    function selectAccount(accountId) {
        if (window.pancakeTokenManager?.setActiveAccount) {
            window.pancakeTokenManager.setActiveAccount(accountId);
            _loadPancakeAccounts();
            window.showNotification?.('Đã chuyển tài khoản!', 'success');
            window.eventBus?.emit('layout:settingsChanged', { key: 'pancake_account_changed', value: accountId });
        }
    }

    function deleteAccount(accountId) {
        if (!confirm('Bạn có chắc muốn xóa tài khoản này?')) return;
        if (window.pancakeTokenManager?.deleteAccount) {
            window.pancakeTokenManager.deleteAccount(accountId);
            _loadPancakeAccounts();
            window.showNotification?.('Đã xóa tài khoản!', 'info');
        }
    }

    // ---- Modal close on outside click ----

    function _initModalCloseOnOutside() {
        document.addEventListener('click', (e) => {
            const modals = document.querySelectorAll('.settings-modal');
            modals.forEach(modal => {
                if (modal.style.display === 'flex' && e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    // ---- Init ----

    function initialize() {
        _initTposSettings();
        _initPancakeSettings();
        _initModalCloseOnOutside();
    }

    return {
        initialize,
        selectAccount,
        deleteAccount
    };
})();

// Export
if (typeof window !== 'undefined') {
    window.SettingsManager = SettingsManager;
}
