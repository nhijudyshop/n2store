// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   INBOX PANCAKE FEATURES - Full Pancake functionality
   - Pancake Tags (gắn/gỡ tag)
   - Assignee Management (phân công nhân viên)
   - Notes CRUD (tạo/sửa/xóa ghi chú)
   - Pancake Quick Replies sync
   - Viewing Indicator (ai đang xem)
   - Bulk Actions (hành động hàng loạt)
   - Page Settings UI
   ===================================================== */

class InboxPancakeFeatures {
    constructor() {
        // Page settings cache: { pageId: { tags, quick_replies, quick_reply_types, users, warehouses, ... } }
        this.pageSettings = {};
        this.pageUsers = {};          // { pageId: User[] }
        this.viewingUsers = {};       // { convId: Set<userId> }
        this.bulkSelected = new Set(); // Selected conversation IDs for bulk actions
        this.isBulkMode = false;

        // References set by init()
        this.chat = null;
        this.data = null;
        this.api = null;
        this.tm = null;
    }

    init(chatController, dataManager) {
        this.chat = chatController;
        this.data = dataManager;
        this.api = window.inboxPancakeAPI;
        this.tm = window.inboxTokenManager;
        this._bindEvents();
        console.log('[PancakeFeatures] Initialized');
    }

    _bindEvents() {
        // Notes input Enter key
        const noteInput = document.getElementById('convNoteInput');
        if (noteInput) {
            noteInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.chat.addNote(noteInput);
                }
            });
        }

        // Bulk mode toggle via header
        const bulkBtn = document.getElementById('btnBulkMode');
        if (bulkBtn) {
            bulkBtn.addEventListener('click', () => this.toggleBulkMode());
        }
    }

    // =====================================================
    // PHASE 1: PANCAKE TAGS
    // =====================================================

    /**
     * Load page settings (tags, quick_replies, users, warehouses) for a page.
     * Cached per pageId. Call with forceRefresh=true to bypass cache.
     */
    async loadPageSettings(pageId, forceRefresh = false) {
        if (!forceRefresh && this.pageSettings[pageId]) {
            return this.pageSettings[pageId];
        }
        try {
            const token = await this.tm.getToken();
            if (!token) return null;

            // Find page username for Referer header
            const page = this.data.pages.find(p => String(p.id) === String(pageId));
            const username = page?.username || page?.name || '';

            const url = InboxApiConfig.buildUrl.pancake(
                `pages/${pageId}/settings`,
                `access_token=${token}`
            );
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Referer': `https://pancake.vn/${username}`
                }
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.success && !data.settings) return null;

            const settings = data.settings || data;
            this.pageSettings[pageId] = {
                tags: settings.tags || [],
                quick_replies: settings.quick_replies || [],
                quick_reply_types: settings.quick_reply_types || [],
                warehouses: data.warehouses || [],
                shop_id: data.shop_id || null,
                pinned_photos: data.pinned_photos || [],
                recent_photos: data.recent_photos || [],
                multi_tag: settings.multi_tag || false,
                page_access_token: settings.page_access_token || '',
                // Round robin & auto settings
                hard_round_robin: settings.hard_round_robin || false,
                auto_like: settings.auto_like || false,
                auto_hide_comment: settings.auto_hide_comment || false,
                auto_tagging: settings.auto_tagging || false,
                notification: settings.notification || false,
                unread_first: settings.unread_first || false,
                show_only_assigned_conv: settings.show_only_assigned_conv || false,
                _raw: settings
            };

            console.log(`[PancakeFeatures] Loaded settings for page ${pageId}: ${this.pageSettings[pageId].tags.length} tags, ${this.pageSettings[pageId].quick_replies.length} QRs`);
            return this.pageSettings[pageId];
        } catch (e) {
            console.error('[PancakeFeatures] loadPageSettings error:', e);
            return null;
        }
    }

    /**
     * Get tags for a specific page (from cache or fetch)
     */
    async getPageTags(pageId) {
        const settings = await this.loadPageSettings(pageId);
        return settings?.tags || [];
    }

    /**
     * Add tag to conversation via Pancake API
     */
    async addTagToConversation(pageId, conversationId, tagId) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) throw new Error('No page access token');

            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/tags`,
                pat
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_id: tagId })
            });
            const data = await res.json();
            if (data.success || res.ok) {
                // Update local conv tags
                this._updateConvTags(conversationId, tagId, 'add');
                return true;
            }
            console.warn('[PancakeFeatures] addTag failed:', data);
            return false;
        } catch (e) {
            console.error('[PancakeFeatures] addTag error:', e);
            return false;
        }
    }

    /**
     * Remove tag from conversation via Pancake API
     */
    async removeTagFromConversation(pageId, conversationId, tagId) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) throw new Error('No page access token');

            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/tags/${tagId}`,
                pat
            );
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                this._updateConvTags(conversationId, tagId, 'remove');
                return true;
            }
            return false;
        } catch (e) {
            console.error('[PancakeFeatures] removeTag error:', e);
            return false;
        }
    }

    /**
     * Toggle a Pancake tag on a conversation
     */
    async toggleTag(convId, tagId) {
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        const currentTags = conv._raw?.tags || [];
        const hasTag = currentTags.some(t => t.id === tagId || t === tagId);

        const btn = document.querySelector(`.pancake-tag-btn[data-tag-id="${tagId}"]`);
        if (btn) btn.classList.toggle('loading', true);

        let ok;
        if (hasTag) {
            ok = await this.removeTagFromConversation(conv.pageId, conv.conversationId || convId, tagId);
        } else {
            ok = await this.addTagToConversation(conv.pageId, conv.conversationId || convId, tagId);
        }

        if (btn) btn.classList.toggle('loading', false);

        if (ok) {
            showToast(hasTag ? 'Đã gỡ tag' : 'Đã gắn tag', 'success');
            this.renderPancakeTagBar(conv);
            this.chat.renderConversationList();
        } else {
            showToast('Lỗi cập nhật tag', 'error');
        }
    }

    _updateConvTags(convId, tagId, action) {
        const conv = this.data.getConversation(convId);
        if (!conv || !conv._raw) return;

        const tags = conv._raw.tags || [];
        const pageId = conv.pageId;
        const pageTags = this.pageSettings[pageId]?.tags || [];
        const tagObj = pageTags.find(t => t.id === tagId);

        if (action === 'add' && tagObj && !tags.some(t => t.id === tagId)) {
            conv._raw.tags = [...tags, tagObj];
        } else if (action === 'remove') {
            conv._raw.tags = tags.filter(t => t.id !== tagId);
        }
    }

    /**
     * Render Pancake tags bar for current conversation (below custom label bar)
     */
    renderPancakeTagBar(conv) {
        const container = document.getElementById('pancakeTagBar');
        if (!container) return;

        const pageId = conv.pageId;
        const pageTags = this.pageSettings[pageId]?.tags || [];
        const convTags = conv._raw?.tags || [];
        const convTagIds = new Set(convTags.map(t => t.id));

        if (pageTags.length === 0) {
            container.style.display = 'none';
            // Try loading tags async
            this.loadPageSettings(pageId).then(() => {
                const tags = this.pageSettings[pageId]?.tags;
                if (tags?.length > 0) this.renderPancakeTagBar(conv);
            });
            return;
        }

        container.innerHTML = `
            <div class="pancake-tag-bar-inner">
                <span class="pancake-tag-bar-title"><i data-lucide="tag"></i> Tags:</span>
                <div class="pancake-tag-bar-list">
                    ${pageTags.map(tag => {
                        const isActive = convTagIds.has(tag.id);
                        const bgColor = tag.color || '#6b7280';
                        const lighten = tag.lighten_color || `${bgColor}20`;
                        return `
                            <button class="pancake-tag-btn ${isActive ? 'active' : ''}"
                                    data-tag-id="${tag.id}"
                                    style="${isActive ? `background:${bgColor};color:white;` : `background:${lighten};color:${bgColor};border-color:${bgColor}30;`}"
                                    onclick="window.inboxFeatures.toggleTag('${conv.id}', ${tag.id})">
                                ${this._escapeHtml(tag.text || tag.name || '')}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        container.style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =====================================================
    // PHASE 2: ASSIGNEE MANAGEMENT
    // =====================================================

    /**
     * Load page users (staff list) for assignee management
     */
    async loadPageUsers(pageId, forceRefresh = false) {
        if (!forceRefresh && this.pageUsers[pageId]) {
            return this.pageUsers[pageId];
        }
        try {
            const token = await this.tm.getToken();
            if (!token) return [];
            const url = InboxApiConfig.buildUrl.pancake(
                `pages/${pageId}/users`,
                `access_token=${token}`
            );
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            const users = (data.users || []).filter(u => u.status_in_page === 'active');
            this.pageUsers[pageId] = users;
            console.log(`[PancakeFeatures] Loaded ${users.length} users for page ${pageId}`);
            return users;
        } catch (e) {
            console.error('[PancakeFeatures] loadPageUsers error:', e);
            return [];
        }
    }

    /**
     * Assign a staff member to a conversation
     */
    async assignConversation(pageId, conversationId, userId) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) throw new Error('No page access token');

            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/assign`,
                pat
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignee_id: userId })
            });
            return res.ok;
        } catch (e) {
            console.error('[PancakeFeatures] assignConversation error:', e);
            return false;
        }
    }

    /**
     * Unassign a staff member from a conversation
     */
    async unassignConversation(pageId, conversationId, userId) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) throw new Error('No page access token');

            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/conversations/${conversationId}/unassign`,
                pat
            );
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignee_id: userId })
            });
            return res.ok;
        } catch (e) {
            console.error('[PancakeFeatures] unassignConversation error:', e);
            return false;
        }
    }

    /**
     * Toggle assignee for conversation
     */
    async toggleAssignee(convId, userId) {
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        const assignees = conv._raw?.assignee_ids || [];
        const isAssigned = assignees.includes(userId);

        let ok;
        if (isAssigned) {
            ok = await this.unassignConversation(conv.pageId, conv.conversationId || convId, userId);
            if (ok) {
                conv._raw.assignee_ids = assignees.filter(id => id !== userId);
                showToast('Đã gỡ phân công', 'success');
            }
        } else {
            ok = await this.assignConversation(conv.pageId, conv.conversationId || convId, userId);
            if (ok) {
                conv._raw.assignee_ids = [...assignees, userId];
                showToast('Đã phân công', 'success');
            }
        }

        if (ok) {
            this.renderAssigneeSection(conv);
            this.chat.renderConversationList();
        } else {
            showToast('Lỗi phân công', 'error');
        }
    }

    /**
     * Render assignee section in info panel
     */
    renderAssigneeSection(conv) {
        const container = document.getElementById('assigneeSection');
        if (!container) return;

        const pageId = conv.pageId;
        const users = this.pageUsers[pageId] || [];
        const assigneeIds = new Set(conv._raw?.assignee_ids || []);

        if (users.length === 0) {
            container.style.display = 'none';
            this.loadPageUsers(pageId).then(loadedUsers => {
                if (loadedUsers.length > 0) this.renderAssigneeSection(conv);
            });
            return;
        }

        const assignedUsers = users.filter(u => assigneeIds.has(u.id));
        const unassignedUsers = users.filter(u => !assigneeIds.has(u.id));

        container.innerHTML = `
            <div class="assignee-header">
                <span><i data-lucide="users"></i> Phân công</span>
                <span class="assignee-count">${assignedUsers.length}/${users.length}</span>
            </div>
            <div class="assignee-list">
                ${assignedUsers.map(u => `
                    <div class="assignee-item assigned" onclick="window.inboxFeatures.toggleAssignee('${conv.id}','${u.id}')">
                        <div class="assignee-avatar">${(u.name || '?')[0].toUpperCase()}</div>
                        <span class="assignee-name">${this._escapeHtml(u.name)}</span>
                        <span class="assignee-role">${u.role_in_page === 'ADMINISTER' ? 'Admin' : 'Staff'}</span>
                        <i data-lucide="check-circle" class="assignee-check"></i>
                    </div>
                `).join('')}
                ${unassignedUsers.length > 0 ? `
                    <div class="assignee-divider"></div>
                    ${unassignedUsers.map(u => `
                        <div class="assignee-item" onclick="window.inboxFeatures.toggleAssignee('${conv.id}','${u.id}')">
                            <div class="assignee-avatar">${(u.name || '?')[0].toUpperCase()}</div>
                            <span class="assignee-name">${this._escapeHtml(u.name)}</span>
                            <span class="assignee-role">${u.role_in_page === 'ADMINISTER' ? 'Admin' : 'Staff'}</span>
                        </div>
                    `).join('')}
                ` : ''}
            </div>
        `;
        container.style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =====================================================
    // PHASE 3: NOTES CRUD
    // =====================================================

    /**
     * Delete a customer note
     */
    async deleteNote(pageId, customerId, noteId) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) return false;
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/customers/${customerId}/notes/${noteId}`,
                pat
            );
            const res = await fetch(url, { method: 'DELETE' });
            return res.ok;
        } catch (e) {
            console.error('[PancakeFeatures] deleteNote error:', e);
            return false;
        }
    }

    /**
     * Edit a customer note
     */
    async editNote(pageId, customerId, noteId, newText) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) return false;
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/customers/${customerId}/notes/${noteId}`,
                pat
            );
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newText })
            });
            return res.ok;
        } catch (e) {
            console.error('[PancakeFeatures] editNote error:', e);
            return false;
        }
    }

    /**
     * Handle note delete with confirmation
     */
    async handleDeleteNote(noteId) {
        if (!confirm('Xóa ghi chú này?')) return;
        const conv = this.data.getConversation(this.chat.activeConversationId);
        if (!conv) return;

        const customerId = conv.customerId || conv._messagesData?.customers?.[0]?.id;
        if (!customerId) return;

        const ok = await this.deleteNote(conv.pageId, customerId, noteId);
        if (ok) {
            showToast('Đã xóa ghi chú', 'success');
            this.api.clearMessagesCache(`${conv.pageId}_${conv.conversationId}`);
            await this.chat.loadMessages(conv);
        } else {
            showToast('Lỗi xóa ghi chú', 'error');
        }
    }

    /**
     * Handle note edit (inline)
     */
    async handleEditNote(noteId, currentText) {
        const newText = prompt('Sửa ghi chú:', currentText);
        if (!newText || newText === currentText) return;

        const conv = this.data.getConversation(this.chat.activeConversationId);
        if (!conv) return;

        const customerId = conv.customerId || conv._messagesData?.customers?.[0]?.id;
        if (!customerId) return;

        const ok = await this.editNote(conv.pageId, customerId, noteId, newText);
        if (ok) {
            showToast('Đã cập nhật ghi chú', 'success');
            this.api.clearMessagesCache(`${conv.pageId}_${conv.conversationId}`);
            await this.chat.loadMessages(conv);
        } else {
            showToast('Lỗi cập nhật ghi chú', 'error');
        }
    }

    /**
     * Render notes with CRUD buttons (override default renderNotes)
     */
    renderNotesWithCRUD(conv) {
        const notes = conv._messagesData?.notes || [];
        const list = document.getElementById('convNotesList');
        if (!list) return;

        list.innerHTML = notes.map(n => {
            const date = new Date(n.created_at);
            const timeStr = date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
            const author = n.created_by?.fb_name || '';
            return `<div class="conv-note-item">
                <div class="conv-note-meta">
                    <span class="conv-note-author">${this._escapeHtml(author)}</span>
                    <span class="conv-note-time">${timeStr}</span>
                    <div class="conv-note-actions">
                        <button class="conv-note-btn" title="Sửa" onclick="window.inboxFeatures.handleEditNote('${n.id}', ${JSON.stringify(n.message).replace(/'/g, "\\'")})">
                            <i data-lucide="pencil"></i>
                        </button>
                        <button class="conv-note-btn conv-note-btn-delete" title="Xóa" onclick="window.inboxFeatures.handleDeleteNote('${n.id}')">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="conv-note-text">${this._escapeHtml(n.message)}</div>
            </div>`;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =====================================================
    // PHASE 4: PANCAKE QUICK REPLIES SYNC
    // =====================================================

    /**
     * Get Pancake quick replies for a page
     */
    async getPancakeQuickReplies(pageId) {
        const settings = await this.loadPageSettings(pageId);
        return {
            replies: settings?.quick_replies || [],
            types: settings?.quick_reply_types || []
        };
    }

    /**
     * Render Pancake quick replies in quick reply bar
     */
    renderPancakeQuickReplies(conv) {
        const bar = document.getElementById('quickReplyBar');
        if (!bar) return;

        const pageId = conv.pageId;
        const settings = this.pageSettings[pageId];
        if (!settings || !settings.quick_replies.length) {
            bar.style.display = 'none';
            // Try loading async
            this.loadPageSettings(pageId).then(() => {
                if (this.pageSettings[pageId]?.quick_replies?.length) {
                    this.renderPancakeQuickReplies(conv);
                }
            });
            return;
        }

        const replies = settings.quick_replies;
        const types = settings.quick_reply_types || [];

        // Group by type
        const typeMap = new Map();
        typeMap.set('all', { name: 'Tất cả', replies: [] });
        for (const t of types) {
            typeMap.set(t.id, { name: t.name || t.text || '', replies: [] });
        }

        for (const qr of replies) {
            const typeId = qr.type_id || 'all';
            const group = typeMap.get(typeId) || typeMap.get('all');
            group.replies.push(qr);
        }

        // Show first 10 replies in bar (row 1 = first 5, row 2 = next 5)
        const allReplies = replies.slice(0, 10);
        const row1 = allReplies.slice(0, 5);
        const row2 = allReplies.slice(5, 10);

        const row1El = document.getElementById('quickReplyRow1');
        const row2El = document.getElementById('quickReplyRow2');
        if (row1El) {
            row1El.innerHTML = row1.map(qr => {
                const text = qr.messages?.[0]?.message || qr.shortcut || '';
                const shortcut = qr.shortcut || '';
                const preview = text.length > 30 ? text.substring(0, 30) + '...' : text;
                return `<button class="qr-chip" title="${this._escapeHtml(text)}" onclick="window.inboxFeatures.applyQuickReply('${this._escapeHtml(text.replace(/'/g, "\\'"))}')">
                    ${shortcut ? `<span class="qr-shortcut">/${this._escapeHtml(shortcut)}</span>` : ''}
                    <span class="qr-text">${this._escapeHtml(preview)}</span>
                </button>`;
            }).join('');
        }
        if (row2El) {
            row2El.innerHTML = row2.map(qr => {
                const text = qr.messages?.[0]?.message || qr.shortcut || '';
                const shortcut = qr.shortcut || '';
                const preview = text.length > 30 ? text.substring(0, 30) + '...' : text;
                return `<button class="qr-chip" title="${this._escapeHtml(text)}" onclick="window.inboxFeatures.applyQuickReply('${this._escapeHtml(text.replace(/'/g, "\\'"))}')">
                    ${shortcut ? `<span class="qr-shortcut">/${this._escapeHtml(shortcut)}</span>` : ''}
                    <span class="qr-text">${this._escapeHtml(preview)}</span>
                </button>`;
            }).join('');
        }

        bar.style.display = allReplies.length > 0 ? 'block' : 'none';
    }

    applyQuickReply(text) {
        const input = document.getElementById('chatInput');
        if (input) {
            input.value = text;
            input.focus();
            input.dispatchEvent(new Event('input'));
        }
    }

    // =====================================================
    // PHASE 5: VIEWING INDICATOR
    // =====================================================

    /**
     * Handle viewing_conversation events from WebSocket
     */
    handleViewingEvent(type, payload) {
        const convId = payload?.conversation_id || payload?.conv_id || '';
        const userId = payload?.user_id || payload?.uid || '';
        const userName = payload?.user_name || payload?.name || '';

        if (!convId || !userId) return;

        if (!this.viewingUsers[convId]) {
            this.viewingUsers[convId] = new Map();
        }

        if (type === 'append' || type === 'viewing_conversation:append') {
            this.viewingUsers[convId].set(userId, { name: userName, time: Date.now() });
        } else if (type === 'remove' || type === 'viewing_conversation:remove') {
            this.viewingUsers[convId].delete(userId);
        }

        // Update UI if viewing this conversation
        if (this.chat.activeConversationId === convId) {
            this.renderViewingIndicator(convId);
        }
    }

    /**
     * Render "who is viewing" indicator in chat header
     */
    renderViewingIndicator(convId) {
        const container = document.getElementById('viewingIndicator');
        if (!container) return;

        const viewers = this.viewingUsers[convId];
        if (!viewers || viewers.size === 0) {
            container.style.display = 'none';
            return;
        }

        // Filter out self (current user)
        const currentUserId = this.tm.activeAccountId;
        const otherViewers = [];
        for (const [uid, info] of viewers) {
            if (uid !== currentUserId) {
                otherViewers.push(info.name || 'Nhân viên');
            }
        }

        if (otherViewers.length === 0) {
            container.style.display = 'none';
            return;
        }

        const names = otherViewers.slice(0, 3).join(', ');
        const more = otherViewers.length > 3 ? ` +${otherViewers.length - 3}` : '';

        container.innerHTML = `
            <div class="viewing-dot"></div>
            <span>${this._escapeHtml(names)}${more} đang xem</span>
        `;
        container.style.display = 'flex';
    }

    // =====================================================
    // PHASE 6: BULK ACTIONS
    // =====================================================

    toggleBulkMode() {
        this.isBulkMode = !this.isBulkMode;
        this.bulkSelected.clear();

        const bar = document.getElementById('bulkActionBar');
        const list = document.getElementById('conversationList');
        const btn = document.getElementById('btnBulkMode');

        if (this.isBulkMode) {
            list?.classList.add('bulk-mode');
            bar && (bar.style.display = 'flex');
            btn?.classList.add('active');
        } else {
            list?.classList.remove('bulk-mode');
            bar && (bar.style.display = 'none');
            btn?.classList.remove('active');
        }
        this._updateBulkCount();
        this.chat.renderConversationList();
    }

    toggleBulkSelect(convId) {
        if (this.bulkSelected.has(convId)) {
            this.bulkSelected.delete(convId);
        } else {
            this.bulkSelected.add(convId);
        }

        // Update checkbox visually
        const item = document.querySelector(`.conversation-item[data-id="${convId}"]`);
        const checkbox = item?.querySelector('.bulk-checkbox');
        if (checkbox) checkbox.classList.toggle('checked', this.bulkSelected.has(convId));

        this._updateBulkCount();
    }

    selectAllBulk() {
        const items = document.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const id = item.dataset.id;
            if (id) {
                this.bulkSelected.add(id);
                const cb = item.querySelector('.bulk-checkbox');
                if (cb) cb.classList.add('checked');
            }
        });
        this._updateBulkCount();
    }

    deselectAllBulk() {
        this.bulkSelected.clear();
        document.querySelectorAll('.bulk-checkbox').forEach(cb => cb.classList.remove('checked'));
        this._updateBulkCount();
    }

    _updateBulkCount() {
        const countEl = document.getElementById('bulkSelectedCount');
        if (countEl) countEl.textContent = this.bulkSelected.size;
    }

    /**
     * Bulk mark as read
     */
    async bulkMarkRead() {
        if (this.bulkSelected.size === 0) return;
        let success = 0;
        for (const convId of this.bulkSelected) {
            this.data.markAsRead(convId);
            success++;
        }
        showToast(`Đã đánh dấu đã đọc ${success} hội thoại`, 'success');
        this.chat.renderConversationList();
        this.bulkSelected.clear();
        this._updateBulkCount();
    }

    /**
     * Bulk add tag
     */
    async bulkAddTag(tagId) {
        if (this.bulkSelected.size === 0) return;
        let success = 0;
        const promises = [];
        for (const convId of this.bulkSelected) {
            const conv = this.data.getConversation(convId);
            if (conv) {
                promises.push(
                    this.addTagToConversation(conv.pageId, conv.conversationId || convId, tagId)
                        .then(ok => { if (ok) success++; })
                );
            }
        }
        await Promise.all(promises);
        showToast(`Đã gắn tag cho ${success}/${this.bulkSelected.size} hội thoại`, 'success');
        this.chat.renderConversationList();
    }

    /**
     * Bulk assign
     */
    async bulkAssign(userId) {
        if (this.bulkSelected.size === 0) return;
        let success = 0;
        const promises = [];
        for (const convId of this.bulkSelected) {
            const conv = this.data.getConversation(convId);
            if (conv) {
                promises.push(
                    this.assignConversation(conv.pageId, conv.conversationId || convId, userId)
                        .then(ok => { if (ok) success++; })
                );
            }
        }
        await Promise.all(promises);
        showToast(`Đã phân công ${success}/${this.bulkSelected.size} hội thoại`, 'success');
        this.chat.renderConversationList();
    }

    /**
     * Bulk assign group label (local)
     */
    bulkAssignLabel(labelId) {
        if (this.bulkSelected.size === 0) return;
        for (const convId of this.bulkSelected) {
            this.data.toggleConversationLabel(convId, labelId);
        }
        showToast(`Đã gán nhãn cho ${this.bulkSelected.size} hội thoại`, 'success');
        this.chat.renderConversationList();
        this.chat.renderGroupStats();
    }

    /**
     * Show bulk tag selector
     */
    showBulkTagSelector() {
        // Get tags from first selected conversation's page
        const firstConvId = [...this.bulkSelected][0];
        if (!firstConvId) return;
        const conv = this.data.getConversation(firstConvId);
        if (!conv) return;

        const pageTags = this.pageSettings[conv.pageId]?.tags || [];
        if (pageTags.length === 0) {
            showToast('Chưa load tags. Đang tải...', 'info');
            this.loadPageSettings(conv.pageId).then(() => this.showBulkTagSelector());
            return;
        }

        const menu = document.createElement('div');
        menu.className = 'bulk-dropdown-menu';
        menu.innerHTML = pageTags.map(t => `
            <button class="bulk-dropdown-item" onclick="window.inboxFeatures.bulkAddTag(${t.id});this.closest('.bulk-dropdown-menu').remove()">
                <span class="bulk-tag-dot" style="background:${t.color}"></span>
                ${this._escapeHtml(t.text || t.name)}
            </button>
        `).join('');

        const btn = document.getElementById('btnBulkTag');
        if (btn) {
            btn.style.position = 'relative';
            btn.appendChild(menu);
            setTimeout(() => {
                const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
                document.addEventListener('click', close);
            }, 0);
        }
    }

    /**
     * Show bulk assignee selector
     */
    showBulkAssignSelector() {
        const firstConvId = [...this.bulkSelected][0];
        if (!firstConvId) return;
        const conv = this.data.getConversation(firstConvId);
        if (!conv) return;

        const users = this.pageUsers[conv.pageId] || [];
        if (users.length === 0) {
            showToast('Chưa load nhân viên. Đang tải...', 'info');
            this.loadPageUsers(conv.pageId).then(() => this.showBulkAssignSelector());
            return;
        }

        const menu = document.createElement('div');
        menu.className = 'bulk-dropdown-menu';
        menu.innerHTML = users.map(u => `
            <button class="bulk-dropdown-item" onclick="window.inboxFeatures.bulkAssign('${u.id}');this.closest('.bulk-dropdown-menu').remove()">
                <span class="bulk-assign-avatar">${(u.name || '?')[0]}</span>
                ${this._escapeHtml(u.name)}
            </button>
        `).join('');

        const btn = document.getElementById('btnBulkAssign');
        if (btn) {
            btn.style.position = 'relative';
            btn.appendChild(menu);
            setTimeout(() => {
                const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
                document.addEventListener('click', close);
            }, 0);
        }
    }

    /**
     * Show bulk label selector (local groups)
     */
    showBulkLabelSelector() {
        const groups = this.data.groups || [];
        const menu = document.createElement('div');
        menu.className = 'bulk-dropdown-menu';
        menu.innerHTML = groups.map(g => `
            <button class="bulk-dropdown-item" onclick="window.inboxFeatures.bulkAssignLabel('${g.id}');this.closest('.bulk-dropdown-menu').remove()">
                <span class="bulk-tag-dot" style="background:${g.color}"></span>
                ${this._escapeHtml(g.name)}
            </button>
        `).join('');

        const btn = document.getElementById('btnBulkLabel');
        if (btn) {
            btn.style.position = 'relative';
            btn.appendChild(menu);
            setTimeout(() => {
                const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
                document.addEventListener('click', close);
            }, 0);
        }
    }

    // =====================================================
    // PHASE 9: PAGE SETTINGS UI
    // =====================================================

    /**
     * Show page settings modal for current active page
     */
    async showPageSettingsModal(pageId) {
        if (!pageId) {
            const conv = this.data.getConversation(this.chat.activeConversationId);
            pageId = conv?.pageId || this.data.pages[0]?.id;
        }
        if (!pageId) { showToast('Không tìm thấy page', 'warning'); return; }

        const settings = await this.loadPageSettings(pageId, true);
        if (!settings) { showToast('Không thể load settings', 'error'); return; }

        const page = this.data.pages.find(p => String(p.id) === String(pageId));
        const pageName = page?.name || pageId;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:700px;max-height:85vh;">
                <div class="modal-title">
                    <i data-lucide="settings"></i> Cài đặt Page: ${this._escapeHtml(pageName)}
                </div>
                <div class="modal-body" style="overflow-y:auto;">
                    <!-- Toggle Settings -->
                    <div class="settings-section">
                        <h4>Cài đặt chung</h4>
                        <div class="settings-grid">
                            ${this._settingToggle('Thông báo', settings.notification, 'notification')}
                            ${this._settingToggle('Ưu tiên chưa đọc', settings.unread_first, 'unread_first')}
                            ${this._settingToggle('Multi-tag', settings.multi_tag, 'multi_tag')}
                            ${this._settingToggle('Chỉ hiện conv được phân công', settings.show_only_assigned_conv, 'show_only_assigned_conv')}
                            ${this._settingToggle('Auto-like comment', settings.auto_like, 'auto_like')}
                            ${this._settingToggle('Auto-ẩn comment', settings.auto_hide_comment, 'auto_hide_comment')}
                            ${this._settingToggle('Auto-tagging', settings.auto_tagging, 'auto_tagging')}
                            ${this._settingToggle('Round Robin', settings.hard_round_robin, 'hard_round_robin')}
                        </div>
                    </div>

                    <!-- Tags -->
                    <div class="settings-section">
                        <h4>Tags (${settings.tags.length})</h4>
                        <div class="settings-tag-list">
                            ${settings.tags.map(t => `
                                <span class="settings-tag" style="background:${t.color || '#6b7280'}20;color:${t.color || '#6b7280'};border:1px solid ${t.color || '#6b7280'}30;">
                                    ${this._escapeHtml(t.text || t.name || '')}
                                </span>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Quick Replies -->
                    <div class="settings-section">
                        <h4>Tin nhắn nhanh (${settings.quick_replies.length})</h4>
                        <div class="settings-qr-list" style="max-height:200px;overflow-y:auto;">
                            ${settings.quick_replies.slice(0, 20).map(qr => `
                                <div class="settings-qr-item">
                                    <span class="settings-qr-shortcut">/${this._escapeHtml(qr.shortcut || '')}</span>
                                    <span class="settings-qr-text">${this._escapeHtml((qr.messages?.[0]?.message || '').substring(0, 80))}</span>
                                </div>
                            `).join('')}
                            ${settings.quick_replies.length > 20 ? `<div style="text-align:center;padding:8px;color:var(--text-tertiary);font-size:0.75rem;">+${settings.quick_replies.length - 20} tin nhắn nhanh khác</div>` : ''}
                        </div>
                    </div>

                    <!-- Warehouses -->
                    <div class="settings-section">
                        <h4>Kho hàng (${settings.warehouses.length})</h4>
                        <div class="settings-warehouse-list">
                            ${settings.warehouses.map(w => `
                                <div class="settings-warehouse-item">
                                    <strong>${this._escapeHtml(w.name)}</strong>
                                    <span>${this._escapeHtml(w.full_address || '')}</span>
                                    <span>${this._escapeHtml(w.phone_number || '')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-cancel" onclick="this.closest('.modal-overlay').remove()">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    _settingToggle(label, value, key) {
        return `
            <div class="setting-toggle-row">
                <span class="setting-toggle-label">${this._escapeHtml(label)}</span>
                <span class="setting-toggle-value ${value ? 'on' : 'off'}">${value ? 'BẬT' : 'TẮT'}</span>
            </div>
        `;
    }

    // =====================================================
    // PHASE 7: ORDERS SYNC WITH PANCAKE
    // =====================================================

    /**
     * Create order via Pancake API (using page settings warehouse)
     */
    async createPancakeOrder(pageId, orderData) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) throw new Error('No page access token');

            const settings = this.pageSettings[pageId];
            const shopId = settings?.shop_id;
            const warehouse = settings?.warehouses?.[0];

            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/orders`,
                pat
            );

            const payload = {
                customer_name: orderData.customerName,
                phone_number: orderData.phone,
                full_address: orderData.address || '',
                province_id: '',
                district_id: '',
                ward_id: '',
                shipping_fee: orderData.shippingFee || 0,
                discount: orderData.discount || 0,
                payment_method: orderData.paymentMethod === 'cod' ? 'COD' : 'BANK_TRANSFER',
                note: orderData.note || '',
                items: orderData.products.map(p => ({
                    name: p.name,
                    variant_name: p.variant || '',
                    quantity: p.qty || 1,
                    price: p.price || 0
                })),
                shop_id: shopId || null,
                warehouse_id: warehouse?.id || null,
                conversation_id: orderData.conversationId || null,
                source: 'n2store_inbox'
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success || res.ok) {
                return { success: true, order: data.order || data.data || data };
            }
            return { success: false, error: data.message || 'Unknown error' };
        } catch (e) {
            console.error('[PancakeFeatures] createPancakeOrder error:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Fetch recent orders for a customer from messages data
     */
    getRecentOrders(conv) {
        return conv._messagesData?.recent_orders || [];
    }

    /**
     * Render recent orders in the activities tab or order section
     */
    renderRecentOrders(conv) {
        const orders = this.getRecentOrders(conv);
        const container = document.getElementById('recentOrdersList');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:1rem;font-size:0.75rem;">Chưa có đơn hàng</div>';
            return;
        }

        container.innerHTML = orders.map(order => {
            const status = order.status || 'unknown';
            const statusColors = {
                'confirmed': 'green', 'shipped': 'blue', 'delivered': 'green',
                'cancelled': 'red', 'returned': 'orange', 'pending': 'yellow'
            };
            const color = statusColors[status] || 'gray';
            const total = order.total_price || order.amount || 0;
            const date = order.inserted_at ? new Date(order.inserted_at).toLocaleDateString('vi-VN') : '';
            return `
                <div class="recent-order-item">
                    <div class="recent-order-header">
                        <span class="recent-order-id">#${this._escapeHtml(order.id || '')}</span>
                        <span class="recent-order-status" style="color:${color}">${this._escapeHtml(status)}</span>
                    </div>
                    <div class="recent-order-detail">
                        <span>${new Intl.NumberFormat('vi-VN').format(total)}₫</span>
                        <span class="recent-order-date">${date}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // =====================================================
    // PHASE 8: CUSTOMER PROFILE EDIT
    // =====================================================

    /**
     * Update customer phone number on Pancake
     */
    async updateCustomerPhone(pageId, customerId, phone) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) return false;
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/customers/${customerId}`,
                pat
            );
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone_number: phone })
            });
            return res.ok;
        } catch (e) {
            console.error('[PancakeFeatures] updateCustomerPhone error:', e);
            return false;
        }
    }

    /**
     * Update customer name on Pancake
     */
    async updateCustomerName(pageId, customerId, name) {
        try {
            const pat = await this.tm.getOrGeneratePageAccessToken(pageId);
            if (!pat) return false;
            const url = InboxApiConfig.buildUrl.pancakeOfficial(
                `pages/${pageId}/customers/${customerId}`,
                pat
            );
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            return res.ok;
        } catch (e) {
            console.error('[PancakeFeatures] updateCustomerName error:', e);
            return false;
        }
    }

    /**
     * Handle inline edit of customer field
     */
    async handleEditCustomerField(field) {
        const conv = this.data.getConversation(this.chat.activeConversationId);
        if (!conv) return;

        const customerId = conv.customerId || conv._messagesData?.customers?.[0]?.id;
        if (!customerId) { showToast('Không tìm thấy customer ID', 'warning'); return; }

        const customer = conv._messagesData?.customers?.[0];
        let currentValue = '';
        let promptText = '';

        if (field === 'phone') {
            currentValue = conv.phone || '';
            promptText = 'Nhập số điện thoại mới:';
        } else if (field === 'name') {
            currentValue = customer?.name || conv.name || '';
            promptText = 'Nhập tên mới:';
        }

        const newValue = prompt(promptText, currentValue);
        if (!newValue || newValue === currentValue) return;

        let ok = false;
        if (field === 'phone') {
            ok = await this.updateCustomerPhone(conv.pageId, customerId, newValue);
        } else if (field === 'name') {
            ok = await this.updateCustomerName(conv.pageId, customerId, newValue);
        }

        if (ok) {
            showToast(`Đã cập nhật ${field}`, 'success');
            this.api.clearMessagesCache(`${conv.pageId}_${conv.conversationId}`);
            await this.chat.loadMessages(conv);
        } else {
            showToast(`Lỗi cập nhật ${field}`, 'error');
        }
    }

    // =====================================================
    // PHASE 8: CUSTOMER PROFILE (enriched view)
    // =====================================================

    /**
     * Render enriched customer profile with edit capability for notes
     * Extends the existing renderCustomerInfoCard
     */
    renderEnrichedCustomerInfo(conv) {
        // Assignee section
        this.renderAssigneeSection(conv);
        // Pancake tags
        this.renderPancakeTagBar(conv);
        // Notes with CRUD
        this.renderNotesWithCRUD(conv);
        // Pancake quick replies
        this.renderPancakeQuickReplies(conv);
        // Viewing indicator
        this.renderViewingIndicator(conv.id);
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// =====================================================
// GLOBAL INSTANCE
// =====================================================
const inboxFeatures = new InboxPancakeFeatures();
window.inboxFeatures = inboxFeatures;
