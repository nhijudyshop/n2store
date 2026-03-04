/* =====================================================
   INBOX CHAT - Chat UI Controller
   ===================================================== */

class InboxChatController {
    constructor(dataManager) {
        this.data = dataManager;
        this.activeConversationId = null;
        this.currentFilter = 'all';
        this.currentGroupFilter = null;
        this.searchQuery = '';

        this.elements = {
            conversationList: document.getElementById('conversationList'),
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            chatUserName: document.getElementById('chatUserName'),
            chatUserStatus: document.getElementById('chatUserStatus'),
            chatHeader: document.getElementById('chatHeader'),
            searchInput: document.getElementById('searchConversation'),
            btnSend: document.getElementById('btnSend'),
            btnStarConversation: document.getElementById('btnStarConversation'),
            btnRefreshInbox: document.getElementById('btnRefreshInbox'),
            chatLabelBar: document.getElementById('chatLabelBar'),
            chatLabelBarList: document.getElementById('chatLabelBarList'),
            groupStatsList: document.getElementById('groupStatsList'),
        };
    }

    init() {
        this.bindEvents();
        this.renderConversationList();
        this.renderGroupStats();
    }

    bindEvents() {
        // Search
        this.elements.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.renderConversationList();
        });

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentFilter = tab.dataset.filter;
                this.renderConversationList();
            });
        });

        // Send message
        this.elements.btnSend.addEventListener('click', () => this.sendMessage());
        this.elements.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.chatInput.addEventListener('input', () => {
            const el = this.elements.chatInput;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        });

        // Star conversation
        this.elements.btnStarConversation.addEventListener('click', () => {
            if (this.activeConversationId) {
                const starred = this.data.toggleStar(this.activeConversationId);
                this.updateStarButton(starred);
                this.renderConversationList();
            }
        });

        // Refresh
        this.elements.btnRefreshInbox.addEventListener('click', () => {
            this.data.init();
            this.renderConversationList();
            this.renderGroupStats();
            showToast('Đã làm mới dữ liệu', 'success');
        });

        // Info panel tabs
        document.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById(tab.dataset.tab === 'stats' ? 'tabStats' : 'tabOrders');
                if (target) target.classList.add('active');
            });
        });

        // Toggle right panel
        const btnToggle = document.getElementById('btnToggleRightPanel');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                const panel = document.getElementById('col3');
                panel.classList.toggle('hidden');
                panel.classList.toggle('force-show');
            });
        }

        // Manage groups button
        const btnManageGroups = document.getElementById('btnManageGroups');
        if (btnManageGroups) {
            btnManageGroups.addEventListener('click', () => this.showManageGroupsModal());
        }
    }

    // ===== Conversation List =====

    renderConversationList() {
        const conversations = this.data.getConversations({
            search: this.searchQuery,
            filter: this.currentFilter,
            groupFilter: this.currentGroupFilter,
        });

        if (conversations.length === 0) {
            this.elements.conversationList.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                    <p>Không có cuộc hội thoại nào</p>
                </div>
            `;
            return;
        }

        this.elements.conversationList.innerHTML = conversations.map(conv => {
            const avatarBg = 'bg-' + ((conv.name.charCodeAt(0) % 8) + 1);
            const initials = conv.name.split(' ').map(w => w[0]).slice(-2).join('');
            const labelClass = this.getLabelClass(conv.label);
            const labelText = this.getLabelText(conv.label);
            const isActive = conv.id === this.activeConversationId;
            const isUnread = conv.unread > 0;

            return `
                <div class="conversation-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}"
                     data-id="${conv.id}" onclick="window.inboxChat.selectConversation('${conv.id}')">
                    <div class="conv-avatar ${avatarBg}">
                        ${initials}
                        ${conv.online ? '<div class="conv-online-dot"></div>' : ''}
                    </div>
                    <div class="conv-content">
                        <div class="conv-header">
                            <span class="conv-name">${this.escapeHtml(conv.name)}</span>
                            <span class="conv-time">${this.formatTime(conv.time)}</span>
                        </div>
                        <div class="conv-preview">${this.escapeHtml(conv.lastMessage)}</div>
                        <div class="conv-footer">
                            <span class="conv-label ${labelClass}">${labelText}</span>
                            ${isUnread ? `<span class="conv-unread-badge">${conv.unread}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== Select Conversation =====

    selectConversation(convId) {
        this.activeConversationId = convId;
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        this.data.markAsRead(convId);

        // Update header
        this.elements.chatUserName.textContent = conv.name;
        this.elements.chatUserStatus.textContent = conv.online ? 'Đang hoạt động' : 'Ngoại tuyến';

        // Update chat avatar
        const chatAvatar = this.elements.chatHeader.querySelector('.chat-avatar');
        const avatarBg = 'bg-' + ((conv.name.charCodeAt(0) % 8) + 1);
        const initials = conv.name.split(' ').map(w => w[0]).slice(-2).join('');
        chatAvatar.innerHTML = initials;
        chatAvatar.className = 'chat-avatar conv-avatar ' + avatarBg;
        chatAvatar.style.color = 'white';
        chatAvatar.style.fontSize = '0.875rem';
        chatAvatar.style.fontWeight = '700';

        this.updateStarButton(conv.starred);
        this.renderMessages(conv);
        this.renderChatLabelBar(conv);
        this.renderConversationList();
        this.renderGroupStats();

        // Auto-fill order form
        if (window.inboxOrders) {
            window.inboxOrders.fillCustomerInfo(conv);
        }
    }

    // ===== Chat Messages =====

    renderMessages(conv) {
        if (!conv.messages || conv.messages.length === 0) {
            this.elements.chatMessages.innerHTML = `
                <div class="chat-empty-state">
                    <i data-lucide="message-square"></i>
                    <p>Chưa có tin nhắn</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const avatarBg = 'bg-' + ((conv.name.charCodeAt(0) % 8) + 1);
        const initials = conv.name.split(' ').map(w => w[0]).slice(-2).join('');
        let lastDate = '';

        const html = conv.messages.map(msg => {
            const msgDate = this.formatDate(msg.time);
            let dateSeparator = '';
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                dateSeparator = `
                    <div class="chat-date-separator">
                        <span>${msgDate}</span>
                    </div>
                `;
            }

            const isOutgoing = msg.sender === 'shop';
            return `
                ${dateSeparator}
                <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'}">
                    ${!isOutgoing ? `<div class="message-avatar conv-avatar ${avatarBg}">${initials}</div>` : ''}
                    <div class="message-bubble">
                        <div class="message-text">${this.escapeHtml(msg.text)}</div>
                        <div class="message-time">${this.formatMessageTime(msg.time)}</div>
                    </div>
                </div>
            `;
        }).join('');

        this.elements.chatMessages.innerHTML = html;
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    sendMessage() {
        if (!this.activeConversationId) return;

        const text = this.elements.chatInput.value.trim();
        if (!text) return;

        this.data.addMessage(this.activeConversationId, text, 'shop');
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';

        const conv = this.data.getConversation(this.activeConversationId);
        this.renderMessages(conv);
        this.renderConversationList();
    }

    // ===== Chat Label Bar (inside chat column) =====

    renderChatLabelBar(conv) {
        this.elements.chatLabelBar.style.display = 'block';
        this.elements.chatLabelBarList.innerHTML = this.data.groups.map(group => {
            const isActive = conv.label === group.id;
            const activeStyle = isActive ? `background: ${group.color}; border-color: ${group.color};` : '';
            return `
                <button class="chat-label-btn ${isActive ? 'active' : ''}"
                        style="${activeStyle}"
                        onclick="window.inboxChat.assignLabel('${conv.id}', '${group.id}')">
                    <span class="chat-label-dot" style="background: ${isActive ? 'rgba(255,255,255,0.7)' : group.color}"></span>
                    ${this.escapeHtml(group.name)}
                </button>
            `;
        }).join('');
    }

    assignLabel(convId, labelId) {
        this.data.setConversationLabel(convId, labelId);
        this.renderConversationList();
        this.renderGroupStats();
        const conv = this.data.getConversation(convId);
        if (conv) this.renderChatLabelBar(conv);
        showToast('Đã cập nhật nhãn', 'success');
    }

    // ===== Group Stats Cards (Column 3) =====

    renderGroupStats() {
        this.data.recalculateGroupCounts();

        // Icon map for default groups
        const iconMap = {
            'new': 'inbox',
            'processing': 'loader',
            'waiting': 'clock',
            'ordered': 'shopping-cart',
            'urgent': 'alert-triangle',
            'done': 'check-circle',
        };

        this.elements.groupStatsList.innerHTML = this.data.groups.map(group => {
            const icon = iconMap[group.id] || 'tag';
            const isActive = this.currentGroupFilter === group.id;
            const note = group.note || 'Chưa có mô tả cho nhóm này.';

            return `
                <div class="group-stats-card ${isActive ? 'active' : ''}"
                     onclick="window.inboxChat.filterByGroup('${group.id}')">
                    <div class="group-stats-card-color" style="background: ${group.color}">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="group-stats-card-body">
                        <div class="group-stats-card-name">${this.escapeHtml(group.name)}</div>
                        <div class="group-stats-card-count">
                            <strong>${group.count}</strong> khách hàng
                        </div>
                    </div>
                    <button class="group-stats-card-help" onclick="event.stopPropagation()" title="Thông tin">
                        ?
                        <div class="stats-tooltip">${this.escapeHtml(note)}</div>
                    </button>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    filterByGroup(groupId) {
        if (this.currentGroupFilter === groupId) {
            this.currentGroupFilter = null;
        } else {
            this.currentGroupFilter = groupId;
        }
        this.renderConversationList();
        this.renderGroupStats();
    }

    // ===== Star =====

    updateStarButton(starred) {
        const btn = this.elements.btnStarConversation;
        if (starred) {
            btn.style.color = '#f59e0b';
            btn.title = 'Bỏ đánh dấu';
        } else {
            btn.style.color = '';
            btn.title = 'Đánh dấu';
        }
    }

    // ===== Manage Groups Modal =====

    showManageGroupsModal() {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-title">
                    <i data-lucide="settings"></i>
                    Quản Lý Nhóm
                </div>

                <div class="modal-body">
                    <!-- Existing groups -->
                    <div class="modal-group-list" id="modalGroupList">
                        ${this.data.groups.map((group, idx) => `
                            <div class="modal-group-item" data-group-id="${group.id}">
                                <div class="modal-group-color-pick"
                                     style="background: ${group.color}"
                                     data-idx="${idx}"
                                     onclick="window.inboxChat._toggleColorPicker(this, '${group.id}')">
                                </div>
                                <div class="modal-group-fields">
                                    <input type="text" class="modal-group-name-input"
                                           value="${this.escapeHtml(group.name)}"
                                           placeholder="Tên nhóm" data-group-id="${group.id}" />
                                    <textarea class="modal-group-note-input"
                                              placeholder="Ghi chú (hiển thị ở tooltip ?)"
                                              data-group-id="${group.id}" rows="2">${this.escapeHtml(group.note || '')}</textarea>
                                </div>
                                <button class="modal-group-delete" title="Xóa nhóm"
                                        onclick="window.inboxChat._deleteGroupInModal('${group.id}', this)">
                                    &times;
                                </button>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Add new group -->
                    <div class="modal-add-section">
                        <h4>Thêm Nhóm Mới</h4>
                        <div class="modal-add-row">
                            <div class="modal-add-fields">
                                <input type="text" id="modalNewGroupName" placeholder="Tên nhóm mới..." />
                                <textarea id="modalNewGroupNote" placeholder="Ghi chú cho nhóm..." rows="2"></textarea>
                                <div class="modal-color-picker">
                                    ${colors.map((c, i) => `
                                        <div class="color-option ${i === 0 ? 'selected' : ''}"
                                             style="background: ${c}" data-color="${c}"
                                             onclick="this.parentElement.querySelectorAll('.color-option').forEach(o=>o.classList.remove('selected'));this.classList.add('selected');">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <button class="btn-modal-add" id="btnModalAddGroup">+ Thêm</button>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn-modal-cancel" id="btnModalCancel">Đóng</button>
                    <button class="btn-modal-confirm" id="btnModalSave">Lưu Thay Đổi</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Cancel
        document.getElementById('btnModalCancel').addEventListener('click', () => overlay.remove());

        // Add new group
        document.getElementById('btnModalAddGroup').addEventListener('click', () => {
            const name = document.getElementById('modalNewGroupName').value.trim();
            const note = document.getElementById('modalNewGroupNote').value.trim();
            const color = overlay.querySelector('.modal-add-section .color-option.selected')?.dataset.color || '#3b82f6';

            if (!name) {
                showToast('Vui lòng nhập tên nhóm', 'warning');
                return;
            }

            this.data.addGroup(name, color, note);

            // Add to the list in modal
            const listEl = document.getElementById('modalGroupList');
            const newGroup = this.data.groups[this.data.groups.length - 1];
            const newItem = document.createElement('div');
            newItem.className = 'modal-group-item';
            newItem.dataset.groupId = newGroup.id;
            newItem.innerHTML = `
                <div class="modal-group-color-pick"
                     style="background: ${newGroup.color}"
                     onclick="window.inboxChat._toggleColorPicker(this, '${newGroup.id}')">
                </div>
                <div class="modal-group-fields">
                    <input type="text" class="modal-group-name-input"
                           value="${this.escapeHtml(newGroup.name)}"
                           placeholder="Tên nhóm" data-group-id="${newGroup.id}" />
                    <textarea class="modal-group-note-input"
                              placeholder="Ghi chú (hiển thị ở tooltip ?)"
                              data-group-id="${newGroup.id}" rows="2">${this.escapeHtml(newGroup.note || '')}</textarea>
                </div>
                <button class="modal-group-delete" title="Xóa nhóm"
                        onclick="window.inboxChat._deleteGroupInModal('${newGroup.id}', this)">
                    &times;
                </button>
            `;
            listEl.appendChild(newItem);

            // Clear inputs
            document.getElementById('modalNewGroupName').value = '';
            document.getElementById('modalNewGroupNote').value = '';

            showToast('Đã thêm nhóm: ' + name, 'success');
        });

        // Save all edits
        document.getElementById('btnModalSave').addEventListener('click', () => {
            // Save name and note edits
            overlay.querySelectorAll('.modal-group-item').forEach(item => {
                const groupId = item.dataset.groupId;
                const nameInput = item.querySelector('.modal-group-name-input');
                const noteInput = item.querySelector('.modal-group-note-input');
                if (nameInput && noteInput) {
                    this.data.updateGroup(groupId, {
                        name: nameInput.value.trim(),
                        note: noteInput.value.trim(),
                    });
                }
            });

            this.renderGroupStats();
            this.renderConversationList();
            if (this.activeConversationId) {
                const conv = this.data.getConversation(this.activeConversationId);
                if (conv) this.renderChatLabelBar(conv);
            }

            overlay.remove();
            showToast('Đã lưu thay đổi nhóm', 'success');
        });
    }

    _deleteGroupInModal(groupId, btnEl) {
        if (!confirm('Xóa nhóm này? Các cuộc hội thoại sẽ chuyển về "Inbox Mới".')) return;
        this.data.deleteGroup(groupId);
        const item = btnEl.closest('.modal-group-item');
        if (item) item.remove();
        showToast('Đã xóa nhóm', 'success');
    }

    _toggleColorPicker(el, groupId) {
        // Remove existing popover
        const existing = el.parentElement.querySelector('.color-popover');
        if (existing) { existing.remove(); return; }

        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];
        const popover = document.createElement('div');
        popover.className = 'color-popover';
        popover.innerHTML = colors.map(c => `
            <div class="color-option" style="background: ${c}" data-color="${c}"></div>
        `).join('');

        el.style.position = 'relative';
        el.appendChild(popover);

        popover.addEventListener('click', (e) => {
            const opt = e.target.closest('.color-option');
            if (!opt) return;
            const newColor = opt.dataset.color;
            el.style.background = newColor;
            this.data.updateGroup(groupId, { color: newColor });
            popover.remove();
            e.stopPropagation();
        });

        // Close on outside click
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && e.target !== el) {
                    popover.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    }

    // ===== Utility Methods =====

    getLabelClass(label) {
        const map = {
            'new': 'label-new',
            'processing': 'label-processing',
            'waiting': 'label-waiting',
            'ordered': 'label-done',
            'urgent': 'label-urgent',
            'done': 'label-done',
        };
        return map[label] || 'label-new';
    }

    getLabelText(label) {
        const group = this.data.groups.find(g => g.id === label);
        if (group) return group.name;
        const map = {
            'new': 'Mới',
            'processing': 'Đang XL',
            'waiting': 'Chờ PH',
            'ordered': 'Đã Đặt',
            'urgent': 'Cần Gấp',
            'done': 'Xong',
        };
        return map[label] || label;
    }

    formatTime(date) {
        if (!(date instanceof Date)) date = new Date(date);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' phút';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' giờ';
        if (diff < 172800000) return 'Hôm qua';

        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    formatDate(date) {
        if (!(date instanceof Date)) date = new Date(date);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = today - msgDay;

        if (diff === 0) return 'Hôm nay';
        if (diff === 86400000) return 'Hôm qua';
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    formatMessageTime(date) {
        if (!(date instanceof Date)) date = new Date(date);
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export globally
window.InboxChatController = InboxChatController;
