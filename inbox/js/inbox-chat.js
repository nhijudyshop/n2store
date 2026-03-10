/* =====================================================
   INBOX CHAT - Chat UI Controller with Pancake API
   Reference: tpos-pancake/js/pancake-chat.js
   ===================================================== */

// Gradient colors for avatar placeholders (from tpos-pancake)
const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
];

class InboxChatController {
    constructor(dataManager) {
        this.data = dataManager;
        this.activeConversationId = null;
        this.currentFilter = 'all';
        this.currentGroupFilter = null;
        this.searchQuery = '';
        this.isSearching = false;
        this.searchResults = null; // null = use local filter, [] = API returned empty
        this.selectedPageId = null; // Page filter
        this.isSending = false;
        this.isLoadingMessages = false;

        // Message pagination (like tpos-pancake)
        this.isLoadingMoreMessages = false;
        this.hasMoreMessages = true;
        this.messageCurrentCount = 0;

        // WebSocket real-time (Phoenix Protocol v2.0.0, like tpos-pancake)
        this.socket = null;
        this.isSocketConnected = false;
        this.isSocketConnecting = false;
        this.socketReconnectAttempts = 0;
        this.socketMaxReconnectAttempts = 3;
        this.socketReconnectDelay = 2000;
        this.socketReconnectTimer = null;
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL = 30000;
        this.socketJoinRef = 0;
        this.socketMsgRef = 0;
        this.userId = null;
        this.autoRefreshInterval = null;
        this.AUTO_REFRESH_INTERVAL = 30000;

        // Quick replies (like tpos-pancake)
        this.quickReplies = [
            { label: 'NV My KH dat', color: 'blue', template: '' },
            { label: 'NV My CK + Gap', color: 'blue', template: '' },
            { label: 'NHAC KHACH', color: 'red', template: '' },
            { label: 'XIN DIA CHI', color: 'purple', template: '' },
            { label: 'NV .BO', color: 'teal', template: '' },
            { label: 'NJD OI', color: 'green', template: '' },
            { label: 'NV. Lai', color: 'orange', template: '' },
            { label: 'NV. Hanh', color: 'pink', template: '' },
            { label: 'Nv.Huyen', color: 'pink', template: '' },
            { label: 'Nv. Duyen', color: 'teal', template: '' },
            { label: 'XU LY BC', color: 'purple', template: '' },
            { label: 'BOOM', color: 'red', template: '' },
            { label: 'CHECK IB', color: 'green', template: '' },
            { label: 'Nv My', color: 'blue', template: '' },
        ];

        // Reply state
        this.replyingTo = null; // { msgId, text, senderName, isOutgoing }

        // Conversation list pagination
        this.isLoadingMoreConversations = false;
        this.hasMoreConversations = true;

        // Page unread counts
        this.pageUnreadCounts = {};

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
            pageSelectorBtn: document.getElementById('pageSelectorBtn'),
            pageSelectorDropdown: document.getElementById('pageSelectorDropdown'),
            pageSelectorLabel: document.getElementById('pageSelectorLabel'),
        };
    }

    init() {
        this.bindEvents();
        this.renderPageSelector();
        this.renderConversationList();
        this.renderGroupStats();
    }

    bindEvents() {
        // Search: instant local filter + debounced API search (like tpos-pancake)
        let searchTimeout = null;
        this.elements.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.searchQuery = query;

            if (searchTimeout) clearTimeout(searchTimeout);

            if (!query) {
                this.isSearching = false;
                this.searchResults = null;
                this.renderConversationList();
                return;
            }

            // Instant: local filter
            this.searchResults = null;
            this.renderConversationList();

            // Debounced: API search for more results (300ms)
            searchTimeout = setTimeout(async () => {
                await this.performSearch(query);
            }, 300);
        });

        // Clear search on Escape
        this.elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.elements.searchInput.value = '';
                this.searchQuery = '';
                this.isSearching = false;
                this.searchResults = null;
                this.renderConversationList();
            }
        });

        // Conversation list scroll-to-load-more
        this.elements.conversationList.addEventListener('scroll', () => {
            const el = this.elements.conversationList;
            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
            if (nearBottom && !this.isLoadingMoreConversations && this.hasMoreConversations && !this.searchQuery) {
                this.loadMoreConversations();
            }
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

        // Typing indicator - send typing status to Pancake API
        let typingTimeout = null;
        let isTyping = false;
        this.elements.chatInput.addEventListener('input', () => {
            if (!this.activeConversationId) return;
            const conv = this.data.getConversation(this.activeConversationId);
            if (!conv) return;
            if (!isTyping) {
                isTyping = true;
                window.pancakeDataManager?.sendTypingIndicator?.(conv.pageId, conv.conversationId, true);
            }
            if (typingTimeout) clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                isTyping = false;
                window.pancakeDataManager?.sendTypingIndicator?.(conv.pageId, conv.conversationId, false);
            }, 2000);
        });

        // Message scroll: pagination (scroll up)
        this.elements.chatMessages.addEventListener('scroll', () => {
            const container = this.elements.chatMessages;
            if (container.scrollTop < 100 &&
                this.hasMoreMessages &&
                !this.isLoadingMoreMessages &&
                this.activeConversationId) {
                this.loadMoreMessages();
            }
        });

        // Quick reply bar click
        const qrBar = document.getElementById('quickReplyBar');
        if (qrBar) {
            qrBar.addEventListener('click', (e) => {
                const btn = e.target.closest('.qr-btn');
                if (!btn) return;
                const template = btn.dataset.template;
                if (template) {
                    this.elements.chatInput.value = template;
                    this.elements.chatInput.focus();
                }
            });
        }

        // Message action buttons (like, hide, delete, copy) via event delegation
        this.elements.chatMessages.addEventListener('click', async (e) => {
            const btn = e.target.closest('.msg-action-btn');
            if (!btn) return;
            e.stopPropagation();
            const action = btn.dataset.action;
            const msgId = btn.dataset.msgId;
            if (!action || !msgId) return;
            await this.handleMessageAction(action, msgId, btn);
        });

        // Cancel reply button
        const btnCancelReply = document.getElementById('btnCancelReply');
        if (btnCancelReply) {
            btnCancelReply.addEventListener('click', () => this.cancelReply());
        }

        // Reaction picker clicks
        const reactionPicker = document.getElementById('reactionPicker');
        if (reactionPicker) {
            reactionPicker.addEventListener('click', async (e) => {
                const btn = e.target.closest('.reaction-emoji');
                if (!btn) return;
                const reaction = btn.dataset.reaction;
                const msgId = reactionPicker.dataset.msgId;
                if (reaction && msgId) {
                    await this.sendReaction(msgId, reaction);
                }
            });
        }

        // File attachment
        const btnAttachFile = document.getElementById('btnAttachFile');
        if (btnAttachFile) {
            btnAttachFile.addEventListener('click', () => this.attachFile());
        }

        // Emoji picker
        this.emojiData = {
            recent: ['😊', '👍', '❤️', '😂', '🙏', '😍', '🔥', '✨'],
            smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬'],
            gestures: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','🫦'],
            hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','💏','💑','👪'],
            animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🪸','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦣','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
            food: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🫘','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🫗'],
            objects: ['💡','🔦','🏮','🪔','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🪫','🔌','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓']
        };
        const savedRecent = localStorage.getItem('inbox_recent_emojis');
        if (savedRecent) { try { this.emojiData.recent = JSON.parse(savedRecent); } catch(e){} }

        const emojiBtn = document.getElementById('btnEmoji');
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiGrid = document.getElementById('emojiGrid');
        if (emojiBtn && emojiPicker && emojiGrid) {
            emojiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const vis = emojiPicker.style.display === 'block';
                emojiPicker.style.display = vis ? 'none' : 'block';
                if (!vis) this.renderEmojiGrid('recent');
            });
            document.addEventListener('click', (e) => {
                if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.style.display = 'none';
            });
            document.getElementById('emojiCategories').addEventListener('click', (e) => {
                const cat = e.target.closest('.emoji-cat');
                if (!cat) return;
                document.querySelectorAll('.emoji-cat').forEach(c => c.classList.remove('active'));
                cat.classList.add('active');
                this.renderEmojiGrid(cat.dataset.cat);
            });
            emojiGrid.addEventListener('click', (e) => {
                const item = e.target.closest('.emoji-item');
                if (!item) return;
                const emoji = item.textContent;
                const input = this.elements.chatInput;
                const start = input.selectionStart;
                const end = input.selectionEnd;
                input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
                input.selectionStart = input.selectionEnd = start + emoji.length;
                input.focus();
                // Save to recent
                const idx = this.emojiData.recent.indexOf(emoji);
                if (idx > -1) this.emojiData.recent.splice(idx, 1);
                this.emojiData.recent.unshift(emoji);
                this.emojiData.recent = this.emojiData.recent.slice(0, 24);
                localStorage.setItem('inbox_recent_emojis', JSON.stringify(this.emojiData.recent));
            });
        }

        // Star conversation
        this.elements.btnStarConversation.addEventListener('click', () => {
            if (this.activeConversationId) {
                const starred = this.data.toggleStar(this.activeConversationId);
                this.updateStarButton(starred);
                this.renderConversationList();
            }
        });

        // Refresh - reload from Pancake API
        this.elements.btnRefreshInbox.addEventListener('click', async () => {
            const btn = this.elements.btnRefreshInbox;
            btn.disabled = true;
            btn.style.opacity = '0.5';
            try {
                await this.data.loadConversations(true);
                this.renderPageSelector();
                this.renderConversationList();
                this.renderGroupStats();
                showToast('Đã làm mới dữ liệu từ Pancake', 'success');
            } catch (err) {
                showToast('Lỗi làm mới: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });

        // Info panel tabs
        document.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const tabMap = { stats: 'tabStats', activities: 'tabActivities', orders: 'tabOrders' };
                const target = document.getElementById(tabMap[tab.dataset.tab] || 'tabStats');
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

        // Attach image button
        const btnAttachImage = document.getElementById('btnAttachImage');
        if (btnAttachImage) {
            btnAttachImage.addEventListener('click', () => this.attachImage());
        }

        // Page selector toggle
        if (this.elements.pageSelectorBtn) {
            this.elements.pageSelectorBtn.addEventListener('click', () => {
                const dd = this.elements.pageSelectorDropdown;
                dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
            });
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.page-selector')) {
                    this.elements.pageSelectorDropdown.style.display = 'none';
                }
            });
        }
    }

    // ===== Page Selector (from tpos-pancake) =====

    renderPageSelector() {
        const dropdown = this.elements.pageSelectorDropdown;
        if (!dropdown) return;

        const pages = this.data.pages || [];
        if (pages.length === 0) {
            dropdown.innerHTML = '<div class="page-item" style="padding:8px;color:var(--text-tertiary);">Chưa có pages</div>';
            return;
        }

        let html = `
            <div class="page-item ${!this.selectedPageId ? 'active' : ''}" data-page-id="">
                <div class="page-item-icon"><i data-lucide="layout-grid"></i></div>
                <div class="page-item-info">
                    <div class="page-item-name">Tất cả Pages</div>
                    <div class="page-item-hint">${pages.length} pages</div>
                </div>
            </div>
        `;

        for (const page of pages) {
            const pageId = page.id;
            const pageName = page.name || 'Page';
            const isActive = this.selectedPageId === pageId;
            const initial = pageName.charAt(0).toUpperCase();
            const avatarHtml = page.avatar
                ? `<img src="${page.avatar}" class="page-item-avatar" alt="${this.escapeHtml(pageName)}" onerror="this.outerHTML='<div class=page-item-avatar-ph>${initial}</div>'">`
                : `<div class="page-item-avatar-ph">${initial}</div>`;

            const unreadCount = this.pageUnreadCounts[pageId] || 0;
            const unreadBadgeHtml = unreadCount > 0
                ? `<span class="page-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
                : '';

            html += `
                <div class="page-item ${isActive ? 'active' : ''}" data-page-id="${pageId}">
                    ${avatarHtml}
                    <div class="page-item-info">
                        <div class="page-item-name">${this.escapeHtml(pageName)}</div>
                    </div>
                    ${unreadBadgeHtml}
                </div>
            `;
        }

        dropdown.innerHTML = html;

        // Bind click events
        dropdown.querySelectorAll('.page-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectedPageId = item.dataset.pageId || null;
                const label = this.elements.pageSelectorLabel;
                if (this.selectedPageId) {
                    const page = pages.find(p => p.id === this.selectedPageId);
                    label.textContent = page?.name || 'Page';
                } else {
                    label.textContent = 'Tất cả Pages';
                }
                dropdown.style.display = 'none';
                this.renderPageSelector(); // Update active state
                this.renderConversationList();
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Avatar Helper (from tpos-pancake) =====

    getAvatarHtml(conv, size = 'list') {
        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        // 4-tier avatar fallback (like tpos-pancake)
        const fbId = conv._raw?.from?.id || conv._raw?.customers?.[0]?.fb_id || conv.psid || null;
        const directAvatar = conv.avatar
            || conv._raw?.from?.picture?.data?.url
            || conv._raw?.from?.profile_pic
            || conv._raw?.customers?.[0]?.avatar
            || null;

        let avatarUrl = directAvatar;
        if (window.pancakeDataManager?.getAvatarUrl && fbId) {
            avatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, conv.pageId, null, directAvatar);
        }

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            return `<img src="${avatarUrl}" alt="${this.escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="conv-avatar-ph" style="display:none;background:${gradient};">${initial}</div>`;
        }
        return `<div class="conv-avatar-ph" style="background:${gradient};">${initial}</div>`;
    }

    // ===== Tags Helper =====

    getTagsHtml(conv) {
        const tags = conv._raw?.tags;
        if (!tags || tags.length === 0) return '';
        const colorPalette = ['red', 'green', 'blue', 'orange', 'purple', 'pink', 'teal'];
        return tags.slice(0, 3).map((tag, idx) => {
            const tagName = tag.name || tag.tag_name || tag;
            const tagColor = tag.color || colorPalette[idx % colorPalette.length];
            if (tagColor.startsWith('#')) {
                return `<span class="conv-tag" style="background:${tagColor}20;color:${tagColor};">${this.escapeHtml(tagName)}</span>`;
            }
            return `<span class="conv-tag tag-${tagColor}">${this.escapeHtml(tagName)}</span>`;
        }).join('');
    }

    // ===== Conversation List =====

    renderConversationList() {
        // If API search returned results, use them merged with local results
        let conversations;
        if (this.searchResults !== null && this.searchQuery) {
            // Merge: local filtered + API results (deduplicate by id)
            const localResults = this.data.getConversations({
                search: this.searchQuery,
                filter: this.currentFilter,
                groupFilter: this.currentGroupFilter,
            });
            const localIds = new Set(localResults.map(c => c.id));
            const apiMapped = this.searchResults
                .filter(c => !localIds.has(c.id))
                .map(c => this.data.mapConversation(c));
            conversations = [...localResults, ...apiMapped];
        } else {
            conversations = this.data.getConversations({
                search: this.searchQuery,
                filter: this.currentFilter,
                groupFilter: this.currentGroupFilter,
            });
        }

        // Apply page filter
        if (this.selectedPageId) {
            conversations = conversations.filter(c => c.pageId === this.selectedPageId);
        }

        if (conversations.length === 0 && this.isSearching) {
            this.elements.conversationList.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                    <div class="typing-indicator" style="justify-content:center;margin-bottom:8px;">
                        <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                    </div>
                    <p>Đang tìm kiếm "${this.escapeHtml(this.searchQuery)}"...</p>
                </div>
            `;
            return;
        }

        if (conversations.length === 0) {
            this.elements.conversationList.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">
                    <p>Không tìm thấy kết quả${this.searchQuery ? ' cho "' + this.escapeHtml(this.searchQuery) + '"' : ''}</p>
                </div>
            `;
            return;
        }

        this.elements.conversationList.innerHTML = conversations.map(conv => {
            const labelClass = this.getLabelClass(conv.label);
            const labelText = this.getLabelText(conv.label);
            const isActive = conv.id === this.activeConversationId;
            const isUnread = conv.unread > 0;

            // Avatar with gradient fallback
            const avatarHtml = this.getAvatarHtml(conv);

            // Unread badge (9+ cap like tpos-pancake)
            const unreadBadge = isUnread
                ? `<span class="conv-unread-badge">${conv.unread > 9 ? '9+' : conv.unread}</span>`
                : '';

            // Livestream badge
            const livestreamBadge = conv.isLivestream
                ? '<span class="conv-livestream-badge">LIVE</span>'
                : '';

            // Page name
            const pageNameHtml = conv.pageName
                ? `<span class="conv-page-name">${this.escapeHtml(conv.pageName)}</span>`
                : '';

            // Type icon (like tpos-pancake: message-circle for inbox, message-square for comment)
            const typeIcon = conv.type === 'COMMENT' ? 'message-square' : 'message-circle';

            // Tags
            const tagsHtml = this.getTagsHtml(conv);

            return `
                <div class="conversation-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}"
                     data-id="${conv.id}" onclick="window.inboxChat.selectConversation('${conv.id}')">
                    <div class="conv-avatar-wrap">
                        ${avatarHtml}
                        ${unreadBadge}
                    </div>
                    <div class="conv-content">
                        <div class="conv-header">
                            <span class="conv-name">${this.escapeHtml(conv.name)}</span>
                            <span class="conv-time">${this.formatTime(conv.time)}</span>
                        </div>
                        ${pageNameHtml}
                        <div class="conv-preview ${isUnread ? 'unread' : ''}">${this.escapeHtml(conv.lastMessage)}</div>
                        <div class="conv-footer">
                            <div class="conv-footer-left">
                                <span class="conv-label ${labelClass}">${labelText}</span>
                                ${tagsHtml}
                                ${livestreamBadge}
                            </div>
                            <button class="conv-read-toggle" title="${isUnread ? 'Đánh dấu đã đọc' : 'Đánh dấu chưa đọc'}"
                                onclick="event.stopPropagation(); window.inboxChat.toggleReadUnread('${conv.id}')">
                                <i data-lucide="${isUnread ? 'mail-open' : 'mail'}"></i>
                            </button>
                            <span class="conv-type-icon" title="${conv.type === 'COMMENT' ? 'Bình luận' : 'Tin nhắn'}">
                                <i data-lucide="${typeIcon}"></i>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Load More Conversations (scroll pagination) =====

    async loadMoreConversations() {
        if (this.isLoadingMoreConversations || !this.hasMoreConversations) return;
        this.isLoadingMoreConversations = true;

        // Show loading spinner at bottom
        const spinner = document.createElement('div');
        spinner.className = 'conv-loading-more';
        spinner.innerHTML = '<div class="typing-indicator" style="justify-content:center;padding:12px;"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
        this.elements.conversationList.appendChild(spinner);

        try {
            // Save scroll position before re-render
            const scrollTop = this.elements.conversationList.scrollTop;

            const newConvs = await this.data.loadMoreConversations();
            spinner.remove();

            if (!newConvs || newConvs.length === 0) {
                this.hasMoreConversations = false;
                console.log('[InboxChat] No more conversations to load');
                return;
            }

            // Re-render the full list with new conversations appended
            this.renderConversationList();

            // Restore scroll position so user can continue scrolling down
            this.elements.conversationList.scrollTop = scrollTop;

            console.log(`[InboxChat] Loaded ${newConvs.length} more conversations`);
        } catch (error) {
            console.error('[InboxChat] Error loading more conversations:', error);
            spinner.remove();
        } finally {
            this.isLoadingMoreConversations = false;
        }
    }

    // ===== Toggle Read/Unread =====

    toggleReadUnread(convId) {
        const conv = this.data.getConversation(convId);
        if (!conv) return;

        if (conv.unread > 0) {
            this.data.markAsRead(convId);
        } else {
            this.data.markAsUnread(convId);
        }
        this.renderConversationList();
        this.data.recalculateGroupCounts();
        this.renderGroupStats();
        this.updatePageUnreadCounts();
    }

    // ===== Select Conversation =====

    async selectConversation(convId) {
        this.activeConversationId = convId;
        this.cancelReply(); // Clear any pending reply
        let conv = this.data.getConversation(convId);

        // If not found locally, check search results (API returned conversation not in loaded list)
        if (!conv && this.searchResults) {
            const apiConv = this.searchResults.find(c => c.id === convId);
            if (apiConv) {
                conv = this.data.mapConversation(apiConv);
                this.data.conversations.unshift(conv);
                this.data.buildMaps();
            }
        }
        if (!conv) return;

        this.data.markAsRead(convId);

        // Update header
        this.elements.chatUserName.textContent = conv.name;
        const statusParts = [];
        if (conv.pageName) statusParts.push(conv.pageName);
        if (conv.type === 'COMMENT') statusParts.push('Bình luận');
        if (conv.isLivestream) statusParts.push('Livestream');
        this.elements.chatUserStatus.textContent = statusParts.join(' · ') || 'Đang tải...';

        // Update chat avatar with 4-tier fallback (like tpos-pancake)
        const chatAvatar = this.elements.chatHeader.querySelector('.chat-avatar');
        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        const fbId = conv._raw?.from?.id || conv._raw?.customers?.[0]?.fb_id || conv.psid || null;
        const directAvatar = conv.avatar || conv._raw?.from?.picture?.data?.url || conv._raw?.from?.profile_pic || conv._raw?.customers?.[0]?.avatar || null;
        let avatarUrl = directAvatar;
        if (window.pancakeDataManager?.getAvatarUrl && fbId) {
            avatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, conv.pageId, null, directAvatar);
        }

        if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
            chatAvatar.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';this.parentElement.style.background='${gradient}'"><div style="display:none;width:100%;height:100%;border-radius:50%;background:${gradient};align-items:center;justify-content:center;color:white;font-size:0.875rem;font-weight:700">${initial}</div>`;
            chatAvatar.style.background = 'transparent';
        } else {
            chatAvatar.innerHTML = `<span>${initial}</span>`;
            chatAvatar.style.background = gradient;
            chatAvatar.style.color = 'white';
            chatAvatar.style.fontSize = '0.875rem';
            chatAvatar.style.fontWeight = '700';
        }
        chatAvatar.className = 'chat-avatar';

        this.updateStarButton(conv.starred);
        this.renderChatLabelBar(conv);
        this.renderConversationList();
        this.renderGroupStats();

        // Reset stats bar and post info while loading
        const statsBar = document.getElementById('customerStatsBar');
        if (statsBar) statsBar.style.display = 'none';
        const postBanner = document.getElementById('postInfoBanner');
        if (postBanner) postBanner.style.display = 'none';

        // Show loading state
        this.elements.chatMessages.innerHTML = `
            <div class="chat-empty-state">
                <div class="loading-spinner"></div>
                <p>Đang tải tin nhắn...</p>
            </div>
        `;

        // Fetch real messages from Pancake API
        await this.loadMessages(conv);

        // Show quick reply bar
        this.renderQuickReplies();
    }

    /**
     * Load messages for a conversation from Pancake API
     */
    async loadMessages(conv) {
        if (this.isLoadingMessages) return;
        this.isLoadingMessages = true;

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) {
                console.warn('[InboxChat] pancakeDataManager not available');
                return;
            }

            const result = await pdm.fetchMessagesForConversation(
                conv.pageId,
                conv.conversationId,
                null,
                conv.customerId
            );

            // Check if user switched to a different conversation while loading
            if (this.activeConversationId !== conv.id) return;

            const messages = result.messages || [];

            // Store full response metadata for stats bar, post info, activities
            conv._messagesData = {
                post: result.post || result.conversation?.post || null,
                customers: result.customers || [],
                reports_by_phone: result.reports_by_phone || {},
                comment_count: result.comment_count || 0,
                recent_phone_numbers: result.recent_phone_numbers || result.conv_recent_phone_numbers || [],
                activities: result.activities || [],
                conv_phone_numbers: result.conv_phone_numbers || [],
            };

            // Detect livestream from post data
            // post.type === 'livestream' → livestream (live_video_status: 'vod' or 'live')
            // post.type === 'video' / other → NOT livestream (reel, video post, etc.)
            const post = conv._messagesData.post;
            const postType = post?.type;
            const liveVideoStatus = post?.live_video_status;
            const wasLivestream = conv.isLivestream;

            if (postType === 'livestream' || liveVideoStatus === 'vod' || liveVideoStatus === 'live') {
                this.data.markAsLivestream(conv.id);
                conv.isLivestream = true;
            } else if (conv.type === 'COMMENT' && post) {
                // COMMENT conversation but post is NOT livestream (reel, video, etc.)
                this.data.unmarkAsLivestream(conv.id);
                conv.isLivestream = false;
            }

            // Save post_type to Render DB for persistent livestream detection
            if (conv.type === 'COMMENT' && post && postType) {
                this.savePostTypeToServer(conv.id, conv.pageId, conv._raw?.post_id, postType, liveVideoStatus);
            }

            // Update status line
            const statusParts = [];
            if (conv.pageName) statusParts.push(conv.pageName);
            if (conv.type === 'COMMENT') statusParts.push('Bình luận');
            if (conv.isLivestream) statusParts.push('Livestream');
            if (postType && postType !== 'livestream') statusParts.push(postType);
            this.elements.chatUserStatus.textContent = statusParts.join(' · ') || '';
            if (conv.isLivestream !== wasLivestream) this.renderConversationList();

            // Extract phone from response for order form
            // recent_phone_numbers can be string[] or {phone_number}[]
            const rpn = conv._messagesData.recent_phone_numbers?.[0];
            const rpnPhone = typeof rpn === 'string' ? rpn : rpn?.phone_number || '';
            const extractedPhone = conv._messagesData.conv_phone_numbers?.[0]
                || rpnPhone
                || conv._messagesData.customers?.[0]?.recent_phone_numbers?.[0]?.phone_number
                || '';
            if (extractedPhone) conv.phone = extractedPhone;

            // Map Pancake messages to inbox format
            conv.messages = messages.map(msg => {
                const isFromPage = msg.from?.id === conv.pageId;
                // Prefer original_message (clean text) over message (has HTML tags)
                const text = msg.original_message || this.stripHtml(msg.message || '');
                return {
                    id: msg.id,
                    text,
                    time: this.parseTimestamp(msg.inserted_at || msg.created_time) || new Date(),
                    sender: isFromPage ? 'shop' : 'customer',
                    attachments: msg.attachments || [],
                    senderName: msg.from?.name || '',
                    fromId: msg.from?.id || '',
                    reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                    reactionSummary: msg.reaction_summary || msg.reactions || null,
                    phoneInfo: msg.phone_info || [],
                    isHidden: msg.is_hidden || false,
                    isRemoved: msg.is_removed || false,
                    userLikes: msg.user_likes || false,
                    canHide: msg.can_hide !== false,
                    canRemove: msg.can_remove !== false,
                    canLike: msg.can_like !== false,
                };
            });

            // Messages from API are newest-first, reverse for display
            conv.messages.reverse();

            // Reset pagination state
            this.hasMoreMessages = true;
            this.messageCurrentCount = conv.messages.length;

            this.renderMessages(conv);

            // Render customer stats bar and post info
            this.renderCustomerStatsBar(conv);
            this.renderPostInfo(conv);
            this.renderActivities(conv);

            // Auto-fill order form with extracted phone
            if (window.inboxOrders && conv.phone) {
                window.inboxOrders.fillCustomerInfo(conv);
            }

        } catch (error) {
            console.error('[InboxChat] Error loading messages:', error);
            if (this.activeConversationId === conv.id) {
                this.elements.chatMessages.innerHTML = `
                    <div class="chat-empty-state">
                        <p>Lỗi tải tin nhắn: ${this.escapeHtml(error.message)}</p>
                    </div>
                `;
            }
        } finally {
            this.isLoadingMessages = false;
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

        const name = conv.name || 'U';
        const initial = name.charAt(0).toUpperCase();
        const colorIndex = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
        const gradient = AVATAR_GRADIENTS[colorIndex];

        // Build message avatar HTML with 4-tier fallback (like tpos-pancake)
        const fbId = conv._raw?.from?.id || conv._raw?.customers?.[0]?.fb_id || conv.psid || null;
        const directAvatar = conv.avatar || conv._raw?.from?.picture?.data?.url || conv._raw?.from?.profile_pic || conv._raw?.customers?.[0]?.avatar || null;
        let msgAvatarUrl = directAvatar;
        if (window.pancakeDataManager?.getAvatarUrl && fbId) {
            msgAvatarUrl = window.pancakeDataManager.getAvatarUrl(fbId, conv.pageId, null, directAvatar);
        }
        const msgAvatarHtml = (msgAvatarUrl && !msgAvatarUrl.startsWith('data:image/svg'))
            ? `<img src="${msgAvatarUrl}" class="message-avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=\\'message-avatar\\' style=\\'background:${gradient}\\'>${initial}</div>'">`
            : `<div class="message-avatar" style="background:${gradient};">${initial}</div>`;
        let lastDate = '';

        let html = conv.messages.map(msg => {
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
            const isHidden = msg.isHidden || false;
            const isRemoved = msg.isRemoved || false;

            // Build message content (text + attachments)
            let messageContent = '';

            // Render attachments first (above text, like tpos-pancake)
            const mediaAttachments = (msg.attachments || []).filter(a => a.type !== 'reaction');
            if (mediaAttachments.length > 0) {
                messageContent += this.renderAttachments(mediaAttachments);
            }

            if (msg.text) {
                messageContent += `<div class="message-text">${this.formatMessageText(msg.text)}</div>`;
            }

            // Phone tags from phone_info
            const phoneInfo = msg.phoneInfo || [];
            let phoneTagsHtml = '';
            if (phoneInfo.length > 0) {
                phoneTagsHtml = phoneInfo.map(pi =>
                    `<span class="msg-phone-tag" onclick="navigator.clipboard.writeText('${this.escapeHtml(pi.phone_number)}');showToast('Đã copy: ${this.escapeHtml(pi.phone_number)}','success')" title="Click để copy">
                        <i data-lucide="phone"></i> ${this.escapeHtml(pi.phone_number)}
                    </span>`
                ).join('');
            }

            // Reactions (from attachments + reaction_summary)
            const reactions = msg.reactions || [];
            let reactionsHtml = '';
            if (reactions.length > 0) {
                const emojis = reactions.map(r => r.emoji || '❤️').join('');
                reactionsHtml = `<span class="message-reactions">${emojis}</span>`;
            }
            // Also show reaction_summary (LIKE, LOVE, HAHA, WOW, SAD, ANGRY)
            const reactionSummary = msg.reactionSummary;
            if (reactionSummary && typeof reactionSummary === 'object') {
                const reactionIcons = { LIKE: '👍', LOVE: '❤️', HAHA: '😆', WOW: '😮', SAD: '😢', ANGRY: '😠', CARE: '🤗' };
                const parts = Object.entries(reactionSummary)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => `<span class="reaction-badge">${reactionIcons[type] || '👍'}${count > 1 ? ' ' + count : ''}</span>`);
                if (parts.length > 0) {
                    reactionsHtml += `<div class="message-reaction-summary">${parts.join('')}</div>`;
                }
            }

            if (!messageContent && !reactionsHtml && !phoneTagsHtml) {
                messageContent = '<div class="message-text" style="opacity:0.5">[Tin nhắn trống]</div>';
            }

            // Hidden/removed indicator
            let statusIndicator = '';
            if (isRemoved) {
                statusIndicator = '<span class="msg-status-indicator removed" title="Đã xóa"><i data-lucide="trash-2"></i></span>';
            } else if (isHidden) {
                statusIndicator = '<span class="msg-status-indicator hidden-msg" title="Đã ẩn"><i data-lucide="eye-off"></i></span>';
            }

            // Sender name for outgoing messages (staff name)
            const senderHtml = isOutgoing && msg.senderName
                ? `<span class="message-sender">${this.escapeHtml(msg.senderName)}</span>`
                : '';

            // Hover action buttons (like, hide/unhide, delete, reply, react)
            const isComment = conv.type === 'COMMENT';
            const isInbox = conv.type === 'INBOX';
            const likeBtn = isComment ? `<button class="msg-action-btn ${msg.userLikes ? 'liked' : ''}" data-action="like" data-msg-id="${msg.id}" title="${msg.userLikes ? 'Bỏ thích' : 'Thích'}"><i data-lucide="${msg.userLikes ? 'heart' : 'heart'}"></i></button>` : '';
            const replyBtn = (isComment && !isOutgoing) ? `<button class="msg-action-btn" data-action="reply" data-msg-id="${msg.id}" title="Trả lời"><i data-lucide="reply"></i></button>` : '';
            const reactBtn = isComment ? `<button class="msg-action-btn" data-action="react" data-msg-id="${msg.id}" title="React"><i data-lucide="smile-plus"></i></button>` : '';
            const hideBtn = isComment ? `<button class="msg-action-btn ${isHidden ? 'active' : ''}" data-action="hide" data-msg-id="${msg.id}" title="${isHidden ? 'Hiện bình luận' : 'Ẩn bình luận'}"><i data-lucide="${isHidden ? 'eye' : 'eye-off'}"></i></button>` : '';
            const deleteBtn = isComment ? `<button class="msg-action-btn danger" data-action="delete" data-msg-id="${msg.id}" title="Xóa bình luận"><i data-lucide="trash-2"></i></button>` : '';
            const copyBtn = `<button class="msg-action-btn" data-action="copy" data-msg-id="${msg.id}" title="Copy tin nhắn"><i data-lucide="copy"></i></button>`;
            // Reply for inbox messages too
            const inboxReplyBtn = isInbox ? `<button class="msg-action-btn" data-action="reply" data-msg-id="${msg.id}" title="Trả lời"><i data-lucide="reply"></i></button>` : '';
            const actionsHtml = `<div class="msg-hover-actions">${replyBtn}${inboxReplyBtn}${reactBtn}${likeBtn}${hideBtn}${copyBtn}${deleteBtn}</div>`;

            return `
                ${dateSeparator}
                <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'} ${isRemoved ? 'removed' : ''} ${isHidden ? 'hidden-msg' : ''}">
                    ${!isOutgoing ? msgAvatarHtml : ''}
                    <div class="message-bubble">
                        ${messageContent}
                        ${phoneTagsHtml}
                        ${reactionsHtml}
                        ${actionsHtml}
                        <div class="message-meta">
                            ${statusIndicator}
                            ${senderHtml}
                            <span class="message-time">${this.formatMessageTime(msg.time)}</span>
                            ${isOutgoing ? '<span class="message-read-receipt"><i data-lucide="check-check"></i></span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Typing indicator (set via WebSocket)
        if (conv._isCustomerTyping) {
            html += `
                <div class="message-row incoming">
                    ${msgAvatarHtml}
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            `;
        }

        this.elements.chatMessages.innerHTML = html;
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    /**
     * Render attachments (reference: tpos-pancake renderMessage)
     */
    renderAttachments(attachments) {
        return attachments.map(att => {
            const url = att.url || att.file_url || att.preview_url || att.payload?.url || att.src || '';
            if (!url) return '';

            // Image
            if (att.type === 'image' || att.type === 'photo' || att.mime_type?.startsWith('image/')) {
                return `<div class="message-media"><img class="message-image" src="${url}" alt="Ảnh" onclick="window.open('${url}','_blank')" loading="lazy"></div>`;
            }
            // Sticker / GIF
            if (att.type === 'sticker' || att.sticker_id || att.type === 'animated_image_url') {
                return `<div class="message-media"><img class="message-sticker" src="${url}" alt="Sticker" loading="lazy"></div>`;
            }
            // Video
            if (att.type === 'video' || att.mime_type?.startsWith('video/')) {
                return `<div class="message-media"><video controls src="${url}" preload="metadata" style="max-width:240px;border-radius:8px;"></video></div>`;
            }
            // Audio
            if (att.type === 'audio' || att.mime_type?.startsWith('audio/')) {
                return `<div class="message-media"><audio controls src="${url}" preload="metadata"></audio></div>`;
            }
            // File
            if (att.type === 'file' || att.type === 'document') {
                const fileName = att.name || att.filename || 'Tệp đính kèm';
                return `<div class="message-file"><a href="${url}" target="_blank" rel="noopener"><i data-lucide="file-text"></i> ${this.escapeHtml(fileName)}</a></div>`;
            }
            // Like/thumbsup
            if (att.type === 'like' || att.type === 'thumbsup') {
                return `<div class="message-like">👍</div>`;
            }
            return '';
        }).join('');
    }

    /**
     * Get page access token with multi-account fallback
     * Step 1: Check cache
     * Step 2: Try active account generate
     * Step 3: Fallback to other accounts with page access
     */
    async _getPageAccessTokenWithFallback(pageId) {
        const ptm = window.pancakeTokenManager;
        if (!ptm) return null;

        // Step 1: Check cache
        let token = ptm.getPageAccessToken(pageId);
        if (token) return token;

        // Step 2: Try generating with active account
        const activeToken = ptm.currentToken;
        if (activeToken) {
            token = await ptm.generatePageAccessTokenWithToken(pageId, activeToken);
            if (token) return token;
        }

        // Step 3: Fallback to other accounts with page access
        console.log('[InboxChat] Active account cannot access page', pageId, '- trying other accounts...');
        if (Object.keys(ptm.accountPageAccessMap || {}).length === 0) {
            await ptm.prefetchAllAccountPages();
        }
        const fallbackAccount = ptm.findAccountWithPageAccess(pageId, ptm.activeAccountId);
        if (fallbackAccount) {
            console.log('[InboxChat] Fallback account:', fallbackAccount.name);
            token = await ptm.generatePageAccessTokenWithToken(pageId, fallbackAccount.token);
            if (token) return token;
        }

        return null;
    }

    /**
     * Send a real message via Pancake API
     */
    async sendMessage() {
        if (!this.activeConversationId || this.isSending) return;

        const text = this.elements.chatInput.value.trim();
        if (!text) return;

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        this.isSending = true;
        this.elements.btnSend.disabled = true;

        // 24h window check (Facebook messaging policy)
        const windowCheck = this.data.check24hWindow(this.activeConversationId);
        if (!windowCheck.isOpen) {
            showToast('Cửa sổ 24h đã hết hạn. Không thể gửi tin nhắn.', 'warning');
            this.isSending = false;
            this.elements.btnSend.disabled = false;
            return;
        }
        if (windowCheck.hoursRemaining !== null && windowCheck.hoursRemaining <= 2) {
            showToast(`Cửa sổ 24h còn ${windowCheck.hoursRemaining}h. Gửi nhanh!`, 'warning');
        }

        // Capture reply state before clearing
        const replyData = this.replyingTo;
        this.cancelReply();

        // Optimistic UI update
        this.data.addMessage(this.activeConversationId, text, 'shop');
        this.elements.chatInput.value = '';
        this.elements.chatInput.style.height = 'auto';
        this.renderMessages(conv);
        this.renderConversationList();

        try {
            const pageAccessToken = await this._getPageAccessTokenWithFallback(conv.pageId);
            if (!pageAccessToken) {
                throw new Error('Không tìm thấy page_access_token. Không có account nào có quyền truy cập page này.');
            }

            let url, payload;

            if (replyData && replyData.convType === 'COMMENT') {
                // Reply to comment: reply_comment (public) or private_replies
                const commentId = replyData.msgId;
                // For reply_comment, conversationId = commentId
                const conversationId = commentId;
                url = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${conv.pageId}/conversations/${conversationId}/messages`,
                    pageAccessToken
                );

                // Default to reply_comment (public reply on post)
                payload = {
                    action: 'reply_comment',
                    message_id: commentId,
                    message: text
                };

                console.log('[InboxChat] Sending reply_comment:', { pageId: conv.pageId, commentId, text });
            } else {
                // Normal message or inbox reply
                url = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${conv.pageId}/conversations/${conv.conversationId}/messages`,
                    pageAccessToken
                );
                payload = { message: { text } };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.text();
                throw new Error(`HTTP ${response.status}: ${errData}`);
            }

            const successMsg = replyData ? 'Đã trả lời thành công' : 'Đã gửi tin nhắn';
            console.log('[InboxChat]', successMsg);

            // Auto mark as read after sending message
            this.data.markAsRead(this.activeConversationId);
            this.renderConversationList();

            setTimeout(async () => {
                if (this.activeConversationId === conv.id) {
                    await this.loadMessages(conv);
                }
            }, 2000);

        } catch (error) {
            console.error('[InboxChat] Error sending message:', error);
            showToast('Lỗi gửi tin nhắn: ' + error.message, 'error');
        } finally {
            this.isSending = false;
            this.elements.btnSend.disabled = false;
        }
    }

    /**
     * Attach and send an image
     */
    async attachImage() {
        if (!this.activeConversationId) {
            showToast('Vui lòng chọn cuộc hội thoại trước', 'warning');
            return;
        }

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                showToast('Đang tải ảnh lên...', 'info');
                const pdm = window.pancakeDataManager;
                if (!pdm) throw new Error('pancakeDataManager not available');

                const result = await pdm.uploadImage(conv.pageId, file);
                if (result && result.url) {
                    const pageAccessToken = await this._getPageAccessTokenWithFallback(conv.pageId);
                    if (!pageAccessToken) throw new Error('Không tìm thấy page_access_token');
                    const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                        `pages/${conv.pageId}/conversations/${conv.conversationId}/messages`,
                        pageAccessToken
                    );

                    await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: { attachment: { type: 'image', payload: { url: result.url } } }
                        })
                    });

                    showToast('Đã gửi ảnh', 'success');
                    setTimeout(() => this.loadMessages(conv), 2000);
                }
            } catch (err) {
                console.error('[InboxChat] Image upload error:', err);
                showToast('Lỗi tải ảnh: ' + err.message, 'error');
            }
        };
        input.click();
    }

    // ===== Chat Label Bar =====

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

    // ===== Group Stats =====

    renderGroupStats() {
        this.data.recalculateGroupCounts();
        const iconMap = {
            'new': 'inbox', 'processing': 'loader', 'waiting': 'clock',
            'ordered': 'shopping-cart', 'urgent': 'alert-triangle', 'done': 'check-circle',
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
                        <div class="group-stats-card-count"><strong>${group.count}</strong> khách hàng</div>
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
        this.currentGroupFilter = this.currentGroupFilter === groupId ? null : groupId;
        this.renderConversationList();
        this.renderGroupStats();
    }

    updateStarButton(starred) {
        const btn = this.elements.btnStarConversation;
        if (starred) { btn.style.color = '#f59e0b'; btn.title = 'Bỏ đánh dấu'; }
        else { btn.style.color = ''; btn.title = 'Đánh dấu'; }
    }

    // ===== Manage Groups Modal =====

    showManageGroupsModal() {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-title"><i data-lucide="settings"></i> Quản Lý Nhóm</div>
                <div class="modal-body">
                    <div class="modal-group-list" id="modalGroupList">
                        ${this.data.groups.map((group) => `
                            <div class="modal-group-item" data-group-id="${group.id}">
                                <div class="modal-group-color-pick" style="background: ${group.color}"
                                     onclick="window.inboxChat._toggleColorPicker(this, '${group.id}')"></div>
                                <div class="modal-group-fields">
                                    <input type="text" class="modal-group-name-input" value="${this.escapeHtml(group.name)}"
                                           placeholder="Tên nhóm" data-group-id="${group.id}" />
                                    <textarea class="modal-group-note-input" placeholder="Ghi chú"
                                              data-group-id="${group.id}" rows="2">${this.escapeHtml(group.note || '')}</textarea>
                                </div>
                                <button class="modal-group-delete" title="Xóa nhóm"
                                        onclick="window.inboxChat._deleteGroupInModal('${group.id}', this)">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-add-section">
                        <h4>Thêm Nhóm Mới</h4>
                        <div class="modal-add-row">
                            <div class="modal-add-fields">
                                <input type="text" id="modalNewGroupName" placeholder="Tên nhóm mới..." />
                                <textarea id="modalNewGroupNote" placeholder="Ghi chú cho nhóm..." rows="2"></textarea>
                                <div class="modal-color-picker">
                                    ${colors.map((c, i) => `
                                        <div class="color-option ${i === 0 ? 'selected' : ''}" style="background: ${c}" data-color="${c}"
                                             onclick="this.parentElement.querySelectorAll('.color-option').forEach(o=>o.classList.remove('selected'));this.classList.add('selected');"></div>
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

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('btnModalCancel').addEventListener('click', () => overlay.remove());

        document.getElementById('btnModalAddGroup').addEventListener('click', () => {
            const name = document.getElementById('modalNewGroupName').value.trim();
            const note = document.getElementById('modalNewGroupNote').value.trim();
            const color = overlay.querySelector('.modal-add-section .color-option.selected')?.dataset.color || '#3b82f6';
            if (!name) { showToast('Vui lòng nhập tên nhóm', 'warning'); return; }
            this.data.addGroup(name, color, note);
            const newGroup = this.data.groups[this.data.groups.length - 1];
            const listEl = document.getElementById('modalGroupList');
            const newItem = document.createElement('div');
            newItem.className = 'modal-group-item';
            newItem.dataset.groupId = newGroup.id;
            newItem.innerHTML = `
                <div class="modal-group-color-pick" style="background: ${newGroup.color}"
                     onclick="window.inboxChat._toggleColorPicker(this, '${newGroup.id}')"></div>
                <div class="modal-group-fields">
                    <input type="text" class="modal-group-name-input" value="${this.escapeHtml(newGroup.name)}"
                           placeholder="Tên nhóm" data-group-id="${newGroup.id}" />
                    <textarea class="modal-group-note-input" placeholder="Ghi chú"
                              data-group-id="${newGroup.id}" rows="2">${this.escapeHtml(newGroup.note || '')}</textarea>
                </div>
                <button class="modal-group-delete" title="Xóa nhóm"
                        onclick="window.inboxChat._deleteGroupInModal('${newGroup.id}', this)">&times;</button>
            `;
            listEl.appendChild(newItem);
            document.getElementById('modalNewGroupName').value = '';
            document.getElementById('modalNewGroupNote').value = '';
            showToast('Đã thêm nhóm: ' + name, 'success');
        });

        document.getElementById('btnModalSave').addEventListener('click', () => {
            overlay.querySelectorAll('.modal-group-item').forEach(item => {
                const groupId = item.dataset.groupId;
                const nameInput = item.querySelector('.modal-group-name-input');
                const noteInput = item.querySelector('.modal-group-note-input');
                if (nameInput && noteInput) {
                    this.data.updateGroup(groupId, { name: nameInput.value.trim(), note: noteInput.value.trim() });
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
        btnEl.closest('.modal-group-item')?.remove();
        showToast('Đã xóa nhóm', 'success');
    }

    _toggleColorPicker(el, groupId) {
        const existing = el.parentElement.querySelector('.color-popover');
        if (existing) { existing.remove(); return; }
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#6366f1', '#f97316', '#6b7280'];
        const popover = document.createElement('div');
        popover.className = 'color-popover';
        popover.innerHTML = colors.map(c => `<div class="color-option" style="background: ${c}" data-color="${c}"></div>`).join('');
        el.style.position = 'relative';
        el.appendChild(popover);
        popover.addEventListener('click', (e) => {
            const opt = e.target.closest('.color-option');
            if (!opt) return;
            el.style.background = opt.dataset.color;
            this.data.updateGroup(groupId, { color: opt.dataset.color });
            popover.remove();
            e.stopPropagation();
        });
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && e.target !== el) { popover.remove(); document.removeEventListener('click', closeHandler); }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    }

    // ===== Customer Stats Bar (reference: tpos-pancake renderCustomerStatsBar) =====

    renderCustomerStatsBar(conv) {
        const bar = document.getElementById('customerStatsBar');
        if (!bar) return;

        const data = conv._messagesData;
        if (!data) { bar.style.display = 'none'; return; }

        // Phone number
        const phone = conv.phone || '';

        // Comment count
        const commentCount = data.comment_count || 0;

        // Order stats from reports_by_phone or customer data
        let successOrders = 0, failOrders = 0;
        const customer = data.customers?.[0];

        if (phone && data.reports_by_phone) {
            // Try both formats: "0944333435" and "+84944333435"
            const phoneKey = Object.keys(data.reports_by_phone).find(k =>
                k.includes(phone.replace(/^0/, '')) || k === phone
            );
            if (phoneKey) {
                const report = data.reports_by_phone[phoneKey];
                successOrders = report.order_success || 0;
                failOrders = report.order_fail || 0;
            }
        }
        if (!successOrders && customer) {
            successOrders = customer.succeed_order_count || customer.order_count || 0;
        }

        const totalOrders = successOrders + failOrders;
        const returnRate = totalOrders > 0 ? Math.round((failOrders / totalOrders) * 100) : 0;
        const isWarning = returnRate > 30;

        // Phone badge
        const phoneBadge = phone
            ? `<span class="phone-badge" onclick="navigator.clipboard.writeText('${this.escapeHtml(phone)}');showToast('Đã copy: ${this.escapeHtml(phone)}','success')" title="Click để copy">
                    <i data-lucide="phone"></i>
                    <span>${this.escapeHtml(phone)}</span>
               </span>`
            : '';

        bar.innerHTML = `
            <div class="stats-left">${phoneBadge}</div>
            <div class="stats-right">
                <span class="stat-badge comment" title="Đã bình luận ${commentCount} lần">
                    <i data-lucide="message-square"></i><span>${commentCount}</span>
                </span>
                <span class="stat-badge success" title="Đơn thành công: ${successOrders}">
                    <i data-lucide="check-circle"></i><span>${successOrders}</span>
                </span>
                <span class="stat-badge return" title="Đơn hoàn: ${failOrders}">
                    <i data-lucide="undo-2"></i><span>${failOrders}</span>
                </span>
                ${isWarning ? `
                    <span class="stat-badge warning" title="Tỉ lệ hoàn ${returnRate}%">
                        <i data-lucide="alert-triangle"></i>
                    </span>
                ` : ''}
            </div>
        `;
        bar.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Post Info Banner (livestream post thumbnail + title) =====

    renderPostInfo(conv) {
        const banner = document.getElementById('postInfoBanner');
        if (!banner) return;

        const post = conv._messagesData?.post;
        if (!post || !post.message) {
            banner.style.display = 'none';
            return;
        }

        const isLivestream = post.type === 'livestream';
        const thumbnail = post.attachments?.data?.[0]?.url || '';
        const postUrl = post.attachments?.target?.url || '';
        const title = post.message || '';
        const truncatedTitle = title.length > 100 ? title.substring(0, 100) + '...' : title;
        const liveStatus = post.live_video_status;
        const statusBadge = isLivestream
            ? `<span class="post-status-badge ${liveStatus === 'vod' ? 'vod' : 'live'}">${liveStatus === 'vod' ? 'VOD' : 'LIVE'}</span>`
            : `<span class="post-status-badge video">${post.type || 'POST'}</span>`;

        banner.innerHTML = `
            ${thumbnail ? `<img class="post-thumbnail" src="${thumbnail}" alt="Post" onclick="${postUrl ? `window.open('${postUrl}','_blank')` : ''}">` : ''}
            <div class="post-info-content">
                <div class="post-info-header">
                    ${statusBadge}
                    <span class="post-page-name">${this.escapeHtml(post.from?.name || conv.pageName || '')}</span>
                </div>
                <div class="post-info-title" title="${this.escapeHtml(title)}">${this.escapeHtml(truncatedTitle)}</div>
                ${postUrl ? `<a class="post-info-link" href="${postUrl}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Xem trên Facebook</a>` : ''}
            </div>
        `;
        banner.style.display = 'flex';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Activities Panel (col3 tab) =====

    renderActivities(conv) {
        const container = document.getElementById('tabActivities');
        if (!container) return;

        const activities = conv._messagesData?.activities || [];

        if (activities.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;color:var(--text-tertiary);padding:2rem;">
                    <i data-lucide="activity" style="width:32px;height:32px;opacity:0.5;"></i>
                    <p style="margin-top:0.5rem;">Chưa có hoạt động</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        container.innerHTML = `
            <div class="activities-header">
                <h3>Hoạt động trên ${activities.length} bài viết</h3>
            </div>
            <div class="activities-list">
                ${activities.map(act => {
                    const thumb = act.attachments?.data?.[0]?.url || '';
                    const actUrl = act.attachments?.target?.url || '';
                    const actTitle = act.message || '';
                    const truncTitle = actTitle.length > 80 ? actTitle.substring(0, 80) + '...' : actTitle;
                    const actTime = act.inserted_at ? this.formatDate(act.inserted_at) : '';
                    return `
                        <div class="activity-item" ${actUrl ? `onclick="window.open('${actUrl}','_blank')"` : ''}>
                            ${thumb ? `<img class="activity-thumb" src="${thumb}" alt="">` : '<div class="activity-thumb-ph"><i data-lucide="video"></i></div>'}
                            <div class="activity-content">
                                <div class="activity-title">${this.escapeHtml(truncTitle)}</div>
                                <div class="activity-time">${actTime}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Strip HTML helper =====

    stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // ===== Message Pagination (like tpos-pancake) =====

    async loadMoreMessages() {
        if (this.isLoadingMoreMessages || !this.hasMoreMessages || !this.activeConversationId) return;

        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv || !conv.messages || conv.messages.length === 0) return;

        this.isLoadingMoreMessages = true;
        const container = this.elements.chatMessages;
        const scrollHeightBefore = container.scrollHeight;

        // Show loading indicator at top
        const loader = document.createElement('div');
        loader.className = 'load-more-indicator';
        loader.innerHTML = '<div class="loading-spinner" style="width:24px;height:24px;"></div><span>Đang tải tin nhắn cũ...</span>';
        container.insertBefore(loader, container.firstChild);

        try {
            const pdm = window.pancakeDataManager;
            const result = await pdm.fetchMessagesForConversation(
                conv.pageId, conv.conversationId, this.messageCurrentCount, conv.customerId
            );

            if (this.activeConversationId !== conv.id) return;
            loader.remove();

            const olderMessages = result.messages || [];
            if (olderMessages.length === 0) {
                this.hasMoreMessages = false;
                const endMarker = document.createElement('div');
                endMarker.className = 'chat-date-separator';
                endMarker.innerHTML = '<span>— Đầu cuộc hội thoại —</span>';
                container.insertBefore(endMarker, container.firstChild);
            } else {
                const mapped = olderMessages.map(msg => {
                    const isFromPage = msg.from?.id === conv.pageId;
                    return {
                        id: msg.id,
                        text: msg.original_message || this.stripHtml(msg.message || ''),
                        time: this.parseTimestamp(msg.inserted_at || msg.created_time) || new Date(),
                        sender: isFromPage ? 'shop' : 'customer',
                        attachments: msg.attachments || [],
                        senderName: msg.from?.name || '',
                        fromId: msg.from?.id || '',
                        reactions: (msg.attachments || []).filter(a => a.type === 'reaction'),
                        reactionSummary: msg.reaction_summary || msg.reactions || null,
                        phoneInfo: msg.phone_info || [],
                        isHidden: msg.is_hidden || false,
                        isRemoved: msg.is_removed || false,
                        userLikes: msg.user_likes || false,
                        canHide: msg.can_hide !== false,
                        canRemove: msg.can_remove !== false,
                        canLike: msg.can_like !== false,
                    };
                }).reverse();

                conv.messages = [...mapped, ...conv.messages];
                this.messageCurrentCount = conv.messages.length;
                this.renderMessages(conv);

                // Maintain scroll position
                const scrollHeightAfter = container.scrollHeight;
                container.scrollTop = scrollHeightAfter - scrollHeightBefore;
            }
        } catch (error) {
            console.error('[InboxChat] Error loading more messages:', error);
            loader.remove();
        } finally {
            this.isLoadingMoreMessages = false;
        }
    }

    // ===== Quick Replies (like tpos-pancake) =====

    renderQuickReplies() {
        // Quick reply bar disabled
        const bar = document.getElementById('quickReplyBar');
        if (bar) bar.style.display = 'none';
    }

    // ===== File Attachment =====

    async attachFile() {
        if (!this.activeConversationId) {
            showToast('Vui lòng chọn cuộc hội thoại trước', 'warning');
            return;
        }
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 25 * 1024 * 1024) {
                showToast('File quá lớn (tối đa 25MB)', 'warning');
                return;
            }
            try {
                showToast('Đang tải file lên...', 'info');
                const pdm = window.pancakeDataManager;
                if (!pdm) throw new Error('pancakeDataManager not available');

                const result = await pdm.uploadImage(conv.pageId, file);
                if (result && result.url) {
                    const pageAccessToken = await this._getPageAccessTokenWithFallback(conv.pageId);
                    if (!pageAccessToken) throw new Error('Không tìm thấy page_access_token');
                    const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                        `pages/${conv.pageId}/conversations/${conv.conversationId}/messages`,
                        pageAccessToken
                    );
                    await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: { attachment: { type: 'file', payload: { url: result.url } } } })
                    });
                    showToast('Đã gửi file: ' + file.name, 'success');
                    setTimeout(() => this.loadMessages(conv), 2000);
                }
            } catch (err) {
                console.error('[InboxChat] File upload error:', err);
                showToast('Lỗi tải file: ' + err.message, 'error');
            }
        };
        input.click();
    }

    // ===== Emoji Grid =====

    renderEmojiGrid(category) {
        const grid = document.getElementById('emojiGrid');
        if (!grid || !this.emojiData[category]) return;
        grid.innerHTML = this.emojiData[category].map(e => `<button class="emoji-item">${e}</button>`).join('');
    }

    // ===== Message Actions (like, hide/unhide, delete, copy) =====

    async handleMessageAction(action, msgId, btn) {
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;
        const msg = conv.messages?.find(m => m.id === msgId);
        if (!msg) return;
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        try {
            if (action === 'like') {
                btn.disabled = true;
                if (msg.userLikes) {
                    const ok = await pdm.unlikeComment(conv.pageId, msgId);
                    if (ok) { msg.userLikes = false; btn.classList.remove('liked'); btn.title = 'Thích'; }
                } else {
                    const ok = await pdm.likeComment(conv.pageId, msgId);
                    if (ok) { msg.userLikes = true; btn.classList.add('liked'); btn.title = 'Bỏ thích'; }
                }
                btn.disabled = false;
            } else if (action === 'hide') {
                btn.disabled = true;
                if (msg.isHidden) {
                    const ok = await pdm.unhideComment(conv.pageId, msgId);
                    if (ok) {
                        msg.isHidden = false;
                        showToast('Đã hiện bình luận', 'success');
                        this.renderMessages(conv);
                    }
                } else {
                    const ok = await pdm.hideComment(conv.pageId, msgId);
                    if (ok) {
                        msg.isHidden = true;
                        showToast('Đã ẩn bình luận', 'success');
                        this.renderMessages(conv);
                    }
                }
                btn.disabled = false;
            } else if (action === 'delete') {
                if (!confirm('Xóa bình luận này?')) return;
                btn.disabled = true;
                const ok = await pdm.deleteComment(conv.pageId, msgId);
                if (ok) {
                    msg.isRemoved = true;
                    showToast('Đã xóa bình luận', 'success');
                    this.renderMessages(conv);
                }
                btn.disabled = false;
            } else if (action === 'copy') {
                if (msg.text) {
                    await navigator.clipboard.writeText(msg.text);
                    showToast('Đã copy', 'success');
                }
            } else if (action === 'reply') {
                this.setReplyingTo(msg, conv);
            } else if (action === 'react') {
                this.showReactionPicker(msgId, btn);
            }
        } catch (error) {
            console.error('[InboxChat] Message action error:', error);
            showToast('Lỗi: ' + error.message, 'error');
            btn.disabled = false;
        }
    }

    // ===== Save Post Type to Render DB =====

    savePostTypeToServer(conversationId, pageId, postId, postType, liveVideoStatus) {
        const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        fetch(`${workerUrl}/api/realtime/post-type`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, pageId, postId, postType, liveVideoStatus })
        }).then(r => {
            if (r.ok) console.log(`[InboxChat] Saved post_type=${postType} for ${conversationId}`);
        }).catch(err => {
            console.warn('[InboxChat] Failed to save post_type:', err.message);
        });
    }

    // ===== Reply to Message =====

    setReplyingTo(msg, conv) {
        this.replyingTo = {
            msgId: msg.id,
            text: msg.text || '[Tệp đính kèm]',
            senderName: msg.senderName || (msg.sender === 'shop' ? 'Bạn' : conv.name),
            isOutgoing: msg.sender === 'shop',
            fromId: msg.fromId || '',
            convType: conv.type,
        };

        const bar = document.getElementById('replyPreviewBar');
        const sender = document.getElementById('replyPreviewSender');
        const msgEl = document.getElementById('replyPreviewMsg');
        if (bar && sender && msgEl) {
            sender.textContent = this.replyingTo.senderName;
            msgEl.textContent = this.replyingTo.text.length > 80
                ? this.replyingTo.text.substring(0, 80) + '...'
                : this.replyingTo.text;
            bar.style.display = 'flex';
        }
        this.elements.chatInput.focus();
    }

    cancelReply() {
        this.replyingTo = null;
        const bar = document.getElementById('replyPreviewBar');
        if (bar) bar.style.display = 'none';
    }

    // ===== Reaction Picker =====

    showReactionPicker(msgId, btn) {
        const picker = document.getElementById('reactionPicker');
        if (!picker) return;

        // Position near the button
        const rect = btn.getBoundingClientRect();
        const chatArea = document.getElementById('col2');
        const chatRect = chatArea ? chatArea.getBoundingClientRect() : { left: 0, top: 0 };

        picker.style.left = (rect.left - chatRect.left) + 'px';
        picker.style.top = (rect.top - chatRect.top - 44) + 'px';
        picker.dataset.msgId = msgId;
        picker.style.display = 'flex';

        // Close on outside click
        const closeHandler = (e) => {
            if (!picker.contains(e.target) && !btn.contains(e.target)) {
                picker.style.display = 'none';
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }

    async sendReaction(msgId, reactionType) {
        const conv = this.data.getConversation(this.activeConversationId);
        if (!conv) return;

        const picker = document.getElementById('reactionPicker');
        if (picker) picker.style.display = 'none';

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm) throw new Error('pancakeDataManager not available');

            // Use likeComment for LIKE, or the specific reaction API if available
            if (reactionType === 'LIKE') {
                const msg = conv.messages?.find(m => m.id === msgId);
                if (msg?.userLikes) {
                    await pdm.unlikeComment(conv.pageId, msgId);
                    msg.userLikes = false;
                } else {
                    await pdm.likeComment(conv.pageId, msgId);
                    if (msg) msg.userLikes = true;
                }
            } else {
                // For other reactions, use the reaction API if available
                // Pancake uses likeComment with reaction_type parameter
                const pageAccessToken = await this._getPageAccessTokenWithFallback(conv.pageId);
                if (!pageAccessToken) throw new Error('Không tìm thấy page_access_token');

                const url = window.API_CONFIG.buildUrl.pancakeOfficial(
                    `pages/${conv.pageId}/comments/${msgId}/reactions`,
                    pageAccessToken
                );
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reaction_type: reactionType })
                });
                if (!response.ok) {
                    // Fallback: try likeComment
                    await pdm.likeComment(conv.pageId, msgId);
                    const msg = conv.messages?.find(m => m.id === msgId);
                    if (msg) msg.userLikes = true;
                }
            }

            showToast('Đã react', 'success');
            // Refresh messages to show updated reactions
            setTimeout(() => this.loadMessages(conv), 1000);
        } catch (error) {
            console.error('[InboxChat] Reaction error:', error);
            showToast('Lỗi react: ' + error.message, 'error');
        }
    }

    // ===== Search (2-tier: local + API, like tpos-pancake) =====

    async performSearch(query) {
        if (!query || query.length < 2) return;

        this.isSearching = true;

        // Show loading if no local results
        const localResults = this.data.getConversations({ search: query });
        if (localResults.length === 0) {
            this.renderConversationList();
        }

        try {
            const pdm = window.pancakeDataManager;
            if (!pdm || !pdm.searchConversations) {
                this.isSearching = false;
                return;
            }

            const result = await pdm.searchConversations(query);
            // Only update if query hasn't changed while waiting
            if (this.searchQuery !== query) return;

            if (result && result.conversations) {
                this.searchResults = result.conversations;
            } else {
                this.searchResults = [];
            }

            this.renderConversationList();
        } catch (error) {
            console.error('[InboxChat] Search error:', error);
            this.searchResults = [];
            this.renderConversationList();
        } finally {
            this.isSearching = false;
        }
    }

    // ===== WebSocket Real-Time (Phoenix Protocol v2.0.0, like tpos-pancake) =====

    async initializeWebSocket() {
        if (this.isSocketConnected || this.isSocketConnecting) return true;

        try {
            const ptm = window.pancakeTokenManager;
            if (!ptm) return false;

            this.wsToken = await ptm.getToken();
            if (!this.wsToken) {
                console.warn('[InboxChat] No Pancake token for WebSocket');
                return false;
            }

            // Decode token to get userId
            try {
                const parts = this.wsToken.split('.');
                if (parts.length >= 2) {
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    this.userId = payload.uid || payload.user_id || payload.sub;
                }
            } catch (e) {
                console.warn('[InboxChat] Failed to decode JWT:', e);
                return false;
            }

            if (!this.userId) {
                console.warn('[InboxChat] No userId from JWT');
                return false;
            }

            // Get pageIds for channel join
            const pdm = window.pancakeDataManager;
            this.wsPageIds = (pdm && pdm.pageIds) ? pdm.pageIds.map(id => String(id)) : [];

            this.isSocketConnecting = true;
            // Match orders-report: NO token in URL, token sent via channel join payload
            const wsUrl = `wss://pancake.vn/socket/websocket?vsn=2.0.0`;
            console.log('[InboxChat] Connecting WebSocket...');

            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => this.onSocketOpen();
            this.socket.onclose = (e) => this.onSocketClose(e);
            this.socket.onerror = (e) => {
                console.error('[InboxChat] WebSocket error:', e);
                this.isSocketConnecting = false;
            };
            this.socket.onmessage = (e) => this.onSocketMessage(e);

            return true;
        } catch (error) {
            console.error('[InboxChat] WebSocket init error:', error);
            this.isSocketConnecting = false;
            return false;
        }
    }

    onSocketOpen() {
        console.log('[InboxChat] WebSocket connected');
        this.isSocketConnected = true;
        this.isSocketConnecting = false;
        this.socketReconnectAttempts = 0;
        this.socketReconnectDelay = 2000;

        this.joinChannels();
        this.startHeartbeat();
        this.updateSocketStatusUI(true);
        this.stopAutoRefresh();
    }

    onSocketClose(event) {
        console.log('[InboxChat] WebSocket closed:', event.code, event.reason);
        this.isSocketConnected = false;
        this.isSocketConnecting = false;
        this.stopHeartbeat();
        this.updateSocketStatusUI(false);

        // Reconnect with backoff (match orders-report: simple 5s reconnect)
        if (this.socketReconnectAttempts < this.socketMaxReconnectAttempts) {
            this.socketReconnectAttempts++;
            const delay = this.socketReconnectDelay;
            this.socketReconnectDelay = Math.min(delay * 1.5, 15000);
            console.log(`[InboxChat] Reconnecting in ${delay}ms (attempt ${this.socketReconnectAttempts}/${this.socketMaxReconnectAttempts})...`);
            this.socketReconnectTimer = setTimeout(() => this.initializeWebSocket(), delay);
        } else {
            console.log('[InboxChat] Max reconnect attempts reached, falling back to polling');
            this.startAutoRefresh();
        }
    }

    onSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            const [joinRef, ref, topic, eventName, payload] = data;

            if (eventName === 'phx_reply') return;

            if (eventName === 'pages:update_conversation' || eventName === 'update_conversation') {
                this.handleConversationUpdate(payload);
            } else if (eventName === 'pages:new_message' || eventName === 'new_message') {
                this.handleNewMessage(payload);
            }
        } catch (e) {
            // Ignore parse errors for heartbeat responses etc.
        }
    }

    joinChannels() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.userId) return;

        // 1. Join user channel (match orders-report realtime-manager.js)
        this.sendPhxMessage(`users:${this.userId}`, 'phx_join', {
            accessToken: this.wsToken,
            userId: this.userId,
            platform: 'web'
        });

        // 2. Join multi-page channel with pageIds and clientSession
        this.sendPhxMessage(`multiple_pages:${this.userId}`, 'phx_join', {
            accessToken: this.wsToken,
            userId: this.userId,
            clientSession: this._generateClientSession(),
            pageIds: this.wsPageIds || [],
            platform: 'web'
        });

        // 3. Get online status after join
        setTimeout(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.sendPhxMessage(`multiple_pages:${this.userId}`, 'get_online_status', {});
            }
        }, 1000);

        console.log('[InboxChat] Joined channels for userId:', this.userId, 'pages:', this.wsPageIds?.length || 0);
    }

    _generateClientSession() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    sendPhxMessage(topic, event, payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socketJoinRef++;
        this.socketMsgRef++;
        const msg = [this.socketJoinRef.toString(), this.socketMsgRef.toString(), topic, event, payload];
        this.socket.send(JSON.stringify(msg));
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.sendPhxMessage('phoenix', 'heartbeat', {});
        }, this.HEARTBEAT_INTERVAL);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    handleConversationUpdate(payload) {
        const conversation = payload?.conversation || payload;
        if (!conversation || !conversation.id) return;

        const existing = this.data.getConversation(conversation.id);
        if (existing) {
            existing.lastMessage = conversation.snippet || existing.lastMessage;
            existing.time = this.parseTimestamp(conversation.updated_at) || new Date();
            existing.unread = conversation.unread_count ?? existing.unread;
            if (conversation.tags) existing._raw.tags = conversation.tags;
        } else {
            // New conversation
            const mapped = this.data.mapConversation(conversation);
            this.data.conversations.unshift(mapped);
            this.data.buildMaps();
        }

        this.data.conversations.sort((a, b) => b.time - a.time);
        this.renderConversationList();
        this.renderGroupStats();
    }

    handleNewMessage(payload) {
        const message = payload?.message || payload;
        if (!message) return;

        const convId = message.conversation_id;
        if (!convId) return;

        const conv = this.data.getConversation(convId);
        if (conv) {
            conv.time = new Date();
            conv.lastMessage = message.original_message || message.message || conv.lastMessage;
            this.data.conversations.sort((a, b) => b.time - a.time);
            this.renderConversationList();

            // If this is the active conversation, reload messages
            if (this.activeConversationId === convId) {
                this.loadMessages(conv);
            }
        }
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.autoRefreshInterval = setInterval(async () => {
            try {
                await this.data.loadConversations(true);
                this.renderConversationList();
                this.renderGroupStats();
            } catch (e) {
                console.warn('[InboxChat] Auto-refresh error:', e);
            }
        }, this.AUTO_REFRESH_INTERVAL);
        console.log('[InboxChat] Auto-refresh started (every 30s)');
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    closeWebSocket() {
        this.stopHeartbeat();
        this.stopAutoRefresh();
        if (this.socketReconnectTimer) clearTimeout(this.socketReconnectTimer);
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }
        this.isSocketConnected = false;
        this.isSocketConnecting = false;
    }

    // ===== WebSocket Status Indicator =====

    updateSocketStatusUI(connected) {
        const el = document.getElementById('wsStatus');
        if (!el) return;
        if (connected) {
            el.innerHTML = '<i data-lucide="wifi"></i>';
            el.title = 'Realtime: Đã kết nối';
            el.className = 'ws-status connected';
        } else {
            el.innerHTML = '<i data-lucide="wifi-off"></i>';
            el.title = 'Realtime: Mất kết nối';
            el.className = 'ws-status disconnected';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ===== Page Unread Counts =====

    async updatePageUnreadCounts() {
        const pdm = window.pancakeDataManager;
        if (!pdm?.fetchPagesWithUnreadCount) {
            // Fallback: count from loaded conversations
            this.pageUnreadCounts = {};
            for (const conv of this.data.conversations) {
                if (conv.unread > 0 && conv.pageId) {
                    this.pageUnreadCounts[conv.pageId] = (this.pageUnreadCounts[conv.pageId] || 0) + 1;
                }
            }
            this.renderPageSelector();
            return;
        }
        try {
            const unreadData = await pdm.fetchPagesWithUnreadCount();
            if (!unreadData || unreadData.length === 0) return;
            this.pageUnreadCounts = {};
            for (const item of unreadData) {
                this.pageUnreadCounts[item.page_id] = item.unread_conv_count || 0;
            }
            this.renderPageSelector();
        } catch (err) {
            console.warn('[InboxChat] Error fetching unread counts:', err);
        }
    }

    // ===== Utility Methods =====

    getLabelClass(label) {
        return { 'new': 'label-new', 'processing': 'label-processing', 'waiting': 'label-waiting',
                 'ordered': 'label-done', 'urgent': 'label-urgent', 'done': 'label-done' }[label] || 'label-new';
    }

    getLabelText(label) {
        const group = this.data.groups.find(g => g.id === label);
        if (group) return group.name;
        return { 'new': 'Mới', 'processing': 'Đang XL', 'waiting': 'Chờ PH',
                 'ordered': 'Đã Đặt', 'urgent': 'Cần Gấp', 'done': 'Xong' }[label] || label;
    }

    /**
     * Parse timestamp from Pancake API to proper Date object
     * Handles UTC timestamps without timezone suffix
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return null;
        try {
            let date;
            if (typeof timestamp === 'string') {
                if (!timestamp.includes('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
                    date = new Date(timestamp + 'Z');
                } else {
                    date = new Date(timestamp);
                }
            } else if (typeof timestamp === 'number') {
                date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
            } else {
                date = new Date(timestamp);
            }
            return isNaN(date.getTime()) ? null : date;
        } catch (error) {
            return null;
        }
    }

    /**
     * Format time for conversation list - always Vietnam timezone (GMT+7)
     */
    formatTime(timestamp) {
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';

        try {
            const now = new Date();
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
            });

            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);
            const getVal = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

            const isSameDay = getVal(dateParts, 'year') === getVal(nowParts, 'year') &&
                              getVal(dateParts, 'month') === getVal(nowParts, 'month') &&
                              getVal(dateParts, 'day') === getVal(nowParts, 'day');

            if (isSameDay) {
                return new Intl.DateTimeFormat('vi-VN', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hour12: false
                }).format(date);
            }

            const vnDateObj = new Date(getVal(dateParts, 'year'), getVal(dateParts, 'month') - 1, getVal(dateParts, 'day'));
            const vnNowObj = new Date(getVal(nowParts, 'year'), getVal(nowParts, 'month') - 1, getVal(nowParts, 'day'));
            const diffDays = Math.floor((vnNowObj - vnDateObj) / 86400000);

            if (diffDays > 0 && diffDays < 7) {
                const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(date);
                const days = { 'Sun': 'CN', 'Mon': 'T2', 'Tue': 'T3', 'Wed': 'T4', 'Thu': 'T5', 'Fri': 'T6', 'Sat': 'T7' };
                return days[dayOfWeek] || dayOfWeek;
            }

            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
            }).format(date);
        } catch (error) {
            return '';
        }
    }

    formatDate(timestamp) {
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';

        try {
            const now = new Date();
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);
            const getVal = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

            const dateKey = `${getVal(dateParts, 'year')}-${getVal(dateParts, 'month')}-${getVal(dateParts, 'day')}`;
            const nowKey = `${getVal(nowParts, 'year')}-${getVal(nowParts, 'month')}-${getVal(nowParts, 'day')}`;

            if (dateKey === nowKey) return 'Hôm nay';

            const vnDateObj = new Date(getVal(dateParts, 'year'), getVal(dateParts, 'month') - 1, getVal(dateParts, 'day'));
            const vnNowObj = new Date(getVal(nowParts, 'year'), getVal(nowParts, 'month') - 1, getVal(nowParts, 'day'));
            if (vnNowObj - vnDateObj === 86400000) return 'Hôm qua';

            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
            }).format(date);
        } catch (error) {
            return '';
        }
    }

    formatMessageTime(timestamp) {
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hour12: false
        }).format(date);
    }

    formatMessageText(text) {
        let safe = this.escapeHtml(text);
        safe = safe.replace(/(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">$1</a>');
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export globally
window.InboxChatController = InboxChatController;
