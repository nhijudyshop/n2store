// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE CONTEXT MENU - Right-click context menu
// =====================================================

const PancakeContextMenu = {
    _convId: null,
    _pageId: null,

    show(e, convId, pageId) {
        this._convId = convId;
        this._pageId = pageId;
        var menu = document.getElementById('pkContextMenu');
        if (!menu) return;
        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        var state = window.PancakeState;
        var divider = menu.querySelector('.pk-tpos-saved-divider');
        var action = menu.querySelector('.pk-tpos-saved-action');
        if (divider && action) {
            var show = state.activeFilter === 'tpos-saved';
            divider.style.display = show ? 'block' : 'none';
            action.style.display = show ? 'flex' : 'none';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    hide() {
        var menu = document.getElementById('pkContextMenu');
        if (menu) menu.style.display = 'none';
        var tagsMenu = document.getElementById('pkTagsMenu');
        if (tagsMenu) tagsMenu.style.display = 'none';
    },

    async handleAction(action) {
        var convId = this._convId;
        var pageId = this._pageId;
        if (!convId || !pageId) return;
        var state = window.PancakeState;

        try {
            if (action === 'mark-unread') {
                await window.PancakeAPI.markAsUnread(pageId, convId);
                var conv = state.conversations.find(function(c) { return c.id === convId; });
                if (conv) { conv.seen = false; conv.unread_count = conv.unread_count || 1; }
                window.PancakeConversationList.renderConversationList();
            } else if (action === 'mark-read') {
                await window.PancakeAPI.markAsRead(pageId, convId);
                var conv2 = state.conversations.find(function(c) { return c.id === convId; });
                if (conv2) { conv2.seen = true; conv2.unread_count = 0; }
                window.PancakeConversationList.renderConversationList();
            } else if (action === 'add-note') {
                var note = prompt('Nhập ghi chú cho khách hàng:');
                if (note && note.trim()) {
                    var conv3 = state.conversations.find(function(c) { return c.id === convId; });
                    var customerId = conv3 && conv3.customers && conv3.customers[0] ? conv3.customers[0].id : null;
                    if (customerId) {
                        var ok = await window.PancakeAPI.addCustomerNote(pageId, customerId, note.trim());
                        alert(ok ? 'Đã thêm ghi chú thành công!' : 'Lỗi thêm ghi chú');
                    } else {
                        alert('Không tìm thấy thông tin khách hàng');
                    }
                }
            } else if (action === 'manage-tags') {
                await this.renderTagSubmenu(pageId, convId);
                return;
            } else if (action === 'remove-tpos-saved') {
                var conv4 = state.conversations.find(function(c) { return c.id === convId; });
                var customer = (conv4 && conv4.customers && conv4.customers[0]) ? conv4.customers[0] : {};
                var custId = (conv4 && conv4.from ? conv4.from.id : null) || (conv4 ? conv4.from_psid : null) || customer.psid || customer.id;
                if (custId) window.PancakeConversationList.removeFromTposSaved(custId);
            }
        } catch (error) {
            console.error('[PK-CTX] Action error:', error);
        }
        this.hide();
    },

    async renderTagSubmenu(pageId, convId) {
        var tagsMenu = document.getElementById('pkTagsMenu');
        var tagsList = document.getElementById('pkTagsList');
        var contextMenu = document.getElementById('pkContextMenu');
        if (!tagsMenu || !tagsList || !contextMenu) return;

        var rect = contextMenu.getBoundingClientRect();
        tagsMenu.style.display = 'block';
        tagsMenu.style.left = (rect.right + 5) + 'px';
        tagsMenu.style.top = rect.top + 'px';
        tagsList.innerHTML = '<div class="pk-loading-spinner" style="width:20px;height:20px;margin:10px auto;"></div>';

        var tags = await window.PancakeAPI.fetchTags(pageId);
        var conv = window.PancakeState.conversations.find(function(c) { return c.id === convId; });
        var convTags = (conv && conv.tags) ? conv.tags : [];
        var escapeHtml = window.SharedUtils.escapeHtml;

        if (tags.length === 0) {
            tagsList.innerHTML = '<div class="pk-no-tags">Không có nhãn</div>';
            return;
        }

        tagsList.innerHTML = tags.map(function(tag) {
            var isActive = convTags.includes(tag.id) || convTags.includes(String(tag.id));
            return '<button class="pk-tag-item ' + (isActive ? 'active' : '') + '" data-tag-id="' + tag.id + '" style="--tag-color: ' + tag.color + '">' +
                '<span class="pk-tag-dot" style="background:' + tag.color + '"></span>' +
                '<span>' + escapeHtml(tag.text) + '</span>' +
                (isActive ? '<i data-lucide="check" style="width:14px;height:14px;"></i>' : '') +
                '</button>';
        }).join('');

        tagsList.querySelectorAll('.pk-tag-item').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var tagId = btn.dataset.tagId;
                var isActive = btn.classList.contains('active');
                var act = isActive ? 'remove' : 'add';
                var ok = await window.PancakeAPI.addRemoveTag(pageId, convId, tagId, act);
                if (ok) {
                    btn.classList.toggle('active');
                    if (conv) {
                        if (act === 'add') conv.tags = (conv.tags || []).concat([tagId]);
                        else conv.tags = (conv.tags || []).filter(function(t) { return t !== tagId && t !== String(tagId); });
                        window.PancakeConversationList.renderConversationList();
                    }
                }
            });
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

if (typeof window !== 'undefined') {
    window.PancakeContextMenu = PancakeContextMenu;
}
