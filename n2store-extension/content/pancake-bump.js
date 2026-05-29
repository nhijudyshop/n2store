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

    const LS_KEY = 'n2store.pancake.bump.cfg.v1';
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
    }

    async function openModal(els) {
        els.overlay.classList.add('show');
        const pageId = detectPageId();
        els.statPage.textContent = pageId || '?';
        els.statLive.textContent = '...';
        els.statQueue.textContent = '-';
        if (!pageId) {
            appendLog(
                els,
                'fail',
                'Không detect được Page ID. Mở 1 page Pancake trước rồi thử lại.'
            );
            return;
        }
        try {
            const jwt = getJwt();
            if (!jwt) {
                appendLog(els, 'fail', 'Không tìm thấy JWT. Đăng nhập Pancake trước.');
                return;
            }
            const convs = await fetchLivestreamConvs(jwt, pageId, els.postId.value.trim());
            els.statLive.textContent = String(convs.length);
            updateQueueStat(els, convs);
        } catch (e) {
            els.statLive.textContent = 'err';
            appendLog(els, 'fail', 'Fetch convs lỗi: ' + (e?.message || e));
        }
    }

    function closeModal(els) {
        if (window.__n2storeBumpRunning) {
            if (!confirm('Đang chạy. Dừng và đóng?')) return;
            window.__n2storeBumpStopFlag = true;
        }
        els.overlay.classList.remove('show');
    }

    async function updateQueueStat(els, convs) {
        const cfg = readCfg(els);
        const queue = selectQueue(convs, cfg);
        els.statQueue.textContent = String(queue.length);
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
            appendLog(
                els,
                'info',
                `${dryRun ? '[DRY-RUN] ' : ''}Page=${pageId}, fetching livestream convs...`
            );
            const convs = await fetchLivestreamConvs(jwt, pageId, cfg.postId);
            appendLog(els, 'info', `Fetched ${convs.length} livestream conversations.`);
            els.statLive.textContent = String(convs.length);
            const queue = selectQueue(convs, cfg);
            els.statQueue.textContent = String(queue.length);
            appendLog(
                els,
                'info',
                `Queue: ${queue.length} convs (cap-per-conv=${cfg.capPerConv}, skip-answered=${cfg.skipAnswered})`
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
        try {
            return localStorage.getItem('jwt') || localStorage.getItem('access_token') || null;
        } catch (_) {
            return null;
        }
    }

    function detectPageId() {
        // Try cookies, then any /api/v1/pages/<id>/ URL on the page
        const imgs = document.querySelectorAll('img[src*="/api/v1/pages/"]');
        for (const img of imgs) {
            const m = (img.src || '').match(/\/api\/v1\/pages\/(\d{10,20})\//);
            if (m) return m[1];
        }
        // Try any link href
        const links = document.querySelectorAll('[href*="/pages/"], [data-page-id]');
        for (const el of links) {
            const id = el.getAttribute('data-page-id');
            if (id && /^\d{10,20}$/.test(id)) return id;
            const m = (el.getAttribute('href') || '').match(/\/pages\/(\d{10,20})/);
            if (m) return m[1];
        }
        return null;
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
