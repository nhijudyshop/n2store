// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE PAGE SELECTOR - Page dropdown selector
// =====================================================

const PancakePageSelector = {

    async loadPages() {
        try {
            const state = window.PancakeState;
            state.pages = await window.PancakeAPI.fetchPages(false) || [];
            state.pagesWithUnread = await window.PancakeAPI.fetchPagesWithUnreadCount() || [];
            state.loadSelectedPage();
            this.renderPageSelector(state.pages);
            this.updateSelectedDisplay();
        } catch (error) {
            console.error('[PK-PAGE] Error loading pages:', error);
        }
    },

    renderPageSelector(pages) {
        const container = document.getElementById('pkPageList');
        if (!container) return;
        const state = window.PancakeState;
        const { escapeHtml } = window.SharedUtils;
        const totalUnread = state.pagesWithUnread.reduce((s, p) => s + (p.unread_conv_count || 0), 0);

        let html = '<div class="pk-page-item all-pages ' + (!state.selectedPageId ? 'active' : '') + '" data-page-id="">' +
            '<div class="pk-all-pages-icon"><i data-lucide="layout-grid"></i></div>' +
            '<div class="pk-page-info"><div class="pk-page-name">Tất cả Pages</div><div class="pk-page-hint">' + pages.length + ' pages</div></div>' +
            (totalUnread > 0 ? '<span class="pk-page-unread-badge">' + totalUnread + '</span>' : '') + '</div>';

        for (const page of pages) {
            const pageId = page.id;
            const pageName = page.name || page.page_name || 'Page';
            const isActive = state.selectedPageId === pageId;
            const pu = state.pagesWithUnread.find(p => p.page_id === pageId || p.page_id === page.fb_page_id || p.page_id === page.page_id);
            const uc = pu ? pu.unread_conv_count || 0 : 0;
            const avatarUrl = page.avatar || (page.picture && page.picture.data ? page.picture.data.url : null);
            const avatarHtml = avatarUrl
                ? '<img src="' + avatarUrl + '" class="pk-page-avatar" alt="' + escapeHtml(pageName) + '">'
                : '<div class="pk-page-avatar-placeholder">' + pageName.charAt(0).toUpperCase() + '</div>';

            html += '<div class="pk-page-item ' + (isActive ? 'active' : '') + '" data-page-id="' + pageId + '">' +
                avatarHtml +
                '<div class="pk-page-info"><div class="pk-page-name">' + escapeHtml(pageName) + '</div>' +
                '<div class="pk-page-hint">ID: ' + (page.fb_page_id || pageId) + '</div></div>' +
                (uc > 0 ? '<span class="pk-page-unread-badge">' + uc + '</span>' : '') + '</div>';
        }
        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    selectPage(pageId) {
        const state = window.PancakeState;
        state.selectedPageId = pageId || null;
        state.isPageDropdownOpen = false;
        state.saveSelectedPage();
        this.updateSelectedDisplay();
        this.renderPageSelector(state.pages);
        var dropdown = document.getElementById('pkPageDropdown');
        var btn = document.getElementById('pkPageSelectorBtn');
        if (dropdown) dropdown.classList.remove('show');
        if (btn) btn.classList.remove('active');
        window.PancakeConversationList.renderConversationList();
    },

    toggleDropdown() {
        var state = window.PancakeState;
        state.isPageDropdownOpen = !state.isPageDropdownOpen;
        var dropdown = document.getElementById('pkPageDropdown');
        var btn = document.getElementById('pkPageSelectorBtn');
        if (dropdown) dropdown.classList.toggle('show', state.isPageDropdownOpen);
        if (btn) btn.classList.toggle('active', state.isPageDropdownOpen);
    },

    updateSelectedDisplay() {
        var state = window.PancakeState;
        var nameEl = document.getElementById('pkSelectedPageName');
        var hintEl = document.getElementById('pkSelectedPageHint');
        var avatarEl = document.getElementById('pkSelectedPageAvatar');
        var badgeEl = document.getElementById('pkTotalUnreadBadge');
        if (!nameEl) return;

        if (state.selectedPageId) {
            var page = state.pages.find(function(p) { return p.id === state.selectedPageId; });
            if (page) {
                nameEl.textContent = page.name || page.page_name || 'Page';
                hintEl.textContent = 'ID: ' + (page.fb_page_id || page.id);
                var avatarUrl = page.avatar || (page.picture && page.picture.data ? page.picture.data.url : null);
                if (avatarUrl) {
                    avatarEl.innerHTML = '<img src="' + avatarUrl + '" class="pk-page-avatar" style="width:32px;height:32px;" alt="">';
                } else {
                    avatarEl.innerHTML = (page.name || 'P').charAt(0).toUpperCase();
                    avatarEl.className = 'pk-page-avatar-placeholder';
                }
                var pu = state.pagesWithUnread.find(function(p) { return p.page_id === state.selectedPageId || p.page_id === page.fb_page_id; });
                var uc = pu ? pu.unread_conv_count || 0 : 0;
                badgeEl.textContent = uc;
                badgeEl.style.display = uc > 0 ? 'flex' : 'none';
            }
        } else {
            nameEl.textContent = 'Tất cả Pages';
            hintEl.textContent = state.pages.length + ' pages';
            avatarEl.innerHTML = '<i data-lucide="layout-grid"></i>';
            avatarEl.className = 'pk-page-avatar-placeholder';
            var total = state.pagesWithUnread.reduce(function(s, p) { return s + (p.unread_conv_count || 0); }, 0);
            badgeEl.textContent = total;
            badgeEl.style.display = total > 0 ? 'flex' : 'none';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    },

    async updateUnreadCounts() {
        var state = window.PancakeState;
        state.pagesWithUnread = await window.PancakeAPI.fetchPagesWithUnreadCount() || [];
        this.updateSelectedDisplay();
    }
};

if (typeof window !== 'undefined') {
    window.PancakePageSelector = PancakePageSelector;
}
