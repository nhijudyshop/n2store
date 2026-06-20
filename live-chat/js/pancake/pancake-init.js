// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PANCAKE INIT - Orchestrate Pancake column initialization
// =====================================================

const PancakeColumnManager = {
    container: null,

    async initialize(containerId) {
        containerId = containerId || 'pancakeContent';
        console.log('[PK-INIT] Initializing Pancake column...');

        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[PK-INIT] Container not found:', containerId);
            return false;
        }

        // Render skeleton UI (same HTML as original PancakeChatManager.render())
        this._renderShell();
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Wait for token manager
        if (window.pancakeTokenManager) {
            await window.pancakeTokenManager.initialize();
        }

        // Load pages and conversations
        await window.PancakePageSelector.loadPages();
        await this._loadConversations();

        // Bind all events
        this._bindEvents();

        // Realtime: SSE `web2:messages` (nguồn chung) — KHÔNG còn WebSocket riêng.
        // connect()/connectServerMode() đều = wire SSE (idempotent), relay server
        // đã chạy 24/7 đẩy tin Pancake → SSE. Xem pancake-realtime.js.
        await window.PancakeRealtime.connect();

        // Listen for realtime manager events (from realtime-manager.js)
        window.addEventListener('realtimeConversationUpdate', function (e) {
            window.PancakeRealtime._handleUpdateConversation(e.detail);
        });

        // Listen for Live saved list updates
        window.addEventListener('liveSavedListUpdated', async function () {
            var state = window.PancakeState;
            if (state.activeFilter === 'live-saved') {
                await window.PancakeAPI.loadLiveSavedIds();
                window.PancakeConversationList.renderConversationList();
            }
        });

        // Listen for chatApiSourceChanged (mode changes)
        window.addEventListener('chatApiSourceChanged', function (e) {
            var isRealtime = e.detail.realtime;
            var source = e.detail.source;
            var mode = e.detail.realtimeMode || 'browser';
            window.PancakeRealtime.disconnect();
            if (isRealtime && source === 'pancake') {
                if (mode === 'browser') window.PancakeRealtime.connect();
                else window.PancakeRealtime.connectServerMode();
            }
        });

        console.log('[PK-INIT] Initialized successfully');
        return true;
    },

    async _loadConversations() {
        var state = window.PancakeState;
        state.isLoading = true;
        this._renderLoadingState();
        try {
            var conversations = await window.PancakeAPI.fetchConversations(true);
            state.conversations = conversations || [];
            window.PancakeConversationList.renderConversationList();
            window.PancakeAPI.loadDebtForConversations(state.conversations);
            this._preloadPageAccessTokens();
        } catch (error) {
            console.error('[PK-INIT] Error loading conversations:', error);
            this._renderErrorState('Không thể tải danh sách hội thoại');
        } finally {
            state.isLoading = false;
        }
    },

    async _preloadPageAccessTokens() {
        if (!window.pancakeTokenManager) return;
        var state = window.PancakeState;
        var pageIds = [];
        var seen = {};
        state.conversations.forEach(function (conv) {
            if (conv.page_id && !seen[conv.page_id]) {
                seen[conv.page_id] = true;
                pageIds.push(conv.page_id);
            }
        });
        var promises = pageIds.map(function (pid) {
            return window.pancakeTokenManager
                .getOrGeneratePageAccessToken(pid)
                .catch(function () {});
        });
        await Promise.race([
            Promise.all(promises),
            new Promise(function (r) {
                setTimeout(r, 5000);
            }),
        ]);
    },

    _bindEvents() {
        var self = this;
        // Header Tabs
        document.querySelectorAll('.pk-header-tab').forEach(function (tab) {
            tab.addEventListener('click', function (e) {
                self._switchTab(e.currentTarget.dataset.tab);
            });
        });

        // Page Selector
        var pageSelectorBtn = document.getElementById('pkPageSelectorBtn');
        if (pageSelectorBtn) {
            pageSelectorBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                window.PancakePageSelector.toggleDropdown();
            });
        }
        var pageList = document.getElementById('pkPageList');
        if (pageList) {
            pageList.addEventListener('click', function (e) {
                var item = e.target.closest('.pk-page-item');
                if (item) window.PancakePageSelector.selectPage(item.dataset.pageId);
            });
        }
        document.addEventListener('click', function (e) {
            var dropdown = document.getElementById('pkPageDropdown');
            var btn = document.getElementById('pkPageSelectorBtn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                dropdown.classList.remove('show');
                if (btn) btn.classList.remove('active');
                window.PancakeState.isPageDropdownOpen = false;
            }
        });

        // Filter Tabs (theo người) — dùng closest vì tab Livestream có <i> bên trong.
        var filterTabs = document.querySelectorAll('.pk-filter-tab');
        filterTabs.forEach(function (tab) {
            tab.addEventListener('click', function (e) {
                var btn = e.target.closest('.pk-filter-tab');
                if (!btn) return;
                filterTabs.forEach(function (t) {
                    t.classList.remove('active');
                });
                btn.classList.add('active');
                window.PancakeConversationList.applyFilter(btn.dataset.filter);
            });
        });

        // Sub-filter loại hội thoại (tin nhắn / bình luận) — áp cho mọi tab.
        var subBtns = document.querySelectorAll('.pk-subfilter-btn');
        subBtns.forEach(function (b) {
            b.addEventListener('click', function (e) {
                var btn = e.target.closest('.pk-subfilter-btn');
                if (!btn) return;
                subBtns.forEach(function (t) {
                    t.classList.remove('active');
                });
                btn.classList.add('active');
                window.PancakeConversationList.applyTypeFilter(btn.dataset.type);
            });
        });

        // Khởi tạo bộ lọc chiến dịch livestream (render thanh chọn + load set commenter).
        if (window.PancakeLivestreamFilter) {
            try {
                window.PancakeLivestreamFilter.init();
            } catch (e) {
                console.warn('[LS-FILTER] init', e);
            }
        }

        // Search
        var searchInput = document.getElementById('pkSearchInput');
        if (searchInput) {
            var searchTimeout = null;
            searchInput.addEventListener('input', function (e) {
                var query = e.target.value.trim();
                if (searchTimeout) clearTimeout(searchTimeout);
                window.PancakeConversationList.handleSearch(query);
                if (query && query.length >= 2) {
                    searchTimeout = setTimeout(function () {
                        window.PancakeConversationList.performApiSearch(query);
                    }, 300);
                }
            });
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    window.PancakeConversationList.clearSearch();
                }
            });
        }

        // Conversation click + infinite scroll + context menu
        var convsContainer = document.getElementById('pkConversations');
        if (convsContainer) {
            convsContainer.addEventListener('click', function (e) {
                var item = e.target.closest('.pk-conversation-item');
                if (item) window.PancakeConversationList.selectConversation(item.dataset.convId);
            });
            convsContainer.addEventListener('scroll', function () {
                var threshold = 100;
                var state = window.PancakeState;
                var isNear =
                    convsContainer.scrollHeight -
                        convsContainer.scrollTop -
                        convsContainer.clientHeight <
                    threshold;
                if (
                    isNear &&
                    state.hasMoreConversations &&
                    !state.isLoadingMoreConversations &&
                    !state.searchResults &&
                    state.conversations.length > 0
                ) {
                    window.PancakeConversationList.loadMore();
                }
            });
            convsContainer.addEventListener('contextmenu', function (e) {
                var item = e.target.closest('.pk-conversation-item');
                if (item) {
                    e.preventDefault();
                    window.PancakeContextMenu.show(e, item.dataset.convId, item.dataset.pageId);
                }
            });
        }

        // Context menu actions
        var ctxMenu = document.getElementById('pkContextMenu');
        if (ctxMenu) {
            ctxMenu.addEventListener('click', async function (e) {
                var menuItem = e.target.closest('.pk-context-menu-item');
                if (menuItem) {
                    await window.PancakeContextMenu.handleAction(menuItem.dataset.action);
                }
            });
        }
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.pk-context-menu') && !e.target.closest('.pk-tags-menu')) {
                window.PancakeContextMenu.hide();
            }
        });
    },

    _switchTab(tabName) {
        document.querySelectorAll('.pk-header-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        var map = {
            conversations: 'pkTabConversations',
            orders: 'pkTabOrders',
            posts: 'pkTabPosts',
            stats: 'pkTabStats',
            settings: 'pkTabSettings',
        };
        document.querySelectorAll('.pk-tab-content').forEach(function (c) {
            c.classList.remove('active');
        });
        var target = document.getElementById(map[tabName]);
        if (target) target.classList.add('active');
    },

    _renderLoadingState() {
        var c = document.getElementById('pkConversations');
        if (c) c.innerHTML = '<div class="pk-loading"><div class="pk-loading-spinner"></div></div>';
    },

    _renderErrorState(message) {
        var c = document.getElementById('pkConversations');
        if (c) {
            c.innerHTML =
                '<div class="pk-empty-state" style="padding:40px 20px;"><i data-lucide="alert-circle"></i><h3>Lỗi</h3><p>' +
                window.SharedUtils.escapeHtml(message) +
                '</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    },

    async refresh() {
        await window.PancakePageSelector.loadPages();
        await this._loadConversations();
    },

    setServerMode(mode) {
        window.PancakeState.setServerMode(mode);
        var indicator = document.getElementById('serverModeIndicator');
        if (indicator) {
            indicator.textContent = mode === 'n2store' ? 'N2Store' : 'Pancake';
            indicator.style.background = mode === 'n2store' ? '#10b981' : '#3b82f6';
        }
    },

    _renderShell() {
        // This is the same HTML shell as the original PancakeChatManager.render()
        // Kept identical to preserve CSS compatibility
        this.container.innerHTML =
            '<div class="pancake-chat-container">' +
            '<div class="pk-header-tabs"><div class="pk-header-tabs-left">' +
            '<div class="pk-pancake-logo"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00a884"/><path d="M2 17L12 22L22 17V12L12 17L2 12V17Z" fill="#00a884" opacity="0.7"/></svg><span>Pancake</span></div>' +
            '<button class="pk-header-tab active" data-tab="conversations"><i data-lucide="message-circle"></i><span>Hội thoại</span></button>' +
            '<button class="pk-header-tab" data-tab="orders"><i data-lucide="shopping-bag"></i><span>Đơn hàng</span></button>' +
            '<button class="pk-header-tab" data-tab="posts"><i data-lucide="file-text"></i><span>Bài viết</span></button>' +
            '<button class="pk-header-tab" data-tab="stats"><i data-lucide="bar-chart-2"></i><span>Thống kê</span></button>' +
            '<button class="pk-header-tab" data-tab="settings"><i data-lucide="settings"></i><span>Cài đặt</span></button>' +
            '</div><div class="pk-header-tabs-right">' +
            '<span class="pk-socket-status" id="pkSocketStatus" title="Trạng thái kết nối realtime"><i data-lucide="wifi-off" class="pk-socket-icon disconnected"></i></span>' +
            '<button class="pk-header-icon-btn" title="Thông báo"><i data-lucide="bell"></i></button>' +
            '<button class="pk-header-icon-btn" title="Tài khoản"><i data-lucide="user"></i></button>' +
            '</div></div>' +
            '<div class="pk-tab-content-container">' +
            '<div class="pk-tab-content active" id="pkTabConversations"><div class="pk-conversations-layout">' +
            '<div class="pk-conversation-list" id="pkConversationList">' +
            // Card "Tất cả Pages" (page selector) đã BỎ (2026-06-09) — lọc page
            // giờ qua badge Store/House trên từng hội thoại (#2). Giữ gear settings
            // ở cuối hàng filter-tabs. Badge filter active hiện nút "✕ Bỏ lọc".
            // Thanh chọn chiến dịch livestream (PancakeLivestreamFilter render vào).
            '<div class="pk-ls-bar" id="pkLivestreamBar"></div>' +
            // Tab theo NGƯỜI: Tất cả / Inbox / Livestream. Gear ghim phải, tabs scroll riêng.
            '<div class="pk-filter-tabs"><div class="pk-filter-tabs-scroll">' +
            '<button class="pk-filter-tab active" data-filter="all">Tất cả</button>' +
            '<button class="pk-filter-tab" data-filter="inbox">Inbox</button>' +
            '<button class="pk-filter-tab" data-filter="livestream"><i data-lucide="radio"></i>Livestream</button>' +
            '<button id="pkPageFilterClear" class="pk-page-filter-clear" style="display:none;border:0;background:#eef2ff;color:#0058da;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0;" onclick="window.PancakeConversationList.setPageFilter(null)">✕ Bỏ lọc page</button>' +
            '</div>' +
            '<button class="pk-action-icon-btn pk-filter-gear" title="Cài đặt Pancake" onclick="openPancakeSettingsModal()"><i data-lucide="settings"></i></button></div>' +
            // Sub-filter loại hội thoại (mọi tab): Tất cả / Tin nhắn / Bình luận.
            '<div class="pk-subfilter" id="pkTypeSubfilter">' +
            '<button class="pk-subfilter-btn active" data-type="all">Tất cả</button>' +
            '<button class="pk-subfilter-btn" data-type="message"><i data-lucide="message-circle"></i>Tin nhắn</button>' +
            '<button class="pk-subfilter-btn" data-type="comment"><i data-lucide="message-square"></i>Bình luận</button>' +
            '</div>' +
            '<div class="pk-search-header"><div class="pk-search-wrapper"><div class="pk-search-box"><i data-lucide="search"></i><input type="text" id="pkSearchInput" placeholder="Tìm kiếm"></div></div></div>' +
            '<div class="pk-conversations" id="pkConversations"><div class="pk-loading"><div class="pk-loading-spinner"></div></div></div>' +
            '<div class="pk-context-menu" id="pkContextMenu" style="display:none;">' +
            '<button class="pk-context-menu-item" data-action="mark-unread"><i data-lucide="mail"></i><span>Đánh dấu chưa đọc</span></button>' +
            '<button class="pk-context-menu-item" data-action="mark-read"><i data-lucide="mail-open"></i><span>Đánh dấu đã đọc</span></button>' +
            '<div class="pk-context-menu-divider"></div>' +
            '<button class="pk-context-menu-item" data-action="add-note"><i data-lucide="file-text"></i><span>Thêm ghi chú</span></button>' +
            '<button class="pk-context-menu-item" data-action="manage-tags"><i data-lucide="tag"></i><span>Quản lý nhãn</span><i data-lucide="chevron-right" class="pk-menu-arrow"></i></button>' +
            '<div class="pk-context-menu-divider pk-live-saved-divider" style="display:none;"></div>' +
            '<button class="pk-context-menu-item pk-live-saved-action" data-action="remove-live-saved" style="display:none;"><i data-lucide="x-circle"></i><span>Xóa khỏi Lưu Live</span></button></div>' +
            '<div class="pk-tags-menu" id="pkTagsMenu" style="display:none;"><div class="pk-tags-menu-header">Chọn nhãn</div><div class="pk-tags-menu-list" id="pkTagsList"><div class="pk-loading-spinner" style="width:20px;height:20px;"></div></div></div>' +
            '</div>' +
            '<div class="pk-chat-window" id="pkChatWindow"><div class="pk-empty-state"><i data-lucide="message-square"></i><h3>Chọn hội thoại</h3><p>Chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu nhắn tin</p></div></div>' +
            '</div></div>' +
            '<div class="pk-tab-content" id="pkTabOrders"><div class="pk-tab-placeholder"><i data-lucide="shopping-bag"></i><h3>Đơn hàng</h3><p>Quản lý đơn hàng - Đang phát triển</p></div></div>' +
            '<div class="pk-tab-content" id="pkTabPosts"><div class="pk-tab-placeholder"><i data-lucide="file-text"></i><h3>Bài viết</h3><p>Quản lý bài viết - Đang phát triển</p></div></div>' +
            '<div class="pk-tab-content" id="pkTabStats"><div class="pk-tab-placeholder"><i data-lucide="bar-chart-2"></i><h3>Thống kê</h3><p>Báo cáo thống kê - Đang phát triển</p></div></div>' +
            '<div class="pk-tab-content" id="pkTabSettings"><div class="pk-tab-placeholder"><i data-lucide="settings"></i><h3>Cài đặt</h3><p>Cấu hình hệ thống - Đang phát triển</p></div></div>' +
            '</div></div>';
    },
};

// Export globally
if (typeof window !== 'undefined') {
    window.PancakeColumnManager = PancakeColumnManager;

    // Auto-initialize (backwards compatible with original behavior)
    document.addEventListener('DOMContentLoaded', function () {
        var pancakeContent = document.getElementById('pancakeContent');
        if (pancakeContent) {
            setTimeout(function () {
                window.PancakeColumnManager.initialize('pancakeContent');
            }, 500);
        }
    });
}
