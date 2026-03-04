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
            groupList: document.getElementById('groupList'),
            assignSection: document.getElementById('assignSection'),
            assignLabelList: document.getElementById('assignLabelList'),
            statTotal: document.getElementById('statTotal'),
            statProcessing: document.getElementById('statProcessing'),
            statWaiting: document.getElementById('statWaiting'),
            statUrgent: document.getElementById('statUrgent'),
        };
    }

    /**
     * Initialize the chat controller
     */
    init() {
        this.bindEvents();
        this.renderConversationList();
        this.renderGroups();
        this.updateStats();
    }

    /**
     * Bind all event listeners
     */
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
            this.renderGroups();
            this.updateStats();
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
                const panel = document.getElementById('infoPanel');
                panel.classList.toggle('hidden');
                panel.classList.toggle('force-show');
            });
        }

        // Add group button
        const btnAddGroup = document.getElementById('btnAddGroup');
        if (btnAddGroup) {
            btnAddGroup.addEventListener('click', () => this.showAddGroupModal());
        }
    }

    /**
     * Render conversation list
     */
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

    /**
     * Select a conversation and display messages
     */
    selectConversation(convId) {
        this.activeConversationId = convId;
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        // Mark as read
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

        // Update star button
        this.updateStarButton(conv.starred);

        // Render messages
        this.renderMessages(conv);

        // Update assign section
        this.renderAssignLabels(conv);

        // Update conversation list to reflect active state
        this.renderConversationList();

        // Update stats
        this.updateStats();

        // Auto-fill order form with customer info
        if (window.inboxOrders) {
            window.inboxOrders.fillCustomerInfo(conv);
        }
    }

    /**
     * Render messages for a conversation
     */
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

        // Scroll to bottom
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    /**
     * Send a message
     */
    sendMessage() {
        if (!this.activeConversationId) return;

        const text = this.elements.chatInput.value.trim();
        if (!text) return;

        this.data.addMessage(this.activeConversationId, text, 'shop');

        // Clear input
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';

        // Re-render
        const conv = this.data.getConversation(this.activeConversationId);
        this.renderMessages(conv);
        this.renderConversationList();
    }

    /**
     * Render group labels in the stats tab
     */
    renderGroups() {
        this.elements.groupList.innerHTML = this.data.groups.map(group => `
            <div class="group-item ${this.currentGroupFilter === group.id ? 'active' : ''}"
                 data-group="${group.id}" onclick="window.inboxChat.filterByGroup('${group.id}')">
                <div class="group-color-dot" style="background: ${group.color}"></div>
                <span class="group-name">${this.escapeHtml(group.name)}</span>
                <span class="group-count">${group.count}</span>
            </div>
        `).join('');
    }

    /**
     * Filter conversations by group
     */
    filterByGroup(groupId) {
        if (this.currentGroupFilter === groupId) {
            this.currentGroupFilter = null;
        } else {
            this.currentGroupFilter = groupId;
        }
        this.renderConversationList();
        this.renderGroups();
    }

    /**
     * Render assign label options for current conversation
     */
    renderAssignLabels(conv) {
        this.elements.assignSection.style.display = 'block';
        this.elements.assignLabelList.innerHTML = this.data.groups.map(group => `
            <button class="assign-label-btn ${conv.label === group.id ? 'active' : ''}"
                    onclick="window.inboxChat.assignLabel('${conv.id}', '${group.id}')">
                <div class="group-color-dot" style="background: ${group.color}; width: 8px; height: 8px;"></div>
                ${this.escapeHtml(group.name)}
            </button>
        `).join('');
    }

    /**
     * Assign a label to a conversation
     */
    assignLabel(convId, labelId) {
        this.data.setConversationLabel(convId, labelId);
        this.renderConversationList();
        this.renderGroups();
        this.updateStats();
        const conv = this.data.getConversation(convId);
        if (conv) this.renderAssignLabels(conv);
        showToast('Đã cập nhật nhãn', 'success');
    }

    /**
     * Update stats display
     */
    updateStats() {
        const stats = this.data.getStats();
        this.elements.statTotal.textContent = stats.total;
        this.elements.statProcessing.textContent = stats.processing;
        this.elements.statWaiting.textContent = stats.waiting;
        this.elements.statUrgent.textContent = stats.urgent;
    }

    /**
     * Update star button visual
     */
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

    /**
     * Show modal to add a new group
     */
    showAddGroupModal() {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-title">Thêm Nhóm Mới</div>
                <div class="modal-field">
                    <label>Tên nhóm</label>
                    <input type="text" id="modalGroupName" placeholder="Nhập tên nhóm..." autofocus />
                </div>
                <div class="modal-field">
                    <label>Màu sắc</label>
                    <div class="color-picker-row">
                        ${colors.map((c, i) => `
                            <div class="color-option ${i === 0 ? 'selected' : ''}"
                                 style="background: ${c}" data-color="${c}"
                                 onclick="document.querySelectorAll('.color-option').forEach(o=>o.classList.remove('selected'));this.classList.add('selected');">
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-modal-cancel" onclick="this.closest('.modal-overlay').remove()">Hủy</button>
                    <button class="btn-modal-confirm" id="btnConfirmAddGroup">Thêm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.getElementById('btnConfirmAddGroup').addEventListener('click', () => {
            const name = document.getElementById('modalGroupName').value.trim();
            const color = document.querySelector('.color-option.selected')?.dataset.color || '#3b82f6';

            if (!name) {
                showToast('Vui lòng nhập tên nhóm', 'warning');
                return;
            }

            this.data.addGroup(name, color);
            this.renderGroups();
            overlay.remove();
            showToast('Đã thêm nhóm: ' + name, 'success');
        });
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
