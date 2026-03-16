/* =====================================================
   INBOX REALTIME DEBUG PANEL
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
        this.hookIntoWebSocket();
        this.hookIntoUIUpdates();
        this.startStatusCheck();
        this.log('DEBUG', 'Debug panel initialized', 'info');
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
                <h3>🔧 Realtime Debug</h3>
                <div id="debugHeaderBtns">
                    <button onclick="window.inboxDebug.clearLogs()">Clear</button>
                    <button onclick="window.inboxDebug.toggle()">✕</button>
                </div>
            </div>
            <div id="debugStatus"></div>
            <div id="debugCounters"></div>
            <div id="debugLogs"></div>
            <div id="debugActions">
                <button onclick="window.inboxDebug.checkServerStatus()">Check Server</button>
                <button onclick="window.inboxDebug.checkAccountInfo()">Check Account</button>
                <button onclick="window.inboxDebug.testPancakeAPI()">Test Pancake API</button>
                <button onclick="window.inboxDebug.checkBrowserWS()">Check Browser WS</button>
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

        // Console output with color
        const prefix = `[DEBUG:${tag}]`;
        if (level === 'error') console.error(prefix, message);
        else if (level === 'warn') console.warn(prefix, message);
        else console.log(`%c${prefix}%c ${message}`, `color: #4fc3f7; font-weight: bold`, 'color: inherit');

        // Update panel
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
        const rm = window.realtimeManager;

        // 1. Browser proxy WS
        const proxyConnected = chat?.isSocketConnected;
        const proxyState = chat?.socket?.readyState;
        const proxyStateStr = this.wsStateStr(proxyState);

        // 2. RealtimeManager
        const rmConnected = rm?.isConnected;
        const rmWsState = rm?.ws?.readyState ?? rm?.proxyWs?.readyState;

        // 3. Account info
        const ptm = window.pancakeTokenManager;
        const currentAccount = ptm?.getTokenInfo?.();
        const accountName = currentAccount?.name || 'N/A';
        const accountUid = currentAccount?.uid || chat?.userId || 'N/A';

        // 4. Last message
        const lastMsgAgo = this.lastMessageTime
            ? Math.round((Date.now() - this.lastMessageTime) / 1000) + 's ago'
            : 'never';

        // 5. Auto-refresh
        const autoRefresh = chat?.autoRefreshInterval ? 'ON (30s)' : 'OFF';

        // 6. Uptime
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        const uptimeStr = uptime > 3600 ? `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m` : `${Math.floor(uptime/60)}m ${uptime%60}s`;

        el.innerHTML = `
            <div class="debug-status-item">
                <span class="debug-dot ${proxyConnected ? 'green' : 'red'}"></span>
                Proxy WS: ${proxyConnected ? 'Connected' : 'Disconnected'} (${proxyStateStr})
            </div>
            <div class="debug-status-item">
                <span class="debug-dot ${rmConnected ? 'green' : 'gray'}"></span>
                RealtimeManager: ${rmConnected ? 'Connected' : 'Off'}
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

    // ===== HOOK INTO WEBSOCKET =====

    hookIntoWebSocket() {
        // Hook into InboxChatController's onSocketMessage
        const self = this;

        // Wait for inboxChat to be initialized
        const waitForChat = setInterval(() => {
            const chat = window.inboxChat;
            if (!chat) return;
            clearInterval(waitForChat);

            // --- Hook onSocketOpen ---
            const origOpen = chat.onSocketOpen.bind(chat);
            chat.onSocketOpen = function() {
                self.eventCounts.ws_open++;
                self.log('WS', `Proxy WebSocket OPENED (attempt #${chat.socketReconnectAttempts})`, 'success');
                self.updateStatusDisplay();
                origOpen();
            };

            // --- Hook onSocketClose ---
            const origClose = chat.onSocketClose.bind(chat);
            chat.onSocketClose = function(event) {
                self.eventCounts.ws_close++;
                self.log('WS', `Proxy WebSocket CLOSED: code=${event.code}, reason=${event.reason || 'none'}, clean=${event.wasClean}`, 'warn');
                self.updateStatusDisplay();
                origClose(event);
            };

            // --- Hook onSocketMessage ---
            const origMsg = chat.onSocketMessage.bind(chat);
            chat.onSocketMessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    const type = data.type || 'unknown';
                    self.lastMessageTime = Date.now();

                    if (type === 'pages:update_conversation') {
                        self.eventCounts['pages:update_conversation']++;
                        const conv = data.payload?.conversation || data.payload;
                        const pageId = conv?.page_id || 'N/A';
                        const convId = conv?.id || 'N/A';
                        const snippet = (conv?.snippet || conv?.last_message?.message || '').substring(0, 60);
                        const customerName = conv?.from?.name || conv?.customers?.[0]?.name || 'N/A';
                        const convType = conv?.type || 'N/A';
                        self.log('MSG', `update_conversation | page=${pageId} | conv=${convId} | type=${convType} | from="${customerName}" | "${snippet}"`, 'info');
                    } else if (type === 'pages:new_message') {
                        self.eventCounts['pages:new_message']++;
                        const msg = data.payload?.message || data.payload;
                        const convId = msg?.conversation_id || 'N/A';
                        const msgText = (msg?.message || msg?.original_message || '').substring(0, 60);
                        self.log('MSG', `new_message | conv=${convId} | "${msgText}"`, 'info');
                    } else {
                        self.log('MSG', `Unknown type: ${type} | ${JSON.stringify(data).substring(0, 100)}`, 'warn');
                    }

                    self.updateStatusDisplay();
                    self.updateCountersDisplay();
                } catch (e) {
                    self.log('ERROR', `Parse WS message failed: ${e.message}`, 'error');
                }

                // Call original
                origMsg(event);
            };

            // --- Hook handleConversationUpdate ---
            const origHandleUpdate = chat.handleConversationUpdate.bind(chat);
            chat.handleConversationUpdate = function(payload) {
                const conv = payload?.conversation || payload;
                const pageId = String(conv?.page_id || '');
                const convId = conv?.id || 'N/A';
                const convType = conv?.type || 'N/A';

                // Check page filter
                const knownPage = chat.data?.pages?.find(p => String(p.id) === pageId || String(p.page_id) === pageId);
                if (pageId && !knownPage) {
                    self.log('FILTER', `SKIPPED: page ${pageId} not in loaded pages [${(chat.data?.pages || []).map(p => p.id).join(',')}]`, 'warn');
                }

                // Check type filter
                if (convType && convType !== 'INBOX' && convType !== 'COMMENT') {
                    self.log('FILTER', `SKIPPED: type=${convType} (not INBOX/COMMENT)`, 'warn');
                }

                const isActive = chat.activeConversationId === convId;
                self.log('UI', `handleConversationUpdate: conv=${convId}, type=${convType}, isActive=${isActive}`, 'info');
                self.eventCounts.ui_update++;

                origHandleUpdate(payload);
            };

            // --- Hook handleNewMessage ---
            const origNewMsg = chat.handleNewMessage.bind(chat);
            chat.handleNewMessage = function(payload) {
                const msg = payload?.message || payload;
                const convId = msg?.conversation_id || 'N/A';
                const isActive = chat.activeConversationId === convId;
                const hasConv = !!chat.data?.getConversation(convId);
                self.log('UI', `handleNewMessage: conv=${convId}, isActive=${isActive}, existsInList=${hasConv}`, 'info');
                origNewMsg(payload);
            };

            // --- Hook renderConversationList ---
            const origRenderList = chat.renderConversationList.bind(chat);
            chat.renderConversationList = function(...args) {
                self.eventCounts.ui_render_list++;
                self.log('UI', `renderConversationList (full re-render, count=${chat.data?.conversations?.length || 0})`, 'info');
                origRenderList(...args);
            };

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
            const origLoadMessages = chat.loadMessages.bind(chat);
            chat.loadMessages = function(conv) {
                self.eventCounts.ui_load_messages++;
                self.log('UI', `loadMessages: conv=${conv?.id || 'N/A'}, type=${conv?.type || 'N/A'}`, 'info');
                return origLoadMessages(conv);
            };

            // --- Hook initializeWebSocket ---
            const origInitWS = chat.initializeWebSocket.bind(chat);
            chat.initializeWebSocket = async function() {
                self.log('WS', 'initializeWebSocket() called', 'info');
                const result = await origInitWS();
                self.log('WS', `initializeWebSocket() result: ${result}`, result ? 'success' : 'error');
                self.updateStatusDisplay();
                return result;
            };

            self.log('DEBUG', 'Hooks installed on InboxChatController', 'success');
        }, 500);
    }

    // ===== HOOK INTO UI UPDATES =====

    hookIntoUIUpdates() {
        // Listen for realtimeConversationUpdate events (from RealtimeManager)
        window.addEventListener('realtimeConversationUpdate', (e) => {
            const conv = e.detail;
            this.log('MSG', `[Event] realtimeConversationUpdate dispatched: conv=${conv?.id}, page=${conv?.page_id}`, 'info');
        });
    }

    // ===== STATUS CHECK =====

    startStatusCheck() {
        // Update status every 5s
        this.checkInterval = setInterval(() => {
            if (this.isVisible) {
                this.updateStatusDisplay();
                this.updateCountersDisplay();
            }
        }, 5000);
    }

    // ===== ACTION BUTTONS =====

    async checkServerStatus() {
        this.log('SERVER', 'Checking server status...', 'info');
        try {
            const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const res = await fetch(`${workerUrl}/api/realtime/status`);
            const status = await res.json();
            this.log('SERVER', `Server status: ${JSON.stringify(status)}`, status.connected ? 'success' : 'error');

            // Check account match
            const ptm = window.pancakeTokenManager;
            const currentUid = ptm?.getTokenInfo?.()?.uid;
            if (status.userId && currentUid && status.userId !== currentUid) {
                this.log('ACCOUNT', `MISMATCH! Server userId=${status.userId}, Browser userId=${currentUid}`, 'error');
            } else if (status.userId && currentUid) {
                this.log('ACCOUNT', `Account match OK: ${status.userId}`, 'success');
            }
        } catch (e) {
            this.log('SERVER', `Failed to check: ${e.message}`, 'error');
        }
    }

    async checkAccountInfo() {
        this.log('ACCOUNT', 'Checking account info...', 'info');
        const ptm = window.pancakeTokenManager;
        if (!ptm) {
            this.log('ACCOUNT', 'pancakeTokenManager not found!', 'error');
            return;
        }

        const tokenInfo = ptm.getTokenInfo?.();
        const accounts = ptm.accounts || [];
        const activeId = ptm.activeAccountId;

        this.log('ACCOUNT', `Active: ${activeId || 'none'}`, 'info');
        this.log('ACCOUNT', `Token info: ${JSON.stringify(tokenInfo)}`, 'info');
        this.log('ACCOUNT', `Accounts count: ${accounts.length}`, 'info');

        for (const acc of accounts) {
            const isActive = acc.id === activeId;
            this.log('ACCOUNT', `  ${isActive ? '→' : ' '} [${acc.id}] "${acc.name}" expired=${acc.expired || false}`, isActive ? 'success' : 'info');
        }

        // Check server account
        const chat = window.inboxChat;
        if (chat?.userId) {
            this.log('ACCOUNT', `InboxChat.userId: ${chat.userId}`, 'info');
            if (tokenInfo?.uid && chat.userId !== tokenInfo.uid) {
                this.log('ACCOUNT', `WARNING: InboxChat userId (${chat.userId}) != token userId (${tokenInfo.uid})`, 'warn');
            }
        }

        // Pages info
        const pdm = window.pancakeDataManager;
        if (pdm) {
            this.log('ACCOUNT', `Loaded pages: ${pdm.pageIds?.length || 0} pages [${(pdm.pageIds || []).join(',')}]`, 'info');
        }
    }

    async testPancakeAPI() {
        this.log('PANCAKE', 'Testing Pancake API...', 'info');
        try {
            const ptm = window.pancakeTokenManager;
            const pdm = window.pancakeDataManager;
            if (!ptm || !pdm) {
                this.log('PANCAKE', 'Token/Data manager not found!', 'error');
                return;
            }

            const token = await ptm.getToken();
            if (!token) {
                this.log('PANCAKE', 'No token available!', 'error');
                return;
            }

            const pageId = (pdm.pageIds || [])[0];
            if (!pageId) {
                this.log('PANCAKE', 'No page IDs loaded!', 'error');
                return;
            }

            const workerUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
            const url = `${workerUrl}/api/pancake/conversations?pages[${pageId}]=0&access_token=${token}&cursor_mode=true&from_platform=web`;

            const res = await fetch(url);
            const data = await res.json();

            if (data.error) {
                this.log('PANCAKE', `API Error: ${JSON.stringify(data.error)}`, 'error');
                if (data.error.message?.includes('expired') || data.error.message?.includes('unauthorized')) {
                    this.log('PANCAKE', 'TOKEN EXPIRED or UNAUTHORIZED - need to re-login!', 'error');
                }
            } else {
                const convCount = data.data?.length || 0;
                this.log('PANCAKE', `API OK: ${convCount} conversations returned`, 'success');
            }
        } catch (e) {
            this.log('PANCAKE', `API test failed: ${e.message}`, 'error');
        }
    }

    checkBrowserWS() {
        this.log('WS', 'Checking all WebSocket connections...', 'info');

        // 1. InboxChat proxy WS
        const chat = window.inboxChat;
        if (chat?.socket) {
            const state = this.wsStateStr(chat.socket.readyState);
            this.log('WS', `InboxChat.socket: ${state}, url=${chat.socket.url}`, state === 'OPEN' ? 'success' : 'warn');
        } else {
            this.log('WS', 'InboxChat.socket: NULL (not created)', 'error');
        }

        // 2. RealtimeManager
        const rm = window.realtimeManager;
        if (rm) {
            if (rm.ws) {
                const state = this.wsStateStr(rm.ws.readyState);
                this.log('WS', `RealtimeManager.ws (browser): ${state}`, state === 'OPEN' ? 'success' : 'warn');
            }
            if (rm.proxyWs) {
                const state = this.wsStateStr(rm.proxyWs.readyState);
                this.log('WS', `RealtimeManager.proxyWs: ${state}`, state === 'OPEN' ? 'success' : 'warn');
            }
            if (!rm.ws && !rm.proxyWs) {
                this.log('WS', 'RealtimeManager: no active WS', 'warn');
            }
            this.log('WS', `RealtimeManager.isConnected: ${rm.isConnected}`, rm.isConnected ? 'success' : 'warn');
        } else {
            this.log('WS', 'RealtimeManager not found', 'warn');
        }

        this.updateStatusDisplay();
    }

    async forceReconnect() {
        this.log('WS', 'Force reconnecting...', 'warn');
        const chat = window.inboxChat;
        if (chat) {
            // Close existing
            if (chat.socket) {
                chat.socket.onclose = null;
                chat.socket.close();
                chat.socket = null;
            }
            chat.isSocketConnected = false;
            chat.isSocketConnecting = false;
            chat.socketReconnectAttempts = 0;
            chat.socketReconnectDelay = 3000;
            if (chat.socketReconnectTimer) clearTimeout(chat.socketReconnectTimer);

            // Reinitialize
            this.log('WS', 'Calling initializeWebSocket()...', 'info');
            const result = await chat.initializeWebSocket();
            this.log('WS', `Reconnect result: ${result}`, result ? 'success' : 'error');
        }
        this.updateStatusDisplay();
    }

    exportLogs() {
        const text = this.logEntries.map(e => `[${e.time}] [${e.tag}] ${e.message}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `realtime-debug-${new Date().toISOString().slice(0,19)}.log`;
        a.click();
        URL.revokeObjectURL(url);
        this.log('DEBUG', 'Logs exported', 'success');
    }
}

// Auto-initialize
window.inboxDebug = new InboxRealtimeDebug();
window.inboxDebug.init();
