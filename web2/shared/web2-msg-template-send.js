// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk Message Template Modal · SEND + JOB
// =====================================================
//
// Phần gửi & theo dõi job tách từ web2-msg-template.js (MOVE-only): send loop tạo
// job server-side, job watch (SSE + poll), extension drain cho đơn 24h, floating
// pill tiến độ refresh-safe. Tham chiếu state + utils qua window.W2MT.
//
// Send flow per order:
//   1. ROUTE 1: Resolve global_id via Web2Chat.fetchMessages → customers[].global_id
//   2. POST via extension REPLY_INBOX_PHOTO (bypass-24h)
//   3. Fallback Web2Chat.sendMessage(reply_inbox) if extension unavailable

(function () {
    'use strict';

    const W2MT = (window.W2MT = window.W2MT || {});
    const S = W2MT.state;
    const API_BASE = W2MT.API_BASE;

    // ─── Send loop ────────────────────────────────────────────────

    // Tạo job server-side: server gửi Pancake API đa-account song song (nhanh,
    // refresh-safe). Đơn lỗi 24h → server đánh dấu needs_extension → client drain
    // qua extension (bypass). Xem render.com/routes/web2-msg-send.js + worker.
    async function _handleSend() {
        if (!S.selectedTemplateId) {
            W2MT._toast('Chọn 1 template trước', 'warning');
            return;
        }
        const tpl = S.templates.find((t) => t.id === S.selectedTemplateId);
        if (!tpl?.Content) {
            W2MT._toast('Template không có nội dung', 'warning');
            return;
        }
        if (!S.modalOrders.length) {
            W2MT._toast('Không có đơn nào để gửi', 'warning');
            return;
        }

        // Fill template per đơn ở client → server chỉ việc gửi text đã sẵn.
        const items = S.modalOrders
            .map((o) => ({
                orderCode: o.code || null,
                pageId: o.fbPageId || '',
                convId: o.conversationId || '',
                customerId: o.customerUuid || null,
                customerName: o.customerName || o.fbUserName || '',
                fbUserId: o.fbUserId || '',
                globalId: o._fbGlobalUserId || '',
                threadId: o.threadId || '',
                message: W2MT._fillTemplate(tpl.Content, o),
            }))
            .filter((it) => it.message && it.pageId && it.convId);

        if (!items.length) {
            W2MT._toast('Không có đơn hợp lệ (thiếu page/conversation)', 'warning');
            return;
        }

        const sendBtn = document.getElementById('w2tplSendBtn');
        sendBtn.disabled = true;
        sendBtn.innerHTML =
            '<i data-lucide="loader-2" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Đang tạo...';
        W2MT._refreshIcons();

        let createdBy = '';
        try {
            const u = window.Web2UserInfo?.get?.();
            createdBy = u?.name || u?.username || u?.email || '';
        } catch (_) {
            /* ignore */
        }

        try {
            const r = await fetch(API_BASE + '/', {
                method: 'POST',
                headers: W2MT._authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ createdBy, templateName: tpl.Name || '', items }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok || !d?.success) throw new Error(d?.error || 'HTTP ' + r.status);
            // Optimistic 24h-skip cho lần mở modal sau.
            items.forEach((it) => it.orderCode && W2MT._markSent(it.orderCode));
            W2MT._toast(`Đã tạo job gửi ${d.total} khách — đang chạy ở server`, 'success');
            document.getElementById('w2tplProgress').classList.add('show');
            _startWatch(d.jobId, {
                total: d.total,
                sent: 0,
                failed: 0,
                needsExt: 0,
                active: d.total,
            });
        } catch (e) {
            W2MT._toast('Tạo job thất bại: ' + (e?.message || e), 'error');
            sendBtn.disabled = false;
            sendBtn.innerHTML =
                '<i data-lucide="send" style="width:14px;height:14px;"></i> Gửi tin nhắn';
            W2MT._refreshIcons();
        }
    }

    // ─── Job watch (SSE + poll + extension drain) — độc lập modal ──────
    function _startWatch(jobId, seed) {
        if (S.watching && S.activeJobId === jobId) {
            if (seed) _onProgress(seed);
            return;
        }
        S.activeJobId = jobId;
        S.watching = true;
        S.isSending = true;
        S.drainStop = false;
        _ensurePill();
        if (seed) _onProgress(seed);

        // Modal UI (nếu modal đang mở).
        const sendBtn = document.getElementById('w2tplSendBtn');
        const cancelBtn = document.getElementById('w2tplCancelBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML =
                '<i data-lucide="loader-2" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Đang gửi ở server...';
        }
        if (cancelBtn) cancelBtn.textContent = 'Dừng';
        W2MT._refreshIcons();

        // SSE realtime.
        if (window.Web2SSE?.subscribe) {
            try {
                S.sseUnsub = window.Web2SSE.subscribe('web2:bulk-send:' + jobId, (msg) => {
                    if (msg?.data) _onProgress(msg.data);
                });
            } catch (_) {
                /* ignore */
            }
        }
        // Poll fallback (SSE rớt) + nguồn chân lý cho state 'done'.
        if (S.pollTimer) clearInterval(S.pollTimer);
        S.pollTimer = setInterval(() => _pollJob(jobId), 3000);
        _pollJob(jobId);
        // Extension drain cho đơn 24h.
        _drainExtension(jobId);
    }

    function _stopWatch(finalJob) {
        S.watching = false;
        S.isSending = false;
        S.drainStop = true;
        if (S.pollTimer) {
            clearInterval(S.pollTimer);
            S.pollTimer = null;
        }
        if (S.sseUnsub) {
            try {
                S.sseUnsub();
            } catch (_) {
                /* */
            }
            S.sseUnsub = null;
        }
        const sendBtn = document.getElementById('w2tplSendBtn');
        const cancelBtn = document.getElementById('w2tplCancelBtn');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML =
                '<i data-lucide="send" style="width:14px;height:14px;"></i> Gửi tin nhắn';
        }
        if (cancelBtn) cancelBtn.textContent = 'Đóng';
        W2MT._refreshIcons();
        if (finalJob) {
            const msg = `Hoàn thành. Gửi: ${finalJob.sent || 0}${finalJob.failed ? ' · Lỗi: ' + finalJob.failed : ''}`;
            W2MT._toast(msg, finalJob.failed ? 'warning' : 'success');
            _updatePill(finalJob, true);
            setTimeout(_hidePill, 6000);
        } else {
            _hidePill();
        }
    }

    async function _pollJob(jobId) {
        try {
            const r = await fetch(API_BASE + '/' + jobId);
            const d = await r.json().catch(() => null);
            if (d?.success && d.job) {
                _onProgress(d.job);
                if (d.job.state === 'done') _stopWatch(d.job);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function _onProgress(p) {
        // Modal progress bar (nếu mở).
        const fillEl = document.getElementById('w2tplProgressFill');
        const textEl = document.getElementById('w2tplProgressText');
        const total =
            p.total != null
                ? p.total
                : (p.sent || 0) + (p.failed || 0) + (p.needsExt || 0) + (p.active || 0);
        const done = (p.sent || 0) + (p.failed || 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const parts = [`${p.sent || 0}/${total} đã gửi`];
        if (p.failed) parts.push(`${p.failed} lỗi`);
        if (p.needsExt) parts.push(`${p.needsExt} chờ extension`);
        if (p.active) parts.push(`${p.active} đang chạy`);
        const txt = parts.join(' · ');
        if (fillEl) fillEl.style.width = pct + '%';
        if (textEl) textEl.textContent = txt;
        _updatePill({ ...p, total, pct, txt }, false);
    }

    async function _fetchJob(jobId) {
        try {
            const r = await fetch(API_BASE + '/' + jobId);
            const d = await r.json().catch(() => null);
            return d?.success ? d.job : null;
        } catch (_) {
            return null;
        }
    }

    // ─── Extension drain: đơn lỗi-24h → gửi qua extension (bypass) ─────
    async function _drainExtension(jobId) {
        if (S.draining) return;
        S.draining = true;
        const reqFn = window.NativeOrdersApp?._extensionRequest || window._w2ExtensionRequest;
        try {
            while (!S.drainStop) {
                let items = [];
                try {
                    const r = await fetch(API_BASE + '/' + jobId + '/extension-items?limit=10');
                    const d = await r.json().catch(() => null);
                    items = d?.items || [];
                } catch (_) {
                    items = [];
                }
                if (!items.length) {
                    const st = await _fetchJob(jobId);
                    if (!st || (st.active === 0 && st.needsExt === 0)) break;
                    await W2MT._sleep(1500);
                    continue;
                }
                if (!reqFn) {
                    W2MT._toast(
                        `${items.length}+ đơn quá 24h cần extension — mở tab có extension để tiếp tục`,
                        'warning'
                    );
                    break; // tab này không có extension → để nguyên needs_extension
                }
                // Đa nhiệm theo KH (1 phiên FB) — pool nhỏ tránh spam rate-limit FB.
                const conc = Math.max(
                    1,
                    Math.min(6, parseInt(document.getElementById('w2tplConcurrency')?.value) || 3)
                );
                for (let i = 0; i < items.length; i += conc) {
                    if (S.drainStop) break;
                    await Promise.all(
                        items
                            .slice(i, i + conc)
                            .map((it) => _sendItemViaExtension(jobId, it, reqFn))
                    );
                }
                await W2MT._sleep(300);
            }
        } finally {
            S.draining = false;
        }
    }

    async function _sendItemViaExtension(jobId, item, reqFn) {
        // Claim chống double-send (server flip needs_extension → ext_inflight).
        try {
            const cr = await fetch(API_BASE + '/' + jobId + '/items/' + item.id + '/claim-ext', {
                method: 'POST',
                headers: W2MT._authHeaders(),
            });
            const cd = await cr.json().catch(() => null);
            if (!cd?.claimed) return;
        } catch (_) {
            return;
        }
        let ok = false;
        let err = null;
        try {
            await _extSendOne(item, reqFn);
            ok = true;
        } catch (e) {
            err = e?.message || String(e);
        }
        try {
            await fetch(API_BASE + '/' + jobId + '/items/' + item.id + '/result', {
                method: 'POST',
                headers: W2MT._authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ ok, via: 'extension', error: err }),
            });
        } catch (_) {
            /* ignore */
        }
    }

    // Gửi 1 item qua extension. Resolve global_id nếu thiếu (PSID ≠ global id).
    async function _extSendOne(item, reqFn) {
        let globalUserId = item.global_id || '';
        if (!globalUserId && window.Web2Chat?.fetchMessages && item.page_id && item.conv_id) {
            try {
                const msgRes = await window.Web2Chat.fetchMessages(
                    item.page_id,
                    item.conv_id,
                    item.customer_id || null
                );
                if (msgRes?.ok) {
                    const cust =
                        msgRes.customers?.find?.(
                            (c) => c?.fb_id === item.fb_user_id || c?.global_id
                        ) || msgRes.customers?.[0];
                    const gid =
                        cust?.global_id || msgRes.conversation?.page_customer?.global_id || null;
                    if (gid) globalUserId = String(gid);
                }
            } catch (_) {
                /* fall through */
            }
        }
        const r = await reqFn(
            'REPLY_INBOX_PHOTO',
            {
                pageId: item.page_id,
                globalUserId: globalUserId || item.fb_user_id,
                threadId: item.thread_id || '',
                convId: item.thread_id ? 't_' + item.thread_id : item.conv_id || '',
                customerName: item.customer_name || '',
                message: item.message,
                attachmentType: 'SEND_TEXT_ONLY',
                platform: 'facebook',
                isBusiness: true,
            },
            30000
        );
        if (!r?.ok) throw new Error(r?.error || r?.reason || 'extension fail');
    }

    // ─── Floating pill: hiện job đang chạy ở server (refresh vẫn thấy) ─
    function _ensurePill() {
        if (document.getElementById('w2tplPill')) return;
        const style = document.createElement('style');
        style.textContent = `
            #w2tplPill{position:fixed;right:18px;bottom:18px;z-index:9998;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0068ff;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.18);padding:11px 14px;min-width:230px;max-width:320px;font-size:12.5px;color:#0f172a;display:none;}
            #w2tplPill.show{display:block;}
            #w2tplPill .w2pill-top{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:7px;}
            #w2tplPill .w2pill-top .w2pill-x{margin-left:auto;cursor:pointer;color:#94a3b8;font-weight:400;font-size:13px;}
            #w2tplPill .w2pill-bar{height:6px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-bottom:6px;}
            #w2tplPill .w2pill-fill{height:100%;background:linear-gradient(90deg,#0068ff,#2a96ff);width:0;transition:width .3s;}
            #w2tplPill .w2pill-txt{color:#475569;}
            #w2tplPill .w2pill-stop{margin-top:7px;cursor:pointer;color:#dc2626;font-weight:600;font-size:11.5px;}
        `;
        document.head.appendChild(style);
        const el = document.createElement('div');
        el.id = 'w2tplPill';
        el.innerHTML = `
            <div class="w2pill-top"><i data-lucide="send" style="width:14px;height:14px;color:#0068ff;"></i><span>Đang gửi tin nhắn</span><span class="w2pill-x" id="w2pillX">×</span></div>
            <div class="w2pill-bar"><div class="w2pill-fill" id="w2pillFill"></div></div>
            <div class="w2pill-txt" id="w2pillTxt">…</div>
            <div class="w2pill-stop" id="w2pillStop">Dừng job</div>
        `;
        document.body.appendChild(el);
        document.getElementById('w2pillX').onclick = _hidePill; // chỉ ẩn pill, job vẫn chạy
        document.getElementById('w2pillStop').onclick = _cancelActiveJob;
        W2MT._refreshIcons();
    }

    function _updatePill(p, done) {
        _ensurePill();
        const pill = document.getElementById('w2tplPill');
        const fill = document.getElementById('w2pillFill');
        const txt = document.getElementById('w2pillTxt');
        if (!pill) return;
        pill.classList.add('show');
        const total =
            p.total != null
                ? p.total
                : (p.sent || 0) + (p.failed || 0) + (p.needsExt || 0) + (p.active || 0);
        const pct =
            p.pct != null
                ? p.pct
                : total
                  ? Math.round((((p.sent || 0) + (p.failed || 0)) / total) * 100)
                  : 0;
        if (fill) fill.style.width = pct + '%';
        if (txt)
            txt.textContent =
                p.txt ||
                `${p.sent || 0}/${total} đã gửi${p.failed ? ' · ' + p.failed + ' lỗi' : ''}${p.needsExt ? ' · ' + p.needsExt + ' chờ ext' : ''}`;
        const stop = document.getElementById('w2pillStop');
        if (stop) stop.style.display = done ? 'none' : 'block';
    }

    function _hidePill() {
        const pill = document.getElementById('w2tplPill');
        if (pill) pill.classList.remove('show');
    }

    async function _cancelActiveJob() {
        if (!S.activeJobId) return;
        if (
            !(await window.Popup.danger(
                'Dừng job? Các đơn chưa gửi sẽ bị huỷ (đơn đã gửi vẫn giữ).',
                { okText: 'Dừng job' }
            ))
        )
            return;
        try {
            await fetch(API_BASE + '/' + S.activeJobId + '/cancel', {
                method: 'POST',
                headers: W2MT._authHeaders(),
            });
        } catch (_) {
            /* ignore */
        }
        const job = await _fetchJob(S.activeJobId);
        _stopWatch(job || { sent: 0, failed: 0 });
    }

    // Reattach job đang chạy khi mở modal / load trang (refresh-safe).
    async function _maybeReattachActive() {
        if (S.watching) return;
        try {
            const r = await fetch(API_BASE + '/active');
            const d = await r.json().catch(() => null);
            const job = d?.success ? d.job : null;
            if (job && (job.state === 'running' || job.state === 'awaiting_extension')) {
                document.getElementById('w2tplProgress')?.classList.add('show');
                _startWatch(job.id, job);
            }
        } catch (_) {
            /* ignore */
        }
    }

    W2MT._handleSend = _handleSend;
    W2MT._startWatch = _startWatch;
    W2MT._stopWatch = _stopWatch;
    W2MT._pollJob = _pollJob;
    W2MT._onProgress = _onProgress;
    W2MT._fetchJob = _fetchJob;
    W2MT._drainExtension = _drainExtension;
    W2MT._sendItemViaExtension = _sendItemViaExtension;
    W2MT._extSendOne = _extSendOne;
    W2MT._ensurePill = _ensurePill;
    W2MT._updatePill = _updatePill;
    W2MT._hidePill = _hidePill;
    W2MT._cancelActiveJob = _cancelActiveJob;
    W2MT._maybeReattachActive = _maybeReattachActive;
})();
