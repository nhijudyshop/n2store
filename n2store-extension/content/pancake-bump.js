// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Pancake Comment-Count Booster — N2Store Extension UI
// Inject FAB + modal vào pancake.vn để bump comment count trên livestream post.
// API: POST /api/v1/pages/<pageId>/conversations/<convId>/messages
//      body: { action:"reply_comment", message_id, parent_id, post_id, message, send_by_platform:"web" }
// JWT từ localStorage (browser đang đăng nhập rồi).
//
// UI: Float Action Button (góc dưới-phải) → Modal (Shadow DOM isolated)
// Run on: pancake.vn (any path)

(function () {
    'use strict';
    if (window.__n2storePancakeBumpInjected) return;
    window.__n2storePancakeBumpInjected = true;

    // ── Bootstrap: capture pageId + JWT from Pancake's own outgoing API calls ──
    // Content script runs in MAIN world (per manifest) — wrap fetch + XHR
    // directly. Pancake's real API calls will trip our extractor.
    const ctx = (window.__n2storePancakeBumpCtx = window.__n2storePancakeBumpCtx || {
        pageId: null,
        jwt: null,
        firstSeenAt: null,
    });

    function extractCtx(url) {
        try {
            const u = String(url || '');
            const mp = u.match(/\/api\/v1\/pages\/(\d{10,20})/);
            const mt = u.match(/[?&]access_token=([^&]+)/);
            if (mp && !ctx.pageId) ctx.pageId = mp[1];
            if (mt && !ctx.jwt) {
                try {
                    ctx.jwt = decodeURIComponent(mt[1]);
                } catch (_) {
                    ctx.jwt = mt[1];
                }
            }
            if (!ctx.firstSeenAt && (ctx.pageId || ctx.jwt)) ctx.firstSeenAt = Date.now();
        } catch (_) {}
    }

    if (!window.__n2storeBumpFetchWrapped) {
        window.__n2storeBumpFetchWrapped = true;
        const _f = window.fetch;
        window.fetch = function (...args) {
            const u = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            extractCtx(u);
            return _f.apply(this, args);
        };
        const _xo = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            extractCtx(url);
            return _xo.apply(this, arguments);
        };
    }

    const LS_KEY = 'n2store.pancake.bump.cfg.v1';

    // Hardcoded list of N2Store's Pancake pages. ID-only (no tokens) — token
    // dùng JWT trong URL từ session đang đăng nhập, lấy từ sniffer.
    const KNOWN_PAGES = [
        { id: '270136663390370', name: 'NhiJudy Store' },
        { id: '117267091364524', name: 'Nhi Judy House' },
        { id: '112678138086607', name: 'Nhi Judy Ơi' },
    ];

    const DEFAULT_TEMPLATES = [
        '.',
        '..',
        '🙏',
        '❤',
        '❤❤',
        '🌹',
        '🥰',
        'Dạ ạ',
        'iB shop ạ',
        '✓',
        '👍',
        'Đẹp ạ',
    ];

    const ready = (fn) => {
        if (document.body) fn();
        else document.addEventListener('DOMContentLoaded', fn, { once: true });
    };

    ready(() => mount());

    function mount() {
        const host = document.createElement('div');
        host.id = 'n2store-pancake-bump-host';
        host.style.cssText = 'position:fixed; z-index:2147483647; bottom:0; right:0;';
        document.documentElement.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = renderShadowHTML();

        wireUI(shadow);
    }

    function renderShadowHTML() {
        return `
            <style>
                :host { all: initial; }
                * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

                .fab {
                    position: fixed; right: 24px; bottom: 24px;
                    width: 56px; height: 56px; border-radius: 50%;
                    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                    color: white; border: none; cursor: pointer;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                    font-size: 24px; display: flex; align-items: center; justify-content: center;
                    transition: transform .15s ease, box-shadow .15s ease;
                }
                .fab:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.4); }
                .fab:active { transform: translateY(0); }
                .fab .badge {
                    position: absolute; top: -6px; right: -6px;
                    background: #ef4444; color: white; font-size: 10px;
                    padding: 2px 6px; border-radius: 10px; font-weight: 700;
                }

                .overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
                    display: none; align-items: center; justify-content: center;
                    backdrop-filter: blur(2px);
                }
                .overlay.show { display: flex; }

                .modal {
                    background: #1e293b; color: #e2e8f0;
                    width: min(640px, 92vw); max-height: 88vh; overflow: hidden;
                    border-radius: 12px;
                    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
                    display: flex; flex-direction: column;
                    border: 1px solid #334155;
                }

                .header {
                    padding: 16px 20px; border-bottom: 1px solid #334155;
                    display: flex; align-items: center; justify-content: space-between;
                    background: linear-gradient(135deg, #14532d 0%, #166534 100%);
                }
                .header h2 { margin: 0; font-size: 16px; font-weight: 600; color: #f0fdf4; }
                .close-btn {
                    background: none; border: none; color: #f0fdf4; cursor: pointer;
                    width: 28px; height: 28px; border-radius: 6px; font-size: 20px;
                }
                .close-btn:hover { background: rgba(255,255,255,0.15); }

                .body { padding: 16px 20px; overflow-y: auto; flex: 1; }
                .row { margin-bottom: 14px; }
                .row label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.4px; }
                .row .hint { font-size: 11px; color: #64748b; margin-top: 4px; }

                input[type=text], input[type=number], textarea, select {
                    width: 100%; background: #0f172a; color: #e2e8f0;
                    border: 1px solid #334155; border-radius: 6px;
                    padding: 8px 10px; font-size: 13px; font-family: inherit;
                    outline: none; transition: border-color .15s;
                }
                input:focus, textarea:focus, select:focus { border-color: #22c55e; }
                textarea { resize: vertical; min-height: 80px; font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 12px; }

                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

                .stat-strip {
                    display: grid; grid-template-columns: 1fr 1fr 1fr;
                    gap: 8px; margin: 10px 0; padding: 10px;
                    background: #0f172a; border-radius: 6px; border: 1px solid #334155;
                }
                .stat { text-align: center; }
                .stat .num { font-size: 18px; font-weight: 700; color: #22c55e; }
                .stat .lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

                .footer {
                    padding: 12px 20px; border-top: 1px solid #334155;
                    display: flex; gap: 8px; justify-content: flex-end;
                    background: #0f172a;
                }
                .btn {
                    padding: 8px 16px; border-radius: 6px; cursor: pointer;
                    font-size: 13px; font-weight: 500; border: 1px solid transparent;
                    transition: all .15s;
                }
                .btn-secondary { background: transparent; color: #cbd5e1; border-color: #475569; }
                .btn-secondary:hover { background: #334155; }
                .btn-primary { background: #16a34a; color: white; border-color: #15803d; }
                .btn-primary:hover { background: #15803d; }
                .btn-primary:disabled { background: #475569; border-color: #475569; cursor: not-allowed; opacity: 0.6; }
                .btn-warn { background: #ea580c; color: white; border-color: #c2410c; }
                .btn-warn:hover { background: #c2410c; }

                .log {
                    background: #020617; border-radius: 6px; padding: 10px;
                    font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 11px;
                    max-height: 200px; overflow-y: auto; line-height: 1.5;
                    border: 1px solid #1e293b;
                }
                .log .line { margin: 0; padding: 1px 0; white-space: pre-wrap; word-break: break-word; }
                .log .ok { color: #4ade80; }
                .log .fail { color: #f87171; }
                .log .info { color: #94a3b8; }
                .log .dry { color: #fbbf24; }

                .progress-bar {
                    height: 4px; background: #1e293b; border-radius: 2px;
                    overflow: hidden; margin: 8px 0;
                }
                .progress-fill { height: 100%; background: linear-gradient(90deg, #16a34a, #22c55e); transition: width .25s; }

                .hidden { display: none !important; }

                .warning {
                    background: rgba(234, 88, 12, 0.1); border: 1px solid #ea580c;
                    border-radius: 6px; padding: 8px 10px; font-size: 12px; color: #fdba74;
                    margin-bottom: 12px;
                }
                .warning strong { color: #fed7aa; }

                .picker {
                    background: #0f172a; border: 1px solid #334155;
                    border-radius: 8px; margin-bottom: 12px; overflow: hidden;
                }
                .picker-head {
                    display: flex; gap: 6px; padding: 8px;
                    background: #1e293b; border-bottom: 1px solid #334155;
                    align-items: center; flex-wrap: wrap;
                }
                .picker-head input[type=text] {
                    flex: 1; min-width: 140px; padding: 6px 8px; font-size: 12px;
                }
                .picker-head select { width: auto; padding: 6px 8px; font-size: 12px; }
                .picker-head .btn { padding: 6px 10px; font-size: 11px; }
                .picker-list {
                    max-height: 260px; overflow-y: auto;
                    background: #020617;
                }
                .picker-empty { padding: 24px; text-align: center; color: #64748b; font-size: 12px; }
                .conv-row {
                    display: flex; align-items: center; gap: 10px;
                    padding: 8px 10px; border-bottom: 1px solid #1e293b;
                    cursor: pointer; transition: background .1s;
                }
                .conv-row:hover { background: #1e293b; }
                .conv-row.checked { background: rgba(22, 163, 74, 0.08); }
                .conv-row.answered { opacity: 0.55; }
                .conv-row input[type=checkbox] {
                    width: 16px; height: 16px; accent-color: #22c55e;
                    flex-shrink: 0; margin: 0; cursor: pointer;
                }
                .conv-info { flex: 1; min-width: 0; }
                .conv-name { font-size: 13px; color: #e2e8f0; font-weight: 500; }
                .conv-meta { font-size: 11px; color: #64748b; margin-top: 2px; display: flex; gap: 6px; align-items: center; }
                .conv-meta .tag {
                    background: #1e293b; color: #94a3b8; padding: 1px 6px;
                    border-radius: 3px; font-size: 10px;
                }
                .conv-meta .tag.answered { background: #422006; color: #fbbf24; }
                .conv-time { color: #64748b; font-size: 11px; flex-shrink: 0; }

                .picker-counter {
                    padding: 6px 10px; font-size: 11px; color: #94a3b8;
                    background: #0f172a; border-top: 1px solid #1e293b;
                    display: flex; justify-content: space-between;
                }
                .picker-counter strong { color: #22c55e; }
            </style>

            <button class="fab" title="Bump Comment Livestream">🚀</button>

            <div class="overlay">
                <div class="modal">
                    <div class="header">
                        <h2>🚀 Bump Comment Livestream</h2>
                        <button class="close-btn" title="Đóng">×</button>
                    </div>

                    <div class="body">
                        <div class="warning">
                            <strong>Lưu ý:</strong> Tính năng gửi public comment-reply hàng loạt vào các thread comment từ livestream. KHÔNG gửi DM khách. Mục đích: tăng comment count → đẩy reach. Khách vẫn nhận FB notification "X replied to your comment".
                        </div>

                        <div class="row">
                            <label>📄 Page</label>
                            <div style="display:flex; gap:6px;">
                                <select id="cfg-page-select" style="flex:1;"></select>
                                <button class="btn btn-secondary" id="btn-add-page" title="Thêm page bằng tay">+ Thêm</button>
                            </div>
                            <div class="hint" id="page-hint">Chọn page hoặc thêm bằng tay (ID + tên).</div>
                        </div>

                        <div class="stat-strip" id="stats">
                            <div class="stat"><div class="num" id="stat-page">-</div><div class="lbl">Page ID</div></div>
                            <div class="stat"><div class="num" id="stat-live">-</div><div class="lbl">Livestream convs</div></div>
                            <div class="stat"><div class="num" id="stat-queue">-</div><div class="lbl">Sẽ gửi</div></div>
                        </div>

                        <div class="grid-3">
                            <div class="row">
                                <label for="cfg-limit">Số reply tối đa</label>
                                <input type="number" id="cfg-limit" min="1" max="200" value="30">
                                <div class="hint">1–200</div>
                            </div>
                            <div class="row">
                                <label for="cfg-delay-min">Delay min (ms)</label>
                                <input type="number" id="cfg-delay-min" min="300" max="30000" value="2500">
                            </div>
                            <div class="row">
                                <label for="cfg-delay-max">Delay max (ms)</label>
                                <input type="number" id="cfg-delay-max" min="300" max="60000" value="5500">
                            </div>
                        </div>

                        <div class="grid-2">
                            <div class="row">
                                <label for="cfg-per-conv">Cap mỗi conversation</label>
                                <input type="number" id="cfg-per-conv" min="1" max="20" value="1">
                                <div class="hint">Mặc định 1 = mỗi khách 1 reply / lần chạy</div>
                            </div>
                            <div class="row">
                                <label for="cfg-skip-answered">Skip đã reply rồi</label>
                                <select id="cfg-skip-answered">
                                    <option value="yes" selected>Có (an toàn)</option>
                                    <option value="no">Không (reply tất cả)</option>
                                </select>
                            </div>
                        </div>

                        <div class="row">
                            <label for="cfg-templates">Templates comment (mỗi dòng 1 cái — random pick)</label>
                            <textarea id="cfg-templates" rows="5"></textarea>
                            <div class="hint">Tối thiểu 1 dòng. Mix ≥ 5 loại để tránh FB flag spam.</div>
                        </div>

                        <div class="row">
                            <label for="cfg-post-id">Giới hạn vào 1 post ID (optional)</label>
                            <input type="text" id="cfg-post-id" placeholder="Để trống = tất cả livestream">
                        </div>

                        <div class="row">
                            <label>Chọn conversations để bump</label>
                            <div class="picker">
                                <div class="picker-head">
                                    <input type="text" id="picker-search" placeholder="🔍 Tìm tên...">
                                    <select id="picker-filter">
                                        <option value="all">Tất cả</option>
                                        <option value="unanswered">Chưa reply</option>
                                        <option value="answered">Đã reply</option>
                                    </select>
                                    <button class="btn btn-secondary" id="picker-check-all">Tick tất cả</button>
                                    <button class="btn btn-secondary" id="picker-uncheck-all">Bỏ tick</button>
                                    <button class="btn btn-secondary" id="picker-refresh" title="Refresh danh sách">↻</button>
                                </div>
                                <div class="picker-list" id="picker-list">
                                    <div class="picker-empty">Bấm Refresh ↻ để load danh sách</div>
                                </div>
                                <div class="picker-counter">
                                    <span>Hiển thị: <strong id="picker-visible">0</strong>/<span id="picker-total">0</span></span>
                                    <span>Đã chọn: <strong id="picker-selected">0</strong></span>
                                </div>
                            </div>
                        </div>

                        <div class="progress-bar hidden" id="progress-wrap"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
                        <div class="log hidden" id="log"></div>
                    </div>

                    <div class="footer">
                        <button class="btn btn-secondary" id="btn-cancel">Đóng</button>
                        <button class="btn btn-secondary" id="btn-dry">Dry-run</button>
                        <button class="btn btn-warn" id="btn-stop" disabled>Dừng</button>
                        <button class="btn btn-primary" id="btn-run">Chạy thật</button>
                    </div>
                </div>
            </div>
        `;
    }

    function wireUI(shadow) {
        const $ = (sel) => shadow.querySelector(sel);
        const els = {
            fab: $('.fab'),
            overlay: $('.overlay'),
            close: $('.close-btn'),
            cancel: $('#btn-cancel'),
            dry: $('#btn-dry'),
            run: $('#btn-run'),
            stop: $('#btn-stop'),
            limit: $('#cfg-limit'),
            delayMin: $('#cfg-delay-min'),
            delayMax: $('#cfg-delay-max'),
            perConv: $('#cfg-per-conv'),
            skipAnswered: $('#cfg-skip-answered'),
            templates: $('#cfg-templates'),
            postId: $('#cfg-post-id'),
            statPage: $('#stat-page'),
            statLive: $('#stat-live'),
            statQueue: $('#stat-queue'),
            log: $('#log'),
            progressWrap: $('#progress-wrap'),
            progressFill: $('#progress-fill'),
            pickerSearch: $('#picker-search'),
            pickerFilter: $('#picker-filter'),
            pickerCheckAll: $('#picker-check-all'),
            pickerUncheckAll: $('#picker-uncheck-all'),
            pickerRefresh: $('#picker-refresh'),
            pickerList: $('#picker-list'),
            pickerVisible: $('#picker-visible'),
            pickerTotal: $('#picker-total'),
            pickerSelected: $('#picker-selected'),
            pageSelect: $('#cfg-page-select'),
            btnAddPage: $('#btn-add-page'),
            pageHint: $('#page-hint'),
        };

        populatePageSelect(els);

        // Picker state
        els.state = {
            convs: [], // all fetched livestream conversations
            selected: new Set(), // conv.id of checked rows
        };

        loadCfg(els);

        els.fab.addEventListener('click', () => openModal(els));
        els.close.addEventListener('click', () => closeModal(els));
        els.cancel.addEventListener('click', () => closeModal(els));
        els.overlay.addEventListener('click', (e) => {
            if (e.target === els.overlay) closeModal(els);
        });
        els.dry.addEventListener('click', () => runBump(els, true));
        els.run.addEventListener('click', () => runBump(els, false));
        els.stop.addEventListener('click', () => {
            window.__n2storeBumpStopFlag = true;
            appendLog(els, 'info', 'Đang dừng — đợi request hiện tại xong...');
        });

        ['limit', 'delayMin', 'delayMax', 'perConv', 'skipAnswered', 'templates', 'postId'].forEach(
            (k) => {
                els[k].addEventListener('change', () => saveCfg(els));
            }
        );

        // Picker events
        els.pickerSearch.addEventListener('input', () => renderConvList(els));
        els.pickerFilter.addEventListener('change', () => renderConvList(els));
        els.pickerRefresh.addEventListener('click', () => refreshConvs(els));
        els.pickerCheckAll.addEventListener('click', () => {
            for (const c of filteredConvs(els)) els.state.selected.add(c.id);
            renderConvList(els);
        });
        els.pickerUncheckAll.addEventListener('click', () => {
            for (const c of filteredConvs(els)) els.state.selected.delete(c.id);
            renderConvList(els);
        });
        els.postId.addEventListener('change', () => refreshConvs(els));

        // Page selector
        els.pageSelect.addEventListener('change', () => {
            const pid = els.pageSelect.value;
            if (pid && /^\d{10,20}$/.test(pid)) {
                ctx.pageId = pid;
                els.statPage.textContent = pid;
                saveCfg(els);
                refreshConvs(els);
            }
        });
        els.btnAddPage.addEventListener('click', () => {
            const id = prompt('Page ID (số):');
            if (!id || !/^\d{10,20}$/.test(id.trim())) return;
            const name = prompt('Tên page:', 'Page ' + id) || 'Page ' + id;
            const custom = loadCustomPages();
            custom.push({ id: id.trim(), name: name.trim() });
            saveCustomPages(custom);
            populatePageSelect(els);
            els.pageSelect.value = id.trim();
            els.pageSelect.dispatchEvent(new Event('change'));
        });
    }

    function loadCustomPages() {
        try {
            return JSON.parse(localStorage.getItem('n2store.pancake.bump.customPages.v1') || '[]');
        } catch (_) {
            return [];
        }
    }
    function saveCustomPages(list) {
        try {
            localStorage.setItem('n2store.pancake.bump.customPages.v1', JSON.stringify(list));
        } catch (_) {}
    }

    function populatePageSelect(els) {
        const custom = loadCustomPages();
        const seen = new Set();
        const all = [];
        for (const p of [...KNOWN_PAGES, ...custom]) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            all.push(p);
        }
        const saved = (() => {
            try {
                return JSON.parse(localStorage.getItem(LS_KEY) || '{}').pageId;
            } catch (_) {
                return null;
            }
        })();
        const current = ctx.pageId || saved || all[0]?.id || '';
        els.pageSelect.innerHTML = all
            .map(
                (p) =>
                    `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${escapeHtml(p.name)} (${p.id})</option>`
            )
            .join('');
        if (current && /^\d{10,20}$/.test(current)) {
            ctx.pageId = current;
            els.statPage.textContent = current;
        }
    }

    async function openModal(els) {
        els.overlay.classList.add('show');
        els.statLive.textContent = '...';
        els.statQueue.textContent = '-';
        els.log.classList.remove('hidden');
        clearLog(els);

        // Page comes from dropdown (hardcoded KNOWN_PAGES + custom adds). JWT
        // still needs Main-world sniffer because token rotates every login.
        const dropdownPid = els.pageSelect.value;
        if (dropdownPid && /^\d{10,20}$/.test(dropdownPid)) {
            ctx.pageId = dropdownPid;
        }
        els.statPage.textContent = ctx.pageId || '?';

        appendLog(els, 'info', 'Đang chờ Pancake gọi API để bắt JWT...');
        const ok = await waitForCtx(4500);
        if (!ctx.jwt) {
            appendLog(els, 'fail', 'JWT chưa bắt được. Pancake chưa gọi API có ?access_token.');
            appendLog(
                els,
                'info',
                'Mở trang Hội thoại của Pancake, đợi list load xong, rồi mở lại modal.'
            );
            return;
        }
        if (!ctx.pageId) {
            appendLog(els, 'fail', 'Chưa chọn page. Bấm dropdown 📄 Page ở trên rồi thử lại.');
            return;
        }
        appendLog(els, 'info', `Using: pageId=${ctx.pageId}, jwt=...${ctx.jwt.slice(-12)}`);
        await refreshConvs(els);
    }

    async function promptPagePicker(els) {
        const tok = ctx.jwt;
        const candidates = [
            '/api/v1/me/pages',
            '/api/v1/users/me/pages',
            '/api/v1/pages',
            '/api/v1/multi_pages/pages',
        ];
        let pages = null;
        let usedUrl = null;
        for (const p of candidates) {
            try {
                const r = await fetch(p + '?access_token=' + encodeURIComponent(tok), {
                    headers: { Accept: 'application/json' },
                });
                if (!r.ok) continue;
                const j = await r.json();
                const list = j?.pages || j?.data || j?.user_pages || (Array.isArray(j) ? j : null);
                if (Array.isArray(list) && list.length) {
                    pages = list;
                    usedUrl = p;
                    break;
                }
            } catch (_) {}
        }
        if (!pages) {
            appendLog(
                els,
                'fail',
                'Không fetch được list pages qua các endpoint thử (' + candidates.join(', ') + ').'
            );
            return false;
        }
        appendLog(els, 'info', `Tìm thấy ${pages.length} pages qua ${usedUrl}. Bấm để chọn:`);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; padding:6px 0;';
        let resolved = false;
        const result = new Promise((resolve) => {
            for (const p of pages) {
                const pid = String(p.id || p.page_id || p.fb_id || '');
                const pname = p.name || p.page_name || pid;
                if (!/^\d{10,20}$/.test(pid)) continue;
                const b = document.createElement('button');
                b.textContent = pname;
                b.style.cssText =
                    'background:#16a34a; color:white; border:none; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;';
                b.addEventListener('click', () => {
                    ctx.pageId = pid;
                    appendLog(els, 'ok', `Đã chọn page: ${pname} (${pid})`);
                    wrap.remove();
                    els.statPage.textContent = pid;
                    if (!resolved) {
                        resolved = true;
                        resolve(true);
                    }
                });
                wrap.appendChild(b);
            }
            els.log.appendChild(wrap);
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
            }, 60_000);
        });
        return result;
    }

    function closeModal(els) {
        if (window.__n2storeBumpRunning) {
            if (!confirm('Đang chạy. Dừng và đóng?')) return;
            window.__n2storeBumpStopFlag = true;
        }
        els.overlay.classList.remove('show');
    }

    async function refreshConvs(els) {
        const pageId = detectPageId();
        const jwt = getJwt();
        if (!pageId || !jwt) {
            appendLog(els, 'fail', 'Thiếu Page ID hoặc JWT.');
            return;
        }
        els.pickerList.innerHTML = '<div class="picker-empty">Đang load...</div>';
        try {
            const convs = await fetchLivestreamConvs(jwt, pageId, els.postId.value.trim());
            els.state.convs = convs;
            els.statLive.textContent = String(convs.length);
            // Default: select all unanswered (respect skip-answered config)
            const cfg = readCfg(els);
            els.state.selected = new Set();
            for (const c of convs) {
                if (cfg.skipAnswered && c.last_sent_by?.id === pageId) continue;
                els.state.selected.add(c.id);
            }
            renderConvList(els);
        } catch (e) {
            els.pickerList.innerHTML =
                '<div class="picker-empty">Lỗi load: ' +
                escapeHtml(String(e?.message || e)) +
                '</div>';
            appendLog(els, 'fail', 'Fetch convs lỗi: ' + (e?.message || e));
        }
    }

    function filteredConvs(els) {
        const q = (els.pickerSearch.value || '').toLowerCase().trim();
        const filter = els.pickerFilter.value;
        const pageId = detectPageId();
        return (els.state.convs || []).filter((c) => {
            const name = (c.from?.name || '').toLowerCase();
            if (q && !name.includes(q)) return false;
            const isAnswered = c.last_sent_by?.id === pageId;
            if (filter === 'answered' && !isAnswered) return false;
            if (filter === 'unanswered' && isAnswered) return false;
            return true;
        });
    }

    function renderConvList(els) {
        const visible = filteredConvs(els);
        const pageId = detectPageId();
        els.pickerVisible.textContent = String(visible.length);
        els.pickerTotal.textContent = String(els.state.convs.length);
        els.pickerSelected.textContent = String(els.state.selected.size);
        els.statQueue.textContent = String(els.state.selected.size);

        if (!visible.length) {
            els.pickerList.innerHTML =
                '<div class="picker-empty">Không có conversation nào khớp filter</div>';
            return;
        }

        const frag = document.createDocumentFragment();
        for (const c of visible) {
            const row = document.createElement('div');
            const checked = els.state.selected.has(c.id);
            const isAnswered = c.last_sent_by?.id === pageId;
            row.className =
                'conv-row' + (checked ? ' checked' : '') + (isAnswered ? ' answered' : '');
            const time = c.last_customer_interactive_at || c.inserted_at || '';
            const timeStr = time ? time.slice(11, 16) : '';
            row.innerHTML = `
                <input type="checkbox" ${checked ? 'checked' : ''}>
                <div class="conv-info">
                    <div class="conv-name">${escapeHtml(c.from?.name || '?')}</div>
                    <div class="conv-meta">
                        ${isAnswered ? '<span class="tag answered">đã reply</span>' : ''}
                        <span>post ${escapeHtml((c.post_id || '').split('_')[1] || '?')}</span>
                    </div>
                </div>
                <div class="conv-time">${timeStr}</div>
            `;
            const cb = row.querySelector('input');
            const toggle = () => {
                if (cb.checked) els.state.selected.add(c.id);
                else els.state.selected.delete(c.id);
                row.classList.toggle('checked', cb.checked);
                els.pickerSelected.textContent = String(els.state.selected.size);
                els.statQueue.textContent = String(els.state.selected.size);
            };
            cb.addEventListener('change', toggle);
            row.addEventListener('click', (e) => {
                if (e.target === cb) return;
                cb.checked = !cb.checked;
                toggle();
            });
            frag.appendChild(row);
        }
        els.pickerList.innerHTML = '';
        els.pickerList.appendChild(frag);
    }

    function escapeHtml(s) {
        return String(s).replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );
    }

    async function runBump(els, dryRun) {
        if (window.__n2storeBumpRunning) return;
        const cfg = readCfg(els);
        if (!cfg.templates.length) {
            appendLog(els, 'fail', 'Cần ít nhất 1 template.');
            return;
        }
        const pageId = detectPageId();
        const jwt = getJwt();
        if (!pageId || !jwt) {
            appendLog(els, 'fail', 'Thiếu Page ID hoặc JWT.');
            return;
        }

        window.__n2storeBumpRunning = true;
        window.__n2storeBumpStopFlag = false;
        els.run.disabled = true;
        els.dry.disabled = true;
        els.stop.disabled = false;
        els.log.classList.remove('hidden');
        els.progressWrap.classList.remove('hidden');
        clearLog(els);

        try {
            // Build queue from picker selection (intersected with fetched convs)
            // Re-fetch is not needed — user already curated the list via picker.
            const selectedIds = els.state.selected;
            if (!selectedIds.size) {
                appendLog(els, 'fail', 'Chưa chọn conversation nào. Tick ít nhất 1 dòng.');
                return;
            }
            const convsById = new Map((els.state.convs || []).map((c) => [c.id, c]));
            let queue = [...selectedIds].map((id) => convsById.get(id)).filter(Boolean);
            // Apply limit (hard safety cap)
            if (queue.length > cfg.limit) {
                appendLog(
                    els,
                    'info',
                    `Đã chọn ${queue.length} nhưng limit=${cfg.limit} → cap còn ${cfg.limit} đầu.`
                );
                queue = queue.slice(0, cfg.limit);
            }
            appendLog(
                els,
                'info',
                `${dryRun ? '[DRY-RUN] ' : ''}Page=${pageId}, queue=${queue.length} conversations.`
            );

            let okCount = 0;
            let failCount = 0;
            for (let i = 0; i < queue.length; i++) {
                if (window.__n2storeBumpStopFlag) {
                    appendLog(els, 'info', `Đã dừng tại ${i}/${queue.length}.`);
                    break;
                }
                const conv = queue[i];
                const tmpl = pick(cfg.templates);
                const tag = `[${i + 1}/${queue.length}] ${conv.from?.name || '?'} → "${tmpl}"`;

                if (dryRun) {
                    appendLog(els, 'dry', 'DRY ' + tag);
                    okCount++;
                } else {
                    const r = await sendCommentReply(jwt, pageId, conv, tmpl);
                    if (r.ok) {
                        appendLog(els, 'ok', '✓ ' + tag + ' → ' + r.newId);
                        okCount++;
                    } else {
                        appendLog(els, 'fail', '✗ ' + tag + ' → ' + (r.error || r.status));
                        failCount++;
                    }
                    if (i < queue.length - 1) {
                        const wait = rand(cfg.delayMin, cfg.delayMax);
                        await sleep(wait);
                    }
                }
                els.progressFill.style.width = ((i + 1) / queue.length) * 100 + '%';
            }

            appendLog(els, 'info', `=== Done. ok=${okCount} fail=${failCount} ===`);
        } catch (e) {
            appendLog(els, 'fail', 'Lỗi: ' + (e?.message || e));
        } finally {
            window.__n2storeBumpRunning = false;
            els.run.disabled = false;
            els.dry.disabled = false;
            els.stop.disabled = true;
        }
    }

    // ----- Pancake API helpers (port từ scripts/pancake-livestream-comment-spam.js) -----

    function getJwt() {
        if (ctx.jwt) return ctx.jwt;
        try {
            const ls = localStorage.getItem('jwt') || localStorage.getItem('access_token');
            if (ls) return ls;
        } catch (_) {}
        // Cookie fallback (works only for non-HttpOnly)
        const m = (document.cookie || '').match(/(?:^|;\s*)(?:jwt|access_token)=([^;]+)/);
        if (m) return decodeURIComponent(m[1]);
        return null;
    }

    function detectPageId() {
        if (ctx.pageId) return ctx.pageId;
        const imgs = document.querySelectorAll('img[src*="/api/v1/pages/"]');
        for (const img of imgs) {
            const m = (img.src || '').match(/\/api\/v1\/pages\/(\d{10,20})\//);
            if (m) return m[1];
        }
        const links = document.querySelectorAll('[href*="/pages/"], [data-page-id]');
        for (const el of links) {
            const id = el.getAttribute('data-page-id');
            if (id && /^\d{10,20}$/.test(id)) return id;
            const m = (el.getAttribute('href') || '').match(/\/pages\/(\d{10,20})/);
            if (m) return m[1];
        }
        return null;
    }

    async function waitForCtx(timeoutMs = 4000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (ctx.pageId && ctx.jwt) return true;
            await sleep(150);
        }
        return !!(ctx.pageId && ctx.jwt);
    }

    async function fetchLivestreamConvs(jwt, pageId, postIdScope) {
        const url =
            `/api/v1/pages/${encodeURIComponent(pageId)}/conversations` +
            `?unread_first=false&mode=OR&tags=%22ALL%22&except_tags=[]` +
            `&access_token=${encodeURIComponent(jwt)}` +
            `&cursor_mode=true&from_platform=web`;
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ type: 'COMMENT' }),
        });
        if (!r.ok) throw new Error(`Fetch convs failed: ${r.status}`);
        const j = await r.json();
        let convs = (j?.conversations || []).filter((c) => c?.post?.type === 'livestream');
        if (postIdScope) {
            convs = convs.filter(
                (c) => c.post_id === postIdScope || c.post_id?.endsWith('_' + postIdScope)
            );
        }
        return convs;
    }

    function selectQueue(convs, cfg) {
        const sorted = [...convs].sort((a, b) => {
            const ta = Date.parse(a.last_customer_interactive_at || a.inserted_at || 0) || 0;
            const tb = Date.parse(b.last_customer_interactive_at || b.inserted_at || 0) || 0;
            return tb - ta;
        });
        const perConv = new Map();
        const perCust = new Map();
        const out = [];
        for (const c of sorted) {
            if (out.length >= cfg.limit) break;
            if (cfg.skipAnswered && c.last_sent_by?.id === cfg.pageId) continue;
            const convKey = c.id;
            const custKey = c.customers?.[0]?.fb_id || c.from?.id || c.from?.name;
            if ((perConv.get(convKey) || 0) >= cfg.capPerConv) continue;
            if ((perCust.get(custKey) || 0) >= cfg.capPerConv) continue;
            perConv.set(convKey, (perConv.get(convKey) || 0) + 1);
            perCust.set(custKey, (perCust.get(custKey) || 0) + 1);
            out.push(c);
        }
        return out;
    }

    async function sendCommentReply(jwt, pageId, conv, message) {
        const url =
            `/api/v1/pages/${encodeURIComponent(pageId)}` +
            `/conversations/${encodeURIComponent(conv.id)}/messages` +
            `?access_token=${encodeURIComponent(jwt)}`;
        const body = {
            action: 'reply_comment',
            message_id: conv.id,
            parent_id: conv.id,
            user_selected_reply_to: null,
            post_id: conv.post_id,
            message,
            send_by_platform: 'web',
        };
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
            });
            const text = await r.text();
            let j = null;
            try {
                j = JSON.parse(text);
            } catch (_) {}
            if (r.ok && j?.success) return { ok: true, status: r.status, newId: j.id };
            return { ok: false, status: r.status, error: text.slice(0, 200) };
        } catch (e) {
            return { ok: false, error: String(e).slice(0, 200) };
        }
    }

    // ----- Config persistence -----

    function readCfg(els) {
        const pageId = detectPageId();
        return {
            pageId,
            limit: clamp(int(els.limit.value, 30), 1, 200),
            delayMin: clamp(int(els.delayMin.value, 2500), 300, 30000),
            delayMax: clamp(int(els.delayMax.value, 5500), 300, 60000),
            capPerConv: clamp(int(els.perConv.value, 1), 1, 20),
            skipAnswered: els.skipAnswered.value === 'yes',
            templates: els.templates.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            postId: els.postId.value.trim(),
        };
    }

    function loadCfg(els) {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        } catch (_) {}
        if (!saved) saved = {};
        els.limit.value = saved.limit ?? 30;
        els.delayMin.value = saved.delayMin ?? 2500;
        els.delayMax.value = saved.delayMax ?? 5500;
        els.perConv.value = saved.capPerConv ?? 1;
        els.skipAnswered.value = saved.skipAnswered === false ? 'no' : 'yes';
        els.templates.value = (
            saved.templates && saved.templates.length ? saved.templates : DEFAULT_TEMPLATES
        ).join('\n');
        els.postId.value = saved.postId ?? '';
    }

    function saveCfg(els) {
        const cfg = readCfg(els);
        delete cfg.pageId;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(cfg));
        } catch (_) {}
    }

    // ----- Log helpers -----

    function appendLog(els, level, msg) {
        const ts = new Date().toTimeString().slice(0, 8);
        const line = document.createElement('div');
        line.className = 'line ' + level;
        line.textContent = `[${ts}] ${msg}`;
        els.log.appendChild(line);
        els.log.scrollTop = els.log.scrollHeight;
    }

    function clearLog(els) {
        els.log.innerHTML = '';
        els.progressFill.style.width = '0%';
    }

    // ----- Utils -----

    function int(v, d) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : d;
    }
    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }
    function pick(a) {
        return a[Math.floor(Math.random() * a.length)];
    }
    function rand(lo, hi) {
        return Math.floor(lo + Math.random() * (hi - lo + 1));
    }
    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
})();
