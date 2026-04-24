// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale Comment List — renders the comment feed UI in the left column.
 *
 * Phase 1 implementation: minimal skeleton that renders the page/session
 * selectors in the top bar and a placeholder empty state inside the content
 * container. Pancake column keeps working because LiveSaleInit emits the
 * expected `tpos:commentSelected` events when a comment is clicked.
 */

const LiveSaleCommentList = {
    /** Render the top-bar selectors + content container. */
    renderContainer() {
        const state = window.LiveSaleState;
        const topbar = document.getElementById('topbarTposSelectors');
        if (topbar) {
            topbar.innerHTML = `
                <select id="tposCrmTeamSelect" class="ls-select" style="flex:1;min-width:0;">
                    <option value="">— Chọn page —</option>
                </select>
                <select id="tposLiveCampaignSelect" class="ls-select" style="flex:1;min-width:0;">
                    <option value="">— Chọn live —</option>
                </select>
            `;
            const pageSel = topbar.querySelector('#tposCrmTeamSelect');
            const camSel = topbar.querySelector('#tposLiveCampaignSelect');
            pageSel?.addEventListener('change', (e) => {
                window.eventBus?.emit('tpos:crmTeamChanged', e.target.value);
            });
            camSel?.addEventListener('change', (e) => {
                const v = e.target.value;
                window.eventBus?.emit('tpos:liveCampaignChanged', v);
            });
        }

        const host = document.getElementById(state?.containerId || 'tposContent');
        if (host) {
            host.innerHTML = `
                <div class="ls-comment-feed" id="lsCommentFeed">
                    <div class="ls-empty-state">
                        <i data-lucide="shopping-cart" style="width:48px;height:48px;opacity:0.25;"></i>
                        <p>Chọn page và live để bắt đầu.</p>
                        <small style="color:var(--gray-500)">LiveSale (web-native) — phase 1 foundation</small>
                    </div>
                </div>
            `;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    },

    renderCrmTeamOptions() {
        const sel = document.getElementById('tposCrmTeamSelect');
        if (!sel) return;
        const state = window.LiveSaleState;
        const pages = state?.allPages || [];
        const saved = state?.getSavedPageSelection?.() || '';

        const opts = ['<option value="">— Chọn page —</option>'];
        if (pages.length > 1) opts.push('<option value="all">Tất cả Pages</option>');
        for (const p of pages) {
            const val = `0:${p.id || p.fb_page_id}`;
            opts.push(`<option value="${val}">${escapeForAttr(p.name || p.fb_page_id)}</option>`);
        }
        sel.innerHTML = opts.join('');
        if (saved) sel.value = saved;
    },

    renderLiveCampaignOptions() {
        const sel = document.getElementById('tposLiveCampaignSelect');
        if (!sel) return;
        const state = window.LiveSaleState;
        const list = state?.liveCampaigns || [];
        const opts = ['<option value="">— Chọn live —</option>'];
        for (const c of list) {
            opts.push(`<option value="${escapeForAttr(c.Id)}">${escapeForAttr(c.Name)}</option>`);
        }
        sel.innerHTML = opts.join('');
    },

    showLoading() {
        const host = document.getElementById('lsCommentFeed');
        if (host) {
            host.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div><span>Đang tải bình luận...</span>
                </div>
            `;
        }
    },

    showError(msg) {
        const host = document.getElementById('lsCommentFeed');
        if (host) {
            host.innerHTML = `<div class="ls-error-state">Lỗi: ${escapeForAttr(msg || 'unknown')}</div>`;
        }
    },

    renderComments() {
        const host = document.getElementById('lsCommentFeed');
        if (!host) return;
        const state = window.LiveSaleState;
        const items = state?.comments || [];
        if (items.length === 0) {
            host.innerHTML = `
                <div class="ls-empty-state">
                    <i data-lucide="message-square" style="width:40px;height:40px;opacity:0.25;"></i>
                    <p>Chưa có bình luận.</p>
                </div>
            `;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        // Phase 1 minimal render — rich cards come in Phase 4.
        host.innerHTML = items
            .map((c) => this._renderCommentRow(c))
            .join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    _renderCommentRow(c) {
        const name = c.from?.name || 'Unknown';
        const msg = c.message || '';
        const time = c.created_time ? new Date(c.created_time).toLocaleTimeString('vi-VN') : '';
        const id = c.id || '';
        return `
            <div class="ls-comment-card" data-comment-id="${escapeForAttr(id)}" onclick="LiveSaleCommentList.selectComment('${escapeForAttr(id)}')">
                <div class="ls-comment-head">
                    <strong>${escapeForAttr(name)}</strong>
                    <span class="ls-comment-time">${escapeForAttr(time)}</span>
                </div>
                <div class="ls-comment-body">${escapeForAttr(msg)}</div>
            </div>
        `;
    },

    selectComment(commentId) {
        const state = window.LiveSaleState;
        const c = (state?.comments || []).find((x) => x.id === commentId);
        const userId = c?.from?.id;
        if (userId) {
            window.eventBus?.emit('tpos:commentSelected', { userId, commentId });
        }
    },

    updateConnectionStatus(connected /*, _mode */) {
        const dot = document.querySelector('#tposStatusIndicator .status-dot');
        const txt = document.querySelector('#tposStatusIndicator .status-text');
        if (dot) dot.classList.toggle('connected', !!connected);
        if (dot) dot.classList.toggle('disconnected', !connected);
        if (txt) txt.textContent = connected ? 'Live' : 'Offline';
    },

    updateLoadMoreIndicator() { /* no-op in Phase 1 */ },
    updateSavedBadges() { /* no-op in Phase 1 */ },
    updateDebtBadges() { /* no-op in Phase 1 */ },

    // ---- stubs for the backward-compat surface exposed by tpos-init --------
    toggleInlineStatusDropdown() {},
    selectInlineStatus() {},
    saveInlinePhone() {},
    saveInlineAddress() {},
    handleSaveToTpos() {},
    updateSaveButtonToCheckmark() {},
    setDebtDisplaySettings(showDebt, showZeroDebt) {
        const state = window.LiveSaleState;
        if (!state) return;
        state.showDebt = !!showDebt;
        state.showZeroDebt = !!showZeroDebt;
        try {
            localStorage.setItem('liveSaleSettings', JSON.stringify({ showDebt: state.showDebt, showZeroDebt: state.showZeroDebt }));
        } catch { /* noop */ }
        this.renderComments();
    },
};

function escapeForAttr(v) {
    if (v == null) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

if (typeof window !== 'undefined') {
    window.LiveSaleCommentList = LiveSaleCommentList;
    window.TposCommentList = window.TposCommentList || LiveSaleCommentList;
}
