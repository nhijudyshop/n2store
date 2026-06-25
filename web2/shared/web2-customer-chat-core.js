// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerChat — CORE (state + consts + utils + panel loader + conv
// resolve + send adapter + CSS + modal-row helpers). Dùng chung cho cả
// drawer open() và 3-cột openModal(). Re-export public qua module ENTRY.
//
// Namespace nội bộ: window.__Web2CustChatNS (state + helpers chia sẻ).
// =====================================================================
(function (global) {
    const NS = (global.__Web2CustChatNS = global.__Web2CustChatNS || {});
    if (NS._coreReady) return;
    NS._coreReady = true;

    const _selfSrc = (document.currentScript && document.currentScript.src) || '';
    const SHARED_BASE =
        _selfSrc.replace(/\/web2-customer-chat-core\.js(?:\?.*)?$/, '') || '../shared';
    const PANEL_VER = '20260626addr2';
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

    // ── shared mutable state (1 active overlay tại 1 thời điểm) ──────────
    NS._active = NS._active || null;
    function getActive() {
        return NS._active;
    }
    function setActive(v) {
        NS._active = v;
    }

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
            // Load order BẮT BUỘC (sau khi tách module): state → render → compose
            // (3 file này dựng __Web2ChatPanelNS.utils/buildRender/buildCompose) → emoji/
            // sticker/entity-detect (global độc lập) → panel.js (entry, LAST). Thiếu 3 file
            // đầu → web2-chat-panel.js throw "thiếu module phụ thuộc".
            for (const j of [
                'chat-panel/web2-chat-panel-state.js',
                'chat-panel/web2-chat-panel-render.js',
                'chat-panel/web2-chat-panel-compose.js',
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
    async function _performSend(conv, text, att, replyToId) {
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
            // AUDIT 2026-06-20 #28: forward reply-to (sendMessage map → replied_message_id).
            repliedMessageId: replyToId || undefined,
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
                    repliedMessageId: replyToId || undefined,
                });
        }
        if (!res || !res.ok)
            throw new Error(
                (res?.reason ? res.reason + '. ' : '') +
                    'Gửi tin không được — hãy ĐĂNG NHẬP Facebook (business.facebook.com) và Pancake (pancake.vn) trong cùng trình duyệt này rồi thử lại.'
            );
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
            async send({ text, attachment, replyToId }) {
                const res = await _performSend(conv, text, attachment || null, replyToId);
                if (res?.via === 'extension')
                    notify('Đã gửi qua N2 Extension (bypass 24h)', 'success');
                return res;
            },
        };
    }

    // ── CSS drawer + modal (scoped .w2cc-, inject 1 lần) ────────────────
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
.w2cc-row-page{display:inline-block;margin-top:3px;max-width:100%;font-size:10px;line-height:1.5;font-weight:600;color:var(--web2-primary,#0068ff);background:color-mix(in oklab,var(--web2-primary,#0068ff) 12%,transparent);border-radius:5px;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
.w2cc-row-time{font-size:10px;color:var(--web2-text-mute,#9ca3af);flex-shrink:0;align-self:flex-start}
.w2cc-main{display:flex;flex-direction:column;min-height:0;position:relative}
.w2cc-side-empty{padding:24px 12px;text-align:center;color:var(--web2-text-mute,#9ca3af);font-size:12px}
.w2cc-info{display:flex;flex-direction:column;min-height:0;overflow-y:auto;overscroll-behavior:contain;border-left:1px solid var(--web2-border,#e5e7eb);background:var(--web2-bg,#f8fafc);padding:12px;gap:10px}
@media (max-width:900px){.w2cc-grid.has-info{grid-template-columns:280px 1fr}.w2cc-info{display:none}}
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
        // audit r8: KHÔNG đính Pancake JWT vào ?token= URL — worker log ghi nguyên URL
        // (lộ JWT toàn quyền inbox vào log Cloudflare). FB avatar proxy không cần token
        // (graph.facebook.com/{id}/picture public). Khớp web2-avatar-utils.proxyUrl.
        const p = new URLSearchParams({ id: String(fbId), page: String(pageId) });
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
        // Pancake snippet kèm markup highlight (vd `SĐT: <b>0912...</b>`) → strip tag
        // trước khi esc, nếu không cột trái hiện literal `<b>…</b>`.
        const snip = String(c.snippet || c.last_message || c.last_sent_by?.message || '').replace(
            /<[^>]+>/g,
            ''
        );
        const time = _mTime(c.updated_at || c.inserted_at || '');
        const url = fbId && pageId ? _mAvatarUrl(fbId, pageId) : '';
        const initial = _mInitial(name);
        const color = _mColor(name);
        const av = url
            ? `<div class="w2cc-row-av" style="background:${color}"><span>${esc(initial)}</span><img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()"></div>`
            : `<div class="w2cc-row-av" style="background:${color}">${esc(initial)}</div>`;
        // Tên page Pancake (vd "NhiJudyStore" / "Nhi Judy House") → pill nhỏ, để biết
        // hội thoại thuộc page nào khi danh sách gộp nhiều page.
        const pageName = pageId ? _pageName(pageId) : '';
        const pageChip = pageName
            ? `<span class="w2cc-row-page" title="${esc(pageName)}">${esc(pageName)}</span>`
            : '';
        return `<div class="w2cc-row" data-conv-id="${esc(String(c.id))}" data-page-id="${esc(pageId)}" data-fb-id="${esc(fbId)}" data-name="${esc(name)}">
            ${av}
            <div class="w2cc-row-main"><div class="w2cc-row-name">${esc(name)}</div><div class="w2cc-row-snip">${esc(String(snip).slice(0, 64))}</div>${pageChip}</div>
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

    // ── Realtime: SSE web2:messages → refresh thread Pancake đang mở ─────
    // Audit SSE 2026-06-25: trước đây Web2CustomerChat chỉ loadMessages on-open →
    // tin KH mới không hiện tới khi đóng/mở lại. Nay subscribe 1 LẦN (1 nguồn,
    // KHÔNG fork) — mỗi overlay (drawer/modal) expose handle.refreshActive() tự
    // reload thread đang mở. Cùng pattern proven của LiveChatModal: dùng
    // adapter.loadMessages() + panel.setMessages() (chỉ auto-cuộn nếu đang ở đáy,
    // GIỮ vị trí khi đọc lịch sử) — KHÔNG dùng panel.reload() (ép cuộn đáy).
    // Tin Zalo có realtime riêng (Web2Zalo) nên topic này chỉ lo Pancake.
    let _sseWired = false;
    let _sseRetry = 0;
    let _sseRefreshTimer = null;
    function _wireMessagesSse() {
        if (_sseWired) return;
        if (!global.Web2SSE || typeof global.Web2SSE.subscribe !== 'function') {
            // Bridge có thể load chậm/không có trên trang → thử lại vài nhịp rồi thôi.
            if (_sseRetry++ < 6) setTimeout(_wireMessagesSse, 1000);
            return;
        }
        _sseWired = true;
        global.Web2SSE.subscribe('web2:messages', () => {
            const act = NS._active;
            if (!act || typeof act.refreshActive !== 'function') return;
            clearTimeout(_sseRefreshTimer);
            _sseRefreshTimer = setTimeout(() => {
                try {
                    NS._active?.refreshActive?.();
                } catch (_) {}
            }, 800); // debounce gom burst tin nhắn
        });
    }

    // ── expose lên namespace cho modal + entry tham chiếu ───────────────
    Object.assign(NS, {
        WORKER,
        notify,
        esc,
        getActive,
        setActive,
        loadPanelBundle,
        _getPageIds,
        _pageName,
        resolvePancakeConv,
        _resolveConvByFbId,
        buildPancakeAdapter,
        ensureStyles,
        _stateHtml,
        _convRowHtml,
        _mergeConvs,
    });

    _wireMessagesSse();
})(window);
