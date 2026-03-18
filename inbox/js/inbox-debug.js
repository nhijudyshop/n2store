/* =====================================================
   INBOX REALTIME DEBUG PANEL
   Adapted for Phoenix WebSocket (PancakePhoenixSocket)
   Toggle: nhấn nút 🔧 ở góc phải hoặc gõ window.inboxDebug.toggle()
   ===================================================== */

class InboxRealtimeDebug {
    constructor() {
        this.panel = null;
        this.logEntries = [];
        this.maxLogs = 200;
        this.isVisible = false;
        this.checkInterval = null;
        this.eventCounts = {
            'pages:update_conversation': 0,
            'pages:new_message': 0,
            'order:tags_updated': 0,
            'phx_join': 0,
            'phx_reply': 0,
            'heartbeat': 0,
            'ws_open': 0,
            'ws_close': 0,
            'ws_error': 0,
            'ui_update': 0,
            'ui_render_list': 0,
            'ui_render_single': 0,
            'ui_load_messages': 0,
        };
        this.lastMessageTime = null;
        this.startTime = Date.now();
    }

    init() {
        this.createPanel();
        this.createToggleButton();
        this.hookIntoPhoenixSocket();
        this.hookIntoUIUpdates();
        this.startStatusCheck();
        this.log('DEBUG', 'Debug panel initialized (Phoenix WS mode)', 'info');
        console.log('[DEBUG] Inbox Realtime Debug panel loaded. Click 🔧 button or run window.inboxDebug.toggle()');
    }

    // ===== PANEL UI =====

    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'realtimeDebugPanel';
        panel.innerHTML = `
            <style>
                #realtimeDebugPanel {
                    display: none;
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    width: 520px;
                    max-height: 70vh;
                    background: #1a1a2e;
                    color: #eee;
                    border: 2px solid #0f3460;
                    border-radius: 10px;
                    font-family: 'Menlo', 'Consolas', monospace;
                    font-size: 11px;
                    z-index: 99999;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                    overflow: hidden;
                }
                #realtimeDebugPanel.visible { display: flex; flex-direction: column; }
                #debugHeader {
                    background: #0f3460;
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    user-select: none;
                }
                #debugHeader h3 { margin: 0; font-size: 13px; color: #e94560; }
                #debugHeaderBtns button {
                    background: none; border: 1px solid #555; color: #ccc;
                    padding: 2px 8px; margin-left: 4px; border-radius: 4px; cursor: pointer;
                    font-size: 11px;
                }
                #debugHeaderBtns button:hover { background: #333; }
                #debugStatus {
                    padding: 8px 12px;
                    background: #16213e;
                    border-bottom: 1px solid #0f3460;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 4px;
                }
                .debug-status-item { display: flex; align-items: center; gap: 6px; }
                .debug-dot {
                    width: 8px; height: 8px; border-radius: 50%;
                    display: inline-block; flex-shrink: 0;
                }
                .debug-dot.green { background: #00ff88; box-shadow: 0 0 4px #00ff88; }
                .debug-dot.red { background: #ff4444; box-shadow: 0 0 4px #ff4444; }
                .debug-dot.yellow { background: #ffaa00; box-shadow: 0 0 4px #ffaa00; }
                .debug-dot.gray { background: #666; }
                #debugCounters {
                    padding: 6px 12px;
                    background: #16213e;
                    border-bottom: 1px solid #0f3460;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                .debug-counter {
                    background: #0f3460;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 10px;
                }
                .debug-counter .count { color: #00ff88; font-weight: bold; }
                #debugLogs {
                    flex: 1;
                    overflow-y: auto;
                    padding: 6px;
                    max-height: 40vh;
                }
                .debug-log {
                    padding: 3px 6px;
                    border-bottom: 1px solid #1a1a3e;
                    display: flex;
                    gap: 6px;
                    line-height: 1.4;
                }
                .debug-log:hover { background: #16213e; }
                .debug-log .time { color: #666; min-width: 65px; }
                .debug-log .tag {
                    min-width: 50px; font-weight: bold;
                    padding: 0 4px; border-radius: 3px; text-align: center;
                }
                .debug-log .msg { flex: 1; word-break: break-all; }
                .tag-SERVER { background: #0f3460; color: #4fc3f7; }
                .tag-WS { background: #1b5e20; color: #69f0ae; }
                .tag-PHOENIX { background: #004d40; color: #64ffda; }
                .tag-UI { background: #4a148c; color: #ce93d8; }
                .tag-MSG { background: #e65100; color: #ffcc80; }
                .tag-ACCOUNT { background: #880e4f; color: #f48fb1; }
                .tag-ERROR { background: #b71c1c; color: #ff8a80; }
                .tag-DEBUG { background: #333; color: #aaa; }
                .tag-PANCAKE { background: #ff6f00; color: #fff; }
                .tag-FILTER { background: #006064; color: #80deea; }
                .msg-error { color: #ff6b6b; }
                .msg-warn { color: #ffd93d; }
                .msg-success { color: #6bff6b; }
                .msg-info { color: #ddd; }
                #debugActions {
                    padding: 6px 12px;
                    background: #16213e;
                    border-top: 1px solid #0f3460;
                    display: flex;
                    gap: 4px;
                    flex-wrap: wrap;
                }
                #debugActions button {
                    background: #0f3460; border: none; color: #ccc;
                    padding: 4px 10px; border-radius: 4px; cursor: pointer;
                    font-size: 11px; font-family: inherit;
                }
                #debugActions button:hover { background: #1a5276; }
            </style>
            <div id="debugHeader">
                <h3>🔧 Phoenix Debug</h3>
                <div id="debugHeaderBtns">
                    <button onclick="window.inboxDebug.clearLogs()">Clear</button>
                    <button onclick="window.inboxDebug.toggle()">✕</button>
                </div>
            </div>
            <div id="debugStatus"></div>
            <div id="debugCounters"></div>
            <div id="debugLogs"></div>
            <div id="debugActions">
                <button onclick="window.inboxDebug.checkAccountInfo()">Check Account</button>
                <button onclick="window.inboxDebug.testPancakeAPI()">Test Pancake API</button>
                <button onclick="window.inboxDebug.checkPhoenixWS()">Check Phoenix WS</button>
                <button onclick="window.inboxDebug.forceReconnect()">Force Reconnect</button>
                <button onclick="window.inboxDebug.exportLogs()">Export Logs</button>
            </div>
        `;
        document.body.appendChild(panel);
        this.panel = panel;
    }

    createToggleButton() {
        const btn = document.createElement('button');
        btn.id = 'debugToggleBtn';
        btn.innerHTML = '🔧';
        btn.title = 'Toggle Realtime Debug Panel';
        btn.style.cssText = `
            position: fixed; bottom: 10px; right: 10px; z-index: 99998;
            width: 40px; height: 40px; border-radius: 50%;
            background: #0f3460; border: 2px solid #e94560; color: white;
            font-size: 18px; cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
        `;
        btn.onclick = () => this.toggle();
        document.body.appendChild(btn);
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.panel.classList.toggle('visible', this.isVisible);
        if (this.isVisible) {
            this.updateStatusDisplay();
            this.updateCountersDisplay();
        }
    }

    // ===== LOGGING =====

    log(tag, message, level = 'info') {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false });
        const entry = { time: timeStr, tag, message, level, timestamp: now.getTime() };
        this.logEntries.push(entry);
        if (this.logEntries.length > this.maxLogs) this.logEntries.shift();

        const prefix = `[DEBUG:${tag}]`;
        if (level === 'error') console.error(prefix, message);
        else if (level === 'warn') console.warn(prefix, message);
        else console.log(`%c${prefix}%c ${message}`, `color: #4fc3f7; font-weight: bold`, 'color: inherit');

        if (this.isVisible) {
            const logsEl = document.getElementById('debugLogs');
            if (logsEl) {
                const div = document.createElement('div');
                div.className = 'debug-log';
                div.innerHTML = `
                    <span class="time">${timeStr}</span>
                    <span class="tag tag-${tag}">${tag}</span>
                    <span class="msg msg-${level}">${this.escapeHtml(message)}</span>
                `;
                logsEl.appendChild(div);
                logsEl.scrollTop = logsEl.scrollHeight;
            }
        }
    }

    escapeHtml(str) {
        if (typeof str !== 'string') str = JSON.stringify(str);
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    clearLogs() {
        this.logEntries = [];
        const logsEl = document.getElementById('debugLogs');
        if (logsEl) logsEl.innerHTML = '';
    }

    // ===== STATUS DISPLAY =====

    updateStatusDisplay() {
        const el = document.getElementById('debugStatus');
        if (!el) return;

        const chat = window.inboxChat;
        const phoenix = chat?.phoenixSocket;

        // 1. Phoenix WebSocket
        const phoenixConnected = phoenix?.isConnected || false;
        const wsState = phoenix?.ws ? this.wsStateStr(phoenix.ws.readyState) : 'N/A';
        const reconnectAttempts = phoenix?.reconnectAttempts || 0;

        // 2. Account info
        const tm = window.inboxTokenManager;
        const tokenInfo = tm?.getTokenInfo?.();
        const accountName = tokenInfo?.name || 'N/A';
        const accountUid = tokenInfo?.uid || 'N/A';

        // 3. Last message
        const lastMsgAgo = this.lastMessageTime
            ? Math.round((Date.now() - this.lastMessageTime) / 1000) + 's ago'
            : 'never';

        // 4. Auto-refresh
        const autoRefresh = chat?.autoRefreshInterval ? 'ON (30s)' : 'OFF';

        // 5. Uptime
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        const uptimeStr = uptime > 3600 ? `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m` : `${Math.floor(uptime/60)}m ${uptime%60}s`;

        // 6. Channels joined
        const channels = phoenix?.joinedChannels ? Object.keys(phoenix.joinedChannels).length : 0;

        el.innerHTML = `
            <div class="debug-status-item">
                <span class="debug-dot ${phoenixConnected ? 'green' : 'red'}"></span>
                Phoenix WS: ${phoenixConnected ? 'Connected' : 'Disconnected'} (${wsState})
            </div>
            <div class="debug-status-item">
                <span class="debug-dot ${channels > 0 ? 'green' : 'gray'}"></span>
                Channels: ${channels} joined, reconnects: ${reconnectAttempts}
            </div>
            <div class="debug-status-item">
                <span class="debug-dot ${accountUid !== 'N/A' ? 'green' : 'red'}"></span>
                Account: ${accountName} (${accountUid})
            </div>
            <div class="debug-status-item">
                <span class="debug-dot ${this.lastMessageTime ? 'green' : 'gray'}"></span>
                Last msg: ${lastMsgAgo}
            </div>
            <div class="debug-status-item">
                <span class="debug-dot ${autoRefresh === 'OFF' ? 'green' : 'yellow'}"></span>
                Auto-refresh: ${autoRefresh}
            </div>
            <div class="debug-status-item">
                <span class="debug-dot gray"></span>
                Uptime: ${uptimeStr}
            </div>
        `;
    }

    updateCountersDisplay() {
        const el = document.getElementById('debugCounters');
        if (!el) return;
        el.innerHTML = Object.entries(this.eventCounts)
            .map(([k, v]) => `<span class="debug-counter">${k}: <span class="count">${v}</span></span>`)
            .join('');
    }

    wsStateStr(state) {
        switch (state) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'N/A';
        }
    }

    // ===== HOOK INTO PHOENIX WEBSOCKET =====

    hookIntoPhoenixSocket() {
        const self = this;

        const waitForChat = setInterval(() => {
            const chat = window.inboxChat;
            if (!chat) return;
            clearInterval(waitForChat);

            // --- Hook _onPhoenixEvent (main event dispatcher) ---
            const origPhoenixEvent = chat._onPhoenixEvent?.bind(chat);
            if (origPhoenixEvent) {
                chat._onPhoenixEvent = function(event, payload) {
                    self.lastMessageTime = Date.now();

                    if (event === 'pages:update_conversation') {
                        self.eventCounts['pages:update_conversation']++;
                        const conv = payload?.conversation || payload;
                        const pageId = conv?.page_id || 'N/A';
                        const convId = conv?.id || 'N/A';
                        const snippet = (conv?.snippet || '').substring(0, 60);
                        const customerName = conv?.from?.name || conv?.customers?.[0]?.name || 'N/A';
                        const convType = conv?.type || 'N/A';
                        self.log('MSG', `update_conversation | page=${pageId} | conv=${convId} | type=${convType} | from="${customerName}" | "${snippet}"`, 'info');
                    } else if (event === 'pages:new_message') {
                        self.eventCounts['pages:new_message']++;
                        const msg = payload?.message || payload;
                        const convId = msg?.conversation_id || 'N/A';
                        const msgText = (msg?.message || msg?.original_message || '').substring(0, 60);
                        self.log('MSG', `new_message | conv=${convId} | "${msgText}"`, 'info');
                    } else if (event === 'order:tags_updated') {
                        self.eventCounts['order:tags_updated']++;
                        self.log('MSG', `tags_updated | ${JSON.stringify(payload).substring(0, 100)}`, 'info');
                    } else {
                        self.log('MSG', `event: ${event} | ${JSON.stringify(payload).substring(0, 100)}`, 'warn');
                    }

                    self.updateStatusDisplay();
                    self.updateCountersDisplay();
                    origPhoenixEvent(event, payload);
                };
            }

            // --- Hook handleConversationUpdate ---
            const origHandleUpdate = chat.handleConversationUpdate?.bind(chat);
            if (origHandleUpdate) {
                chat.handleConversationUpdate = function(payload) {
                    const conv = payload?.conversation || payload;
                    const pageId = String(conv?.page_id || '');
                    const convId = conv?.id || 'N/A';
                    const convType = conv?.type || 'N/A';

                    const knownPage = chat.data?.pages?.find(p => String(p.id) === pageId || String(p.page_id) === pageId);
                    if (pageId && !knownPage) {
                        self.log('FILTER', `SKIPPED: page ${pageId} not in loaded pages [${(chat.data?.pages || []).map(p => p.id).join(',')}]`, 'warn');
                    }

                    const isActive = chat.activeConversationId === convId;
                    self.log('UI', `handleConversationUpdate: conv=${convId}, type=${convType}, isActive=${isActive}`, 'info');
                    self.eventCounts.ui_update++;

                    origHandleUpdate(payload);
                };
            }

            // --- Hook handleNewMessage ---
            const origNewMsg = chat.handleNewMessage?.bind(chat);
            if (origNewMsg) {
                chat.handleNewMessage = function(payload) {
                    const msg = payload?.message || payload;
                    const convId = msg?.conversation_id || 'N/A';
                    const isActive = chat.activeConversationId === convId;
                    const hasConv = !!chat.data?.getConversation(convId);
                    self.log('UI', `handleNewMessage: conv=${convId}, isActive=${isActive}, existsInList=${hasConv}`, 'info');
                    origNewMsg(payload);
                };
            }

            // --- Hook renderConversationList ---
            const origRenderList = chat.renderConversationList?.bind(chat);
            if (origRenderList) {
                chat.renderConversationList = function(...args) {
                    self.eventCounts.ui_render_list++;
                    self.log('UI', `renderConversationList (full re-render, count=${chat.data?.conversations?.length || 0})`, 'info');
                    origRenderList(...args);
                };
            }

            // --- Hook _updateSingleConversationInList ---
            if (chat._updateSingleConversationInList) {
                const origSingleUpdate = chat._updateSingleConversationInList.bind(chat);
                chat._updateSingleConversationInList = function(convId) {
                    const result = origSingleUpdate(convId);
                    self.eventCounts.ui_render_single++;
                    self.log('UI', `_updateSingleConversation: conv=${convId}, success=${result}`, result ? 'success' : 'warn');
                    return result;
                };
            }

            // --- Hook loadMessages ---
            const origLoadMessages = chat.loadMessages?.bind(chat);
            if (origLoadMessages) {
                chat.loadMessages = function(conv) {
                    self.eventCounts.ui_load_messages++;
                    self.log('UI', `loadMessages: conv=${conv?.id || 'N/A'}, type=${conv?.type || 'N/A'}`, 'info');
                    return origLoadMessages(conv);
                };
            }

            // --- Hook initializeWebSocket ---
            const origInitWS = chat.initializeWebSocket?.bind(chat);
            if (origInitWS) {
                chat.initializeWebSocket = async function() {
                    self.log('PHOENIX', 'initializeWebSocket() called', 'info');
                    const result = await origInitWS();
                    self.log('PHOENIX', `initializeWebSocket() done`, 'success');
                    self.updateStatusDisplay();
                    return result;
                };
            }

            // --- Hook into PancakePhoenixSocket if already created ---
            self._hookPhoenixSocketInstance(chat.phoenixSocket);

            // Watch for phoenixSocket being created later
            let _phoenixSocket = chat.phoenixSocket;
            Object.defineProperty(chat, '_phoenixSocketDebugHooked', { value: false, writable: true });
            const origDescriptor = Object.getOwnPropertyDescriptor(chat, 'phoenixSocket');
            if (!origDescriptor?.set) {
                // Only define property if not already a setter
                let _val = chat.phoenixSocket;
                Object.defineProperty(chat, 'phoenixSocket', {
                    get() { return _val; },
                    set(v) {
                        _val = v;
                        if (v) self._hookPhoenixSocketInstance(v);
                    },
                    configurable: true
                });
            }

            self.log('DEBUG', 'Hooks installed on InboxChatController (Phoenix mode)', 'success');
        }, 500);
    }

    _hookPhoenixSocketInstance(phoenix) {
        if (!phoenix || phoenix._debugHooked) return;
        phoenix._debugHooked = true;
        const self = this;

        // Hook onEvent to track Phoenix-level events
        const origOnEvent = phoenix.onEvent;
        phoenix.onEvent = function(event, payload) {
            // Already logged in _onPhoenixEvent hook, but track Phoenix protocol events
            if (event === 'phx_reply') {
                self.eventCounts.phx_reply++;
            }
            origOnEvent(event, payload);
        };

        // Hook onStatusChange
        const origOnStatus = phoenix.onStatusChange;
        phoenix.onStatusChange = function(connected) {
            if (connected) {
                self.eventCounts.ws_open++;
                self.log('PHOENIX', `Connected to ${phoenix.url}`, 'success');
            } else {
                self.eventCounts.ws_close++;
                self.log('PHOENIX', `Disconnected (attempt ${phoenix.reconnectAttempts})`, 'warn');
            }
            self.updateStatusDisplay();
            origOnStatus(connected);
        };

        self.log('PHOENIX', 'Hooked into PancakePhoenixSocket instance', 'success');
    }

    // ===== HOOK INTO UI UPDATES =====

    hookIntoUIUpdates() {
        window.addEventListener('realtimeConversationUpdate', (e) => {
            const conv = e.detail;
            this.log('MSG', `[Event] realtimeConversationUpdate dispatched: conv=${conv?.id}, page=${conv?.page_id}`, 'info');
        });
    }

    // ===== STATUS CHECK =====

    startStatusCheck() {
        this.checkInterval = setInterval(() => {
            if (this.isVisible) {
                this.updateStatusDisplay();
                this.updateCountersDisplay();
            }
        }, 5000);
    }

    // ===== ACTION BUTTONS =====

    async checkAccountInfo() {
        this.log('ACCOUNT', 'Checking account info...', 'info');
        const tm = window.inboxTokenManager;
        if (!tm) {
            this.log('ACCOUNT', 'inboxTokenManager not found!', 'error');
            return;
        }

        const tokenInfo = tm.getTokenInfo?.();
        const accounts = tm.getValidAccounts?.() || [];
        const activeId = tm.getActiveAccountId?.();

        this.log('ACCOUNT', `Active: ${activeId || 'none'}`, 'info');
        this.log('ACCOUNT', `Token info: ${JSON.stringify(tokenInfo)}`, 'info');
        this.log('ACCOUNT', `Accounts count: ${accounts.length}`, 'info');

        for (const acc of accounts) {
            const isActive = acc.accountId === activeId;
            this.log('ACCOUNT', `  ${isActive ? '→' : ' '} [${acc.accountId}] "${acc.name}"`, isActive ? 'success' : 'info');
        }

        // Pages info
        const data = window.inboxChat?.data;
        if (data) {
            this.log('ACCOUNT', `Loaded pages: ${data.pageIds?.length || 0} pages [${(data.pageIds || []).join(',')}]`, 'info');
            this.log('ACCOUNT', `Conversations: ${data.conversations?.length || 0}`, 'info');
        }

        // Page access tokens
        const pageIds = data?.pageIds || [];
        for (const pid of pageIds.slice(0, 5)) {
            const pat = tm.getPageAccessToken?.(pid);
            this.log('ACCOUNT', `  PAT ${pid}: ${pat ? pat.substring(0, 20) + '...' : 'NONE'}`, pat ? 'success' : 'warn');
        }
    }

    async testPancakeAPI() {
        this.log('PANCAKE', 'Testing Pancake API...', 'info');
        try {
            const tm = window.inboxTokenManager;
            const api = window.inboxPancakeAPI;
            if (!tm || !api) {
                this.log('PANCAKE', 'Token/API manager not found!', 'error');
                return;
            }

            const token = await tm.getToken();
            if (!token) {
                this.log('PANCAKE', 'No token available!', 'error');
                return;
            }

            // Test fetch pages
            this.log('PANCAKE', 'Fetching pages...', 'info');
            const pages = await api.fetchPages();
            this.log('PANCAKE', `Pages: ${pages.length} loaded`, pages.length > 0 ? 'success' : 'warn');

            if (pages.length > 0) {
                const pageId = pages[0].id;
                const pat = tm.getPageAccessToken?.(pageId);

                if (pat) {
                    // Test conversations API
                    const url = InboxApiConfig.buildUrl.pancakeOfficialV2(
                        `pages/${pageId}/conversations`, pat
                    );
                    const res = await fetch(url);
                    const data = await res.json();
                    if (data.conversations) {
                        this.log('PANCAKE', `Conversations API OK: ${data.conversations.length} conversations for page ${pageId}`, 'success');
                    } else if (data.error) {
                        this.log('PANCAKE', `API Error: ${JSON.stringify(data.error)}`, 'error');
                    }
                } else {
                    this.log('PANCAKE', `No page_access_token for page ${pageId}`, 'warn');
                }
            }
        } catch (e) {
            this.log('PANCAKE', `API test failed: ${e.message}`, 'error');
        }
    }

    checkPhoenixWS() {
        this.log('PHOENIX', 'Checking Phoenix WebSocket...', 'info');

        const chat = window.inboxChat;
        const phoenix = chat?.phoenixSocket;

        if (!phoenix) {
            this.log('PHOENIX', 'PancakePhoenixSocket: NOT CREATED', 'error');
            return;
        }

        // WS state
        if (phoenix.ws) {
            const state = this.wsStateStr(phoenix.ws.readyState);
            this.log('PHOENIX', `WebSocket state: ${state}, url=${phoenix.url}`, state === 'OPEN' ? 'success' : 'warn');
        } else {
            this.log('PHOENIX', 'WebSocket: NULL (not connected)', 'error');
        }

        // Connection info
        this.log('PHOENIX', `isConnected: ${phoenix.isConnected}`, phoenix.isConnected ? 'success' : 'warn');
        this.log('PHOENIX', `reconnectAttempts: ${phoenix.reconnectAttempts}/${phoenix.maxReconnect}`, 'info');
        this.log('PHOENIX', `ref counter: ${phoenix.ref}`, 'info');
        this.log('PHOENIX', `userId: ${phoenix.userId || 'N/A'}`, 'info');
        this.log('PHOENIX', `pageIds: ${(phoenix.pageIds || []).join(',')}`, 'info');

        // Heartbeat
        this.log('PHOENIX', `heartbeatTimer: ${phoenix.heartbeatTimer ? 'active' : 'inactive'}`, phoenix.heartbeatTimer ? 'success' : 'warn');

        // Auto-refresh fallback
        this.log('PHOENIX', `autoRefreshInterval: ${chat.autoRefreshInterval ? 'ON' : 'OFF'}`, 'info');

        this.updateStatusDisplay();
    }

    async forceReconnect() {
        this.log('PHOENIX', 'Force reconnecting...', 'warn');
        const chat = window.inboxChat;
        if (!chat) {
            this.log('PHOENIX', 'inboxChat not found!', 'error');
            return;
        }

        // Disconnect existing
        if (chat.phoenixSocket) {
            chat.phoenixSocket.disconnect();
            chat.phoenixSocket = null;
        }
        chat.isSocketConnected = false;

        // Reinitialize
        this.log('PHOENIX', 'Calling initializeWebSocket()...', 'info');
        await chat.initializeWebSocket();
        this.log('PHOENIX', 'Reconnect initiated', 'success');
        this.updateStatusDisplay();
    }

    exportLogs() {
        const text = this.logEntries.map(e => `[${e.time}] [${e.tag}] ${e.message}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `phoenix-debug-${new Date().toISOString().slice(0,19)}.log`;
        a.click();
        URL.revokeObjectURL(url);
        this.log('DEBUG', 'Logs exported', 'success');
    }
}

// Auto-initialize
window.inboxDebug = new InboxRealtimeDebug();
window.inboxDebug.init();
