// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Web2CustomerChat: launcher chat KH (Pancake + Zalo) dùng chung mọi trang.
// =====================================================================
// Web2CustomerChat — mở FULL chat với khách (đọc lịch sử + soạn + gửi), 2 kênh
// Pancake (Facebook) và Zalo, theo SĐT. Dùng chung cho mọi trang web2.
//
//   Web2CustomerChat.open({ phone, name?, channel? })   // channel: 'pancake'|'zalo'
//      → mở drawer phải, tab Pancake | Zalo, lazy-mount khi xem tab.
//   Web2CustomerChat.resolvePancakeConv(phone)          // → conv | null (tái dùng)
//
// REUSE (không dựng lại engine):
//   • Pancake UI  : Web2ChatPanel (web2/shared/chat-panel/web2-chat-panel.js) — lazy-load.
//   • Zalo UI     : Web2Zalo.mountChat (web2/shared/web2-zalo.js).
//   • API         : Web2Chat (web2/shared/web2-chat-client.js).
//   • 24h bypass  : Web2Ext (extension) — gửi cả ngoài 24h khi có extension.
//   • Hiệu ứng    : Web2Lottie (airbnb/lottie-web) cho loading / trống.
// Host page chỉ cần load: web2-chat-client.js + web2-zalo.js + web2-customer-chat.js
// (panel bundle được lazy-load khi mở tab Pancake lần đầu).
// =====================================================================
(function (global) {
    if (global.Web2CustomerChat) return;

    const _selfSrc = (document.currentScript && document.currentScript.src) || '';
    const SHARED_BASE = _selfSrc.replace(/\/web2-customer-chat\.js(?:\?.*)?$/, '') || '../shared';
    const PANEL_VER = '20260615';
    const WORKER =
        (global.Web2Chat && global.Web2Chat._internal && global.Web2Chat._internal.WORKER_URL) ||
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    const notify = (m, t) => global.notificationManager?.show?.(m, t || 'info');
    const esc = (s) => {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    };

    // ── lazy-load panel bundle (chỉ tải khi mở tab Pancake lần đầu) ──────
    function _hasScript(url) {
        const base = url.split('?')[0];
        return Array.from(document.scripts).some((s) => s.src && s.src.indexOf(base) !== -1);
    }
    function _loadScript(url) {
        return new Promise((res, rej) => {
            if (_hasScript(url)) return res();
            const el = document.createElement('script');
            el.src = url;
            el.onload = res;
            el.onerror = () => rej(new Error('Không tải được ' + url));
            document.head.appendChild(el);
        });
    }
    function _loadCss(url) {
        const base = url.split('?')[0];
        const has = Array.from(document.querySelectorAll('link[rel=stylesheet]')).some(
            (l) => l.href && l.href.indexOf(base) !== -1
        );
        if (has) return;
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = url;
        document.head.appendChild(l);
    }
    let _panelPromise = null;
    function loadPanelBundle() {
        if (global.Web2ChatPanel) return Promise.resolve();
        if (_panelPromise) return _panelPromise;
        _panelPromise = (async () => {
            _loadCss(`${SHARED_BASE}/chat-panel/web2-chat-panel.css?v=${PANEL_VER}`);
            for (const j of [
                'chat-panel/web2-chat-emoji-data.js',
                'chat-panel/web2-chat-sticker-data.js',
                'chat-panel/web2-chat-entity-detect.js',
                'chat-panel/web2-chat-panel.js',
            ]) {
                await _loadScript(`${SHARED_BASE}/${j}?v=${PANEL_VER}`);
            }
        })();
        return _panelPromise;
    }

    // ── Pancake: tìm hội thoại INBOX theo SĐT (quét mọi page) ───────────
    function _getPageIds() {
        const set = new Set();
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                for (const p of Array.isArray(v?.pages) ? v.pages : []) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {}
        const pat = global.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    }
    function _pageName(pageId) {
        try {
            const accs = global.Web2Chat?.getAllAccounts?.() || {};
            for (const v of Object.values(accs)) {
                for (const p of Array.isArray(v?.pages) ? v.pages : []) {
                    if (String(p?.id || p?.page_id || p?.pageId) === String(pageId))
                        return p?.name || p?.page_name || 'shop';
                }
            }
        } catch {}
        return 'shop';
    }
    async function resolvePancakeConv(phone) {
        if (!global.Web2Chat?.searchConversations) return null;
        try {
            await global.Web2Chat.syncFromRenderDB?.();
        } catch {}
        const pageIds = _getPageIds();
        if (!pageIds.length) return null;
        const q = String(phone || '').replace(/\s+/g, '');
        const settled = await Promise.allSettled(
            pageIds.map((pid) => global.Web2Chat.searchConversations(pid, q))
        );
        let best = null;
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) {
                if (!c.id) continue;
                c.page_id = String(c.page_id || c.fb_page_id || pageIds[i] || '');
                const isInbox = (c.type || '').toUpperCase() === 'INBOX';
                if (!best || (isInbox && !best._isInbox)) {
                    c._isInbox = isInbox;
                    best = c;
                }
            }
        }
        return best;
    }

    // ── Gửi tin Pancake: extension-first (bypass 24h) → fallback Web2Chat ─
    function _fileToDataUrl(file) {
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = rej;
            fr.readAsDataURL(file);
        });
    }
    async function _trySendViaExtension(conv, text, att, stickerId) {
        if (!conv || (!text && !att && !stickerId)) return false;
        if (!global.Web2Ext?.hasExtension?.()) return false;
        try {
            const pageId = conv.page_id;
            const customerId = conv.customers?.[0]?.id || null;
            const psid = conv.from?.id || conv.from_psid || conv.customers?.[0]?.fb_id || '';
            const threadId =
                conv.thread_id ||
                (String(conv.id).includes('_') ? String(conv.id).split('_')[1] : conv.id);
            const custName = conv.from?.name || conv.customers?.[0]?.name || '';
            let globalUserId = conv._fbGlobalUserId || null;
            if (!globalUserId && global.Web2Chat?.fetchMessages) {
                try {
                    const mr = await global.Web2Chat.fetchMessages(pageId, conv.id, customerId);
                    if (mr?.ok) {
                        const cust = mr.customers?.find?.((c) => c?.global_id) || mr.customers?.[0];
                        const gid =
                            cust?.global_id || mr.conversation?.page_customer?.global_id || null;
                        if (gid && String(gid) !== String(psid)) {
                            globalUserId = String(gid);
                            conv._fbGlobalUserId = globalUserId;
                        }
                    }
                } catch {}
            }
            if (!globalUserId && pageId && (threadId || custName)) {
                try {
                    const g = await global.Web2Ext.request(
                        'GET_GLOBAL_ID_FOR_CONV',
                        {
                            pageId,
                            threadId: threadId || '',
                            customerName: custName,
                            isBusiness: true,
                        },
                        30000
                    );
                    globalUserId =
                        g?.data?.globalId ||
                        g?.data?.globalUserId ||
                        g?.data?.payload?.globalUserId ||
                        null;
                    if (globalUserId) conv._fbGlobalUserId = globalUserId;
                } catch {}
            }
            let files = [];
            let attachmentType = 'SEND_TEXT_ONLY';
            if (stickerId) {
                files = [stickerId];
                attachmentType = 'STICKER';
            } else if (att && att.file) {
                const dataUrl = await _fileToDataUrl(att.file);
                const up = await global.Web2Ext.request(
                    'UPLOAD_INBOX_PHOTO',
                    { pageId, photoUrl: dataUrl, name: att.file.name || 'attachment' },
                    60000
                );
                const fbId = up?.data?.fbId;
                if (!up.ok || !fbId) return false;
                files = [fbId];
                attachmentType = att.kind || 'FILE';
            }
            const swConvId = threadId ? 't_' + threadId : String(conv.id);
            const r = await global.Web2Ext.request(
                'REPLY_INBOX_PHOTO',
                {
                    pageId,
                    globalUserId: globalUserId || psid,
                    threadId: threadId || '',
                    convId: swConvId,
                    customerName: custName,
                    conversationUpdatedTime: conv.updated_at
                        ? new Date(conv.updated_at).getTime()
                        : Date.now(),
                    message: text || '',
                    attachmentType,
                    files,
                    platform: 'facebook',
                    isBusiness: true,
                },
                60000
            );
            return !!r.ok;
        } catch {
            return false;
        }
    }
    async function _performSend(conv, text, att) {
        const pageId = conv.page_id;
        const convId = conv.id;
        const customerId = conv.customers?.[0]?.id || null;
        const action = conv.type === 'COMMENT' ? 'reply_comment' : 'reply_inbox';
        // 1) Extension-first (bypass 24h)
        if ((text || att) && (await _trySendViaExtension(conv, text, att))) {
            return {
                via: 'extension',
                sent: {
                    id: 'ext_' + Date.now(),
                    message: text || (att ? '[Tệp đính kèm]' : ''),
                    from: { id: pageId, name: 'You' },
                    inserted_at: new Date().toISOString(),
                },
            };
        }
        // 2) Fallback Web2Chat: upload media → send (+ PAT retry)
        const attachments = [];
        if (att && att.file) {
            const up = await global.Web2Chat.uploadMedia(pageId, att.file);
            if (up && up.ok && up.id) attachments.push({ content_id: up.id });
            else throw new Error('Upload tệp thất bại (' + (up?.reason || 'Pancake') + ')');
        }
        let res = await global.Web2Chat.sendMessage(pageId, convId, {
            text,
            action,
            customerId,
            attachments,
        });
        if (
            res &&
            !res.ok &&
            (res.reason === 'no_page_access_token' || res.e_code === 105) &&
            global.Web2Chat.generatePageAccessToken
        ) {
            const g = await global.Web2Chat.generatePageAccessToken(pageId);
            if (g && g.ok)
                res = await global.Web2Chat.sendMessage(pageId, convId, {
                    text,
                    action,
                    customerId,
                    attachments,
                });
        }
        if (!res || !res.ok) throw new Error(res?.reason || 'Gửi tin thất bại');
        const m = res.message && typeof res.message === 'object' ? res.message : {};
        const sent = {
            id: m.id || 'pk_' + Date.now(),
            message:
                m.message ||
                m.original_message ||
                text ||
                (attachments.length ? '[Tệp đính kèm]' : ''),
            from: m.from || { id: pageId, name: 'You' },
            inserted_at: m.inserted_at || new Date().toISOString(),
            attachments: m.attachments,
        };
        return { via: 'pancake', sent };
    }

    // ── Adapter Pancake tự chứa (chỉ phụ thuộc Web2Chat/Web2Ext) ─────────
    function buildPancakeAdapter(conv) {
        const pageId = conv.page_id;
        const convId = conv.id;
        let _gen = 0;
        return {
            pageName: _pageName(pageId),
            hasExtension: !!global.Web2Ext?.hasExtension?.(),
            quickReplies() {
                return [];
            },
            async loadMessages() {
                const customerId = conv.customers?.[0]?.id || null;
                const r = await global.Web2Chat.fetchMessages(pageId, convId, customerId);
                _gen++;
                const msgs =
                    r && r.ok && Array.isArray(r.messages) ? r.messages.slice().reverse() : [];
                if (r && Array.isArray(r.customers) && r.customers.length)
                    conv.customers = r.customers;
                return { messages: msgs, hasMore: msgs.length > 0 };
            },
            async loadOlder(cursor) {
                const gen = _gen;
                const r = await global.Web2Chat.fetchMessages(
                    pageId,
                    convId,
                    conv.customers?.[0]?.id || null,
                    {
                        currentCount: cursor,
                    }
                );
                if (gen !== _gen) return { messages: [] };
                const older =
                    r && r.ok && Array.isArray(r.messages) ? r.messages.slice().reverse() : [];
                return { messages: older };
            },
            async send({ text, attachment }) {
                const res = await _performSend(conv, text, attachment || null);
                if (res?.via === 'extension')
                    notify('Đã gửi qua N2 Extension (bypass 24h)', 'success');
                return res;
            },
        };
    }

    // ── CSS drawer (scoped .w2cc-, inject 1 lần) ────────────────────────
    function ensureStyles() {
        if (document.getElementById('w2cc-styles')) return;
        const css = `
.w2cc-back{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:1300;display:flex;justify-content:flex-end;opacity:0;transition:opacity .22s cubic-bezier(.16,1,.3,1)}
.w2cc-back.show{opacity:1}
.w2cc-drawer{width:min(460px,100%);height:100%;background:var(--web2-surface,#fff);display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(15,23,42,.18);transform:translateX(28px);transition:transform .22s cubic-bezier(.16,1,.3,1)}
.w2cc-back.show .w2cc-drawer{transform:none}
.w2cc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--web2-border,#e5e7eb);flex-shrink:0}
.w2cc-head-who{min-width:0}
.w2cc-head-who b{display:block;font-weight:800;font-size:15px;color:var(--web2-text,#111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w2cc-head-who span{font-size:12px;color:var(--web2-text-mute,#6b7280)}
.w2cc-phone{cursor:pointer;border-radius:4px;padding:1px 4px;transition:background .15s,color .15s}
.w2cc-phone:hover{background:color-mix(in oklab,var(--web2-primary,#0068ff) 14%,transparent);color:var(--web2-primary,#0068ff)}
.w2cc-x{border:0;background:transparent;color:var(--web2-text-mute,#6b7280);cursor:pointer;border-radius:8px;width:32px;height:32px;display:grid;place-items:center;flex-shrink:0}
.w2cc-x:hover{background:var(--web2-bg,#f1f5f9);color:var(--web2-text,#111827)}
.w2cc-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 12px;border-bottom:1px solid var(--web2-border,#e5e7eb);flex-shrink:0}
.w2cc-tab{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:9px;border:1.5px solid var(--web2-border,#e5e7eb);background:transparent;color:var(--web2-text-mute,#6b7280);font-weight:700;font-size:13px;cursor:pointer;transition:all .18s}
.w2cc-tab:hover{border-color:var(--web2-primary,#0068ff);color:var(--web2-text,#111827)}
.w2cc-tab.on{border-color:var(--web2-primary,#0068ff);background:color-mix(in oklab,var(--web2-primary,#0068ff) 12%,transparent);color:var(--web2-primary,#0068ff)}
.w2cc-tab i{width:16px;height:16px}
.w2cc-panes{flex:1 1 auto;min-height:0;position:relative}
.w2cc-pane{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.w2cc-pane[hidden]{display:none!important}
.w2cc-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--web2-text-mute,#6b7280);padding:24px;text-align:center}
.w2cc-state [data-w2-lottie],.w2cc-state .w2cc-ico{width:84px;height:84px;display:grid;place-items:center}
/* ── layout:'modal' — 3-cột Pancake (sidebar tìm kiếm + thread + info) ── */
.w2cc-mback{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1300;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s cubic-bezier(.16,1,.3,1);padding:2vh 2vw}
.w2cc-mback.show{opacity:1}
.w2cc-modal{width:96vw;max-width:1500px;height:92vh;background:var(--web2-surface,#fff);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.28);transform:translateY(10px);transition:transform .2s cubic-bezier(.16,1,.3,1)}
.w2cc-mback.show .w2cc-modal{transform:none}
.w2cc-mhead{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--web2-border,#e5e7eb);flex-shrink:0}
.w2cc-mhead b{font-size:15px;font-weight:800;color:var(--web2-text,#111827)}
.w2cc-mhead .w2cc-chtabs{display:flex;gap:6px;margin-left:auto}
.w2cc-chtab{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1.5px solid var(--web2-border,#e5e7eb);background:transparent;color:var(--web2-text-mute,#6b7280);font-weight:700;font-size:12px;cursor:pointer;transition:all .15s}
.w2cc-chtab.on{border-color:var(--web2-primary,#0068ff);background:color-mix(in oklab,var(--web2-primary,#0068ff) 12%,transparent);color:var(--web2-primary,#0068ff)}
.w2cc-grid{flex:1;min-height:0;display:grid;grid-template-columns:320px 1fr;overflow:hidden}
.w2cc-grid.has-info{grid-template-columns:300px 1fr 340px}
.w2cc-side{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--web2-border,#e5e7eb);background:var(--web2-bg,#f8fafc)}
.w2cc-side-search{padding:10px;flex-shrink:0;border-bottom:1px solid var(--web2-border,#e5e7eb)}
.w2cc-side-search input{width:100%;height:38px;border:1px solid var(--web2-border,#e5e7eb);border-radius:9px;padding:0 12px;font-size:13px;background:var(--web2-surface,#fff);outline:none}
.w2cc-side-search input:focus{border-color:var(--web2-primary,#0068ff)}
.w2cc-side-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.w2cc-row{display:flex;gap:10px;align-items:center;padding:10px 12px;cursor:pointer;border-bottom:1px solid color-mix(in oklab,var(--web2-border,#e5e7eb) 55%,transparent);transition:background .12s}
.w2cc-row:hover{background:color-mix(in oklab,var(--web2-primary,#0068ff) 7%,transparent)}
.w2cc-row.on{background:color-mix(in oklab,var(--web2-primary,#0068ff) 13%,transparent)}
.w2cc-row-av{width:42px;height:42px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-weight:700;font-size:15px;overflow:hidden;position:relative}
.w2cc-row-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.w2cc-row-main{min-width:0;flex:1}
.w2cc-row-name{font-weight:700;font-size:13px;color:var(--web2-text,#111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w2cc-row-snip{font-size:12px;color:var(--web2-text-mute,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w2cc-row-time{font-size:10px;color:var(--web2-text-mute,#9ca3af);flex-shrink:0;align-self:flex-start}
.w2cc-main{display:flex;flex-direction:column;min-height:0;position:relative}
.w2cc-side-empty{padding:24px 12px;text-align:center;color:var(--web2-text-mute,#9ca3af);font-size:12px}
`;
        const el = document.createElement('style');
        el.id = 'w2cc-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    function _stateHtml(kind, text) {
        const lot = global.Web2Lottie
            ? `<div data-w2-lottie="${kind === 'loading' ? 'loading' : 'empty'}"></div>`
            : `<div class="w2cc-ico"><i data-lucide="${kind === 'loading' ? 'loader' : 'message-square-off'}"></i></div>`;
        return `<div class="w2cc-state">${lot}<div>${esc(text)}</div></div>`;
    }

    // ── open(): drawer + 2 tab, lazy-mount mỗi kênh khi xem ─────────────
    let _active = null;
    // Resolve hội thoại Pancake theo fbId + pageId (fallback khi không có / không
    // match SĐT). Dùng cho caller có sẵn fb_user_id của đơn (vd native-orders).
    async function _resolveConvByFbId(fbId, pageId) {
        if (!fbId || !pageId || !global.Web2Chat?.fetchConversations) return null;
        try {
            const r = await global.Web2Chat.fetchConversations(pageId, fbId);
            const list = (r && r.ok && r.conversations) || [];
            const conv = list.find((c) => (c.type || '').toUpperCase() === 'INBOX') || list[0];
            if (conv && conv.id) {
                conv.page_id = String(conv.page_id || conv.fb_page_id || pageId);
                return conv;
            }
        } catch {}
        return null;
    }

    // ── helpers cho layout:'modal' (sidebar conv-list + search) ──────────
    function _mInitial(name) {
        const s = String(name || '?').trim();
        return s ? s.split(/\s+/).slice(-1)[0].charAt(0).toUpperCase() : '?';
    }
    function _mColor(name) {
        let h = 0;
        const s = String(name || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return `hsl(${h % 360},56%,50%)`;
    }
    function _mAvatarUrl(fbId, pageId) {
        if (!fbId || !pageId) return '';
        const jwt = global.Web2Chat?.getJwt?.() || '';
        const p = new URLSearchParams({ id: String(fbId), page: String(pageId) });
        if (jwt) p.set('token', jwt);
        return `${WORKER}/api/fb-avatar?${p.toString()}`;
    }
    // GMT+7. Pancake inserted_at = UTC KHÔNG hậu tố Z → append Z (CLAUDE.md note 10).
    function _mTime(ts) {
        if (!ts) return '';
        try {
            let s = String(ts);
            if (!/^\d+$/.test(s) && !/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
            const d = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
            return d.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            });
        } catch {
            return '';
        }
    }
    function _convRowHtml(c) {
        const cust = (c.customers && c.customers[0]) || c.from || {};
        const name = cust.name || cust.full_name || c.name || 'Khách';
        const fbId = String(cust.fb_id || cust.id || c.from_psid || '');
        const pageId = String(c.page_id || c.fb_page_id || '');
        const snip = c.snippet || c.last_message || c.last_sent_by?.message || '';
        const time = _mTime(c.updated_at || c.inserted_at || '');
        const url = fbId && pageId ? _mAvatarUrl(fbId, pageId) : '';
        const initial = _mInitial(name);
        const color = _mColor(name);
        const av = url
            ? `<div class="w2cc-row-av" style="background:${color}"><span>${esc(initial)}</span><img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()"></div>`
            : `<div class="w2cc-row-av" style="background:${color}">${esc(initial)}</div>`;
        return `<div class="w2cc-row" data-conv-id="${esc(String(c.id))}" data-page-id="${esc(pageId)}" data-fb-id="${esc(fbId)}" data-name="${esc(name)}">
            ${av}
            <div class="w2cc-row-main"><div class="w2cc-row-name">${esc(name)}</div><div class="w2cc-row-snip">${esc(String(snip).slice(0, 64))}</div></div>
            ${time ? `<span class="w2cc-row-time">${esc(time)}</span>` : ''}
        </div>`;
    }
    function _mergeConvs(settled, pageIds) {
        const map = new Map();
        settled.forEach((r, i) => {
            if (r.status !== 'fulfilled' || !r.value?.ok) return;
            for (const c of r.value.conversations || []) {
                if (!c.id) continue;
                c.page_id = String(c.page_id || c.fb_page_id || pageIds[i] || '');
                if (!map.has(c.id)) map.set(c.id, c);
            }
        });
        return [...map.values()].sort((a, b) =>
            String(b.updated_at || b.inserted_at || '').localeCompare(
                String(a.updated_at || a.inserted_at || '')
            )
        );
    }

    // ── openModal(): 3-cột Pancake — sidebar tìm kiếm hội thoại + thread ──
    async function openModal(opts = {}) {
        const phone = String(opts.phone || '').trim();
        const fbId = String(opts.fbId || opts.fbUserId || '').trim();
        const pageId = String(opts.pageId || opts.fbPageId || '').trim();
        const readonly = !!opts.readonly;
        const showInfo = !!(opts.panels && opts.panels.info);
        if (_active) _active.close();
        ensureStyles();
        await loadPanelBundle();

        const back = document.createElement('div');
        back.className = 'w2cc-mback web2-theme';
        back.innerHTML = `
            <div class="w2cc-modal" role="dialog" aria-modal="true" aria-label="Chat khách hàng">
                <div class="w2cc-mhead">
                    <b><i data-lucide="messages-square" style="width:17px;height:17px;vertical-align:-3px"></i> Chat khách hàng</b>
                    <button class="w2cc-x" data-w2cc="close" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="w2cc-grid${showInfo ? ' has-info' : ''}">
                    <aside class="w2cc-side">
                        <div class="w2cc-side-search"><input type="text" data-w2cc="search" placeholder="Tìm hội thoại theo tên / SĐT…" autocomplete="off"></div>
                        <div class="w2cc-side-list" data-w2cc="list"><div class="w2cc-side-empty">Đang tải hội thoại…</div></div>
                    </aside>
                    <main class="w2cc-main" data-w2cc="thread">${_stateHtml('loading', 'Đang tải…')}</main>
                </div>
            </div>`;
        document.body.appendChild(back);
        requestAnimationFrame(() => back.classList.add('show'));
        global.lucide?.createIcons?.();
        global.Web2Lottie?.scan?.(back);

        const listEl = back.querySelector('[data-w2cc="list"]');
        const threadEl = back.querySelector('[data-w2cc="thread"]');
        const searchEl = back.querySelector('[data-w2cc="search"]');
        let panelInst = null;
        let selectedConvId = null;
        let baseConvs = [];

        function markSelected() {
            listEl
                .querySelectorAll('.w2cc-row')
                .forEach((r) => r.classList.toggle('on', r.dataset.convId === selectedConvId));
        }
        function selectConv(conv) {
            if (!conv || !conv.id || !global.Web2ChatPanel) return;
            selectedConvId = String(conv.id);
            markSelected();
            try {
                panelInst?.destroy?.();
            } catch {}
            threadEl.innerHTML = '';
            panelInst = global.Web2ChatPanel.mount(threadEl, {
                mode: readonly ? 'readonly' : 'full',
            });
            panelInst.open(conv, buildPancakeAdapter(conv));
            setTimeout(() => panelInst?.scrollToBottom?.(), 400);
        }
        function renderRows(convs) {
            if (!convs.length) {
                listEl.innerHTML = `<div class="w2cc-side-empty">Không có hội thoại</div>`;
                return;
            }
            listEl.innerHTML = convs.map(_convRowHtml).join('');
            markSelected();
        }
        async function loadInitial() {
            const pageIds = _getPageIds();
            if (!pageIds.length) {
                listEl.innerHTML = `<div class="w2cc-side-empty">Chưa cấu hình page Pancake</div>`;
                return;
            }
            try {
                await global.Web2Chat?.syncFromRenderDB?.();
            } catch {}
            const settled = await Promise.allSettled(
                pageIds.map((pid) => global.Web2Chat.fetchConversationsByPage(pid, { limit: 50 }))
            );
            baseConvs = _mergeConvs(settled, pageIds);
            renderRows(baseConvs);
        }
        let _sTimer = null;
        let _sSeq = 0;
        function wireSearch() {
            searchEl.addEventListener('keydown', (e) => {
                if (e.isComposing || e.keyCode === 229) return; // IME tiếng Việt
            });
            searchEl.addEventListener('input', () => {
                clearTimeout(_sTimer);
                const q = searchEl.value.trim();
                _sTimer = setTimeout(async () => {
                    if (!q) return renderRows(baseConvs);
                    const seq = ++_sSeq;
                    listEl.innerHTML = `<div class="w2cc-side-empty">Đang tìm…</div>`;
                    const pageIds = _getPageIds();
                    const settled = await Promise.allSettled(
                        pageIds.map((pid) => global.Web2Chat.searchConversations(pid, q))
                    );
                    if (seq !== _sSeq) return; // kết quả cũ
                    renderRows(_mergeConvs(settled, pageIds));
                }, 300);
            });
        }
        listEl.addEventListener('click', (e) => {
            const row = e.target.closest('.w2cc-row');
            if (!row) return;
            const conv = baseConvs.find((c) => String(c.id) === row.dataset.convId) || {
                id: row.dataset.convId,
                page_id: row.dataset.pageId,
                type: 'INBOX',
                customers: [{ id: null, name: row.dataset.name, fb_id: row.dataset.fbId }],
            };
            selectConv(conv);
        });

        // Auto-chọn hội thoại theo identity (phone → fbId), vẫn cho search/đổi tự do.
        (async () => {
            let conv = null;
            if (phone) conv = await resolvePancakeConv(phone);
            if (!conv) conv = await _resolveConvByFbId(fbId, pageId);
            if (conv) selectConv(conv);
            else {
                threadEl.innerHTML = _stateHtml('empty', 'Chọn hội thoại bên trái để bắt đầu');
                global.lucide?.createIcons?.();
                global.Web2Lottie?.scan?.(threadEl);
            }
        })();

        loadInitial();
        wireSearch();
        if (phone) searchEl.value = phone; // gợi ý nhanh

        const close = () => {
            try {
                panelInst?.destroy?.();
            } catch {}
            back.classList.remove('show');
            setTimeout(() => back.remove(), 200);
            document.removeEventListener('keydown', onEsc);
            if (_active && _active._back === back) _active = null;
        };
        function onEsc(e) {
            if (e.key === 'Escape') close();
        }
        back.addEventListener('click', (e) => {
            if (e.target === back) close();
            if (e.target.closest('[data-w2cc="close"]')) close();
        });
        document.addEventListener('keydown', onEsc);
        _active = { close, _back: back, switchTab() {}, getPanel: () => panelInst };
        return _active;
    }

    async function open(opts = {}) {
        // layout:'modal' → giao diện 3-cột Pancake (sidebar tìm kiếm + thread + info).
        // Mặc định 'drawer' (giữ nguyên 11 caller cũ — zero risk).
        if (opts.layout === 'modal') return openModal(opts);
        const phone = String(opts.phone || '').trim();
        const fbId = String(opts.fbId || opts.fbUserId || '').trim();
        const pageId = String(opts.pageId || opts.fbPageId || '').trim();
        if (!phone && !(fbId && pageId)) {
            notify('Thiếu SĐT / Facebook của khách', 'warning');
            return null;
        }
        if (_active) _active.close();
        ensureStyles();
        const name = opts.name || '';
        let channel = opts.channel === 'zalo' ? 'zalo' : 'pancake';

        const back = document.createElement('div');
        back.className = 'w2cc-back web2-theme';
        back.innerHTML = `
            <div class="w2cc-drawer" role="dialog" aria-modal="true" aria-label="Chat với khách">
                <div class="w2cc-head">
                    <div class="w2cc-head-who"><b>${esc(name || 'Khách')}</b>${phone ? `<span class="w2cc-phone" data-w2cc="copyphone" role="button" tabindex="0" title="Bấm để copy SĐT">${esc(phone)}</span>` : `<span style="font-size:12px;color:var(--web2-text-mute,#6b7280)">${fbId ? 'Facebook …' + esc(fbId.slice(-6)) : ''}</span>`}</div>
                    <button class="w2cc-x" data-w2cc="close" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="w2cc-tabs">
                    <button class="w2cc-tab ${channel === 'pancake' ? 'on' : ''}" data-w2cc-tab="pancake"><i data-lucide="facebook"></i> Pancake</button>
                    <button class="w2cc-tab ${channel === 'zalo' ? 'on' : ''}" data-w2cc-tab="zalo"><i data-lucide="message-circle"></i> Zalo</button>
                </div>
                <div class="w2cc-panes">
                    <div class="w2cc-pane" data-w2cc-pane="pancake" ${channel === 'pancake' ? '' : 'hidden'}></div>
                    <div class="w2cc-pane" data-w2cc-pane="zalo" ${channel === 'zalo' ? '' : 'hidden'}></div>
                </div>
            </div>`;
        document.body.appendChild(back);
        requestAnimationFrame(() => back.classList.add('show'));
        global.lucide?.createIcons?.();

        const paneEl = (ch) => back.querySelector(`[data-w2cc-pane="${ch}"]`);
        const mounted = { pancake: false, zalo: false };
        let panelInst = null;
        let zaloHandle = null;

        async function mountPancake() {
            if (mounted.pancake) return;
            mounted.pancake = true;
            const host = paneEl('pancake');
            host.innerHTML = _stateHtml('loading', 'Đang tìm hội thoại Pancake…');
            global.Web2Lottie?.scan?.(host);
            try {
                await loadPanelBundle();
                // Ưu tiên resolve theo SĐT (proven, quét mọi page) → fallback fbId+pageId
                // của đơn (khi KH không có / không match SĐT trong hội thoại Pancake).
                let conv = phone ? await resolvePancakeConv(phone) : null;
                if (!conv) conv = await _resolveConvByFbId(fbId, pageId);
                if (!conv || !global.Web2ChatPanel) {
                    host.innerHTML = _stateHtml('empty', 'Khách chưa có hội thoại Pancake');
                    global.Web2Lottie?.scan?.(host);
                    global.lucide?.createIcons?.();
                    return;
                }
                host.innerHTML = '';
                panelInst = global.Web2ChatPanel.mount(host, { mode: 'full' });
                panelInst.open(conv, buildPancakeAdapter(conv));
                // tự cuộn xuống cùng sau khi render (ảnh/layout settle muộn)
                setTimeout(() => panelInst?.scrollToBottom?.(), 500);
            } catch (e) {
                host.innerHTML = _stateHtml('empty', 'Lỗi mở chat Pancake: ' + (e?.message || ''));
                global.lucide?.createIcons?.();
            }
        }
        async function mountZalo() {
            if (mounted.zalo) return;
            mounted.zalo = true;
            const host = paneEl('zalo');
            host.innerHTML = `<div id="w2ccZaloBody" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
            if (!global.Web2Zalo?.mountChat) {
                host.innerHTML = _stateHtml('empty', 'Zalo chưa sẵn sàng');
                global.lucide?.createIcons?.();
                return;
            }
            try {
                zaloHandle = await global.Web2Zalo.mountChat(host.querySelector('#w2ccZaloBody'), {
                    phone,
                    autoSeen: true,
                });
                if (!zaloHandle) {
                    host.innerHTML = _stateHtml('empty', 'Khách chưa có hội thoại Zalo');
                    global.Web2Lottie?.scan?.(host);
                    global.lucide?.createIcons?.();
                } else {
                    setTimeout(() => _scrollZalo(host), 500); // tự cuộn xuống cùng
                }
            } catch (e) {
                host.innerHTML = _stateHtml('empty', 'Lỗi mở chat Zalo: ' + (e?.message || ''));
                global.lucide?.createIcons?.();
            }
        }
        function _scrollZalo(host) {
            const b = host?.querySelector('.wz-chat-body');
            if (b) b.scrollTop = b.scrollHeight;
        }

        function showTab(ch) {
            channel = ch;
            // cuộn xuống cùng khi quay lại tab đã mount
            if (ch === 'pancake' && mounted.pancake)
                setTimeout(() => panelInst?.scrollToBottom?.(), 60);
            if (ch === 'zalo' && mounted.zalo) setTimeout(() => _scrollZalo(paneEl('zalo')), 60);
            back.querySelectorAll('.w2cc-tab').forEach((b) =>
                b.classList.toggle('on', b.dataset.w2ccTab === ch)
            );
            back.querySelectorAll('.w2cc-pane').forEach((p) => {
                p.hidden = p.dataset.w2ccPane !== ch;
            });
            if (ch === 'pancake') mountPancake();
            else mountZalo();
        }

        const close = () => {
            try {
                panelInst?.destroy?.();
            } catch {}
            try {
                zaloHandle?.destroy?.();
            } catch {}
            back.classList.remove('show');
            setTimeout(() => back.remove(), 220);
            document.removeEventListener('keydown', onEsc);
            if (_active && _active._back === back) _active = null;
        };
        function onEsc(ev) {
            if (ev.key === 'Escape') close();
        }
        back.addEventListener('click', (e) => {
            if (e.target === back) close();
            const tb = e.target.closest?.('[data-w2cc-tab]');
            if (tb) showTab(tb.dataset.w2ccTab);
            if (e.target.closest?.('[data-w2cc="close"]')) close();
            if (e.target.closest?.('[data-w2cc="copyphone"]')) _copyPhone();
        });
        function _copyPhone() {
            const done = () => notify('Đã copy SĐT: ' + phone, 'success');
            if (navigator.clipboard?.writeText)
                navigator.clipboard.writeText(phone).then(done).catch(done);
            else done();
        }
        document.addEventListener('keydown', onEsc);

        _active = { close, _back: back };
        showTab(channel); // mount kênh mặc định
        return _active;
    }

    global.Web2CustomerChat = { open, resolvePancakeConv };
})(window);
