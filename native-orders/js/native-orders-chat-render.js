// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — chat thread render + bubble slots + append/prepend + scroll/load-older. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    /**
     * Render the cached message list into the thread element with date
     * separators. Preserves scroll-from-bottom behaviour: pass
     * `anchor: 'bottom'` for initial / new message; pass `anchor: 'top'`
     * for prepend after scroll-load-older.
     */
    // Build HTML for one logical message slot (date separator if needed +
    // bubble). `prevMsg` and `nextMsg` are siblings used to decide whether
    // to emit a new date separator + whether to show the avatar.
    NO._bubbleSlotHtml = function _bubbleSlotHtml(m, prevMsg, nextMsg, pageId) {
        const parts = [];
        const ts = NO._msgTimestamp(m);
        const label = NO._dateLabel(ts);
        const prevLabel = prevMsg ? NO._dateLabel(NO._msgTimestamp(prevMsg)) : '';
        if (label && label !== prevLabel) parts.push(NO._dateSeparatorHtml(label));
        const isOutgoing = m.from?.id === pageId || m.from_admin || m.is_admin;
        const nextOutgoing =
            nextMsg && (nextMsg.from?.id === pageId || nextMsg.from_admin || nextMsg.is_admin);
        const sameSenderNext = nextMsg && !nextOutgoing && nextMsg.from?.id === m.from?.id;
        const showAvatar = !isOutgoing && !sameSenderNext;
        parts.push(NO._bubbleHtml(m, pageId, { showAvatar }));
        return parts.join('');
    };

    NO._loadOlderIndicatorHtml = function _loadOlderIndicatorHtml() {
        return `<div id="msgLoadOlder" style="align-self:center;font-size:11px;color:#0068ff;padding:4px 0;cursor:pointer;">↑ Cuộn lên để tải tin cũ hơn</div>`;
    };

    /**
     * Initial render only — wipes the thread and rebuilds it from
     * `_chatState.msgs`. Avoid calling for incremental updates; use
     * `_appendBubbleDom` / `_prependBubblesDom` instead which only
     * touch the new DOM nodes and don't reflow the existing thread.
     */
    NO._renderChatThread = function _renderChatThread(anchor) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !NO._chatState) return;
        // Enable layout/paint containment so scrolling doesn't repaint
        // the surrounding modal chrome.
        // Removed inline `contain` + `will-change` — see _ensureChatModalCss
        // header note. Native scroll on a small DOM doesn't need them and
        // they were contributing to the visual jank the user reported.
        const { msgs, pageId } = NO._chatState;
        if (!msgs.length) {
            threadEl.innerHTML = `<div style="color:#94a3b8;font-size:12px;padding:30px 0;text-align:center;font-style:italic;">Hội thoại trống. Gõ tin nhắn để bắt đầu.</div>`;
            return;
        }
        const prevScrollHeight = threadEl.scrollHeight;
        const prevScrollTop = threadEl.scrollTop;
        const parts = [];
        if (NO._chatState.hasMore) parts.push(NO._loadOlderIndicatorHtml());
        for (let i = 0; i < msgs.length; i++) {
            parts.push(NO._bubbleSlotHtml(msgs[i], msgs[i - 1], msgs[i + 1], pageId));
        }
        threadEl.innerHTML = parts.join('');
        if (anchor === 'top') {
            requestAnimationFrame(() => {
                threadEl.scrollTop = threadEl.scrollHeight - prevScrollHeight + prevScrollTop;
            });
        } else {
            requestAnimationFrame(() => {
                threadEl.scrollTop = threadEl.scrollHeight;
                requestAnimationFrame(() => {
                    threadEl.scrollTop = threadEl.scrollHeight;
                });
            });
        }
    };

    /**
     * Append a single new (or just-arrived) message bubble without
     * touching the existing DOM. Re-evaluates the last bubble's avatar
     * state so consecutive-group collapsing stays consistent.
     */
    NO._appendBubbleDom = function _appendBubbleDom(msg) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !NO._chatState) return;
        const { msgs, pageId } = NO._chatState;
        const idx = msgs.indexOf(msg);
        if (idx < 0) return;
        const prev = msgs[idx - 1];
        const html = NO._bubbleSlotHtml(msg, prev, null, pageId);

        // If the previously-last visible bubble was an incoming row showing
        // an avatar but the new bubble is from the same sender, hide its
        // avatar (it's no longer the group's tail).
        if (prev && !(prev.from?.id === pageId || prev.from_admin || prev.is_admin)) {
            const sameSender = prev.from?.id === msg.from?.id;
            if (sameSender) {
                const prevRow = threadEl.querySelector(
                    `.w2-chat-row[data-msg-id="${CSS.escape(String(prev.id || ''))}"]`
                );
                const slot = prevRow?.querySelector('.w2-chat-avatar-slot');
                if (slot) slot.innerHTML = '<div style="width:28px;flex-shrink:0;"></div>';
            }
        }

        threadEl.insertAdjacentHTML('beforeend', html);
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    /**
     * Prepend N older messages without rebuilding the thread. Preserves
     * the user's visible scroll position by adjusting scrollTop by the
     * inserted block's height.
     */
    NO._prependBubblesDom = function _prependBubblesDom(olderMsgs) {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !NO._chatState || !olderMsgs?.length) return;
        const { msgs, pageId } = NO._chatState;
        // olderMsgs are already merged at the head of msgs[]
        const prevScrollHeight = threadEl.scrollHeight;
        const prevScrollTop = threadEl.scrollTop;
        const parts = [];
        for (let i = 0; i < olderMsgs.length; i++) {
            const m = olderMsgs[i];
            // prevMsg here = msgs[i-1] (i.e. one older than current m); for
            // the very first message it's null.
            const prev = i > 0 ? olderMsgs[i - 1] : null;
            // nextMsg here = the message that comes AFTER m in the merged
            // list, which is olderMsgs[i+1] OR (if last older) the first
            // existing msg before the merge, found at msgs[olderMsgs.length]
            const next = i + 1 < olderMsgs.length ? olderMsgs[i + 1] : msgs[olderMsgs.length];
            parts.push(NO._bubbleSlotHtml(m, prev, next, pageId));
        }

        // Update the first existing bubble's avatar visibility if its
        // sender now has an older sibling in the same group.
        const firstExisting = msgs[olderMsgs.length];
        const lastOlder = olderMsgs[olderMsgs.length - 1];
        if (
            firstExisting &&
            lastOlder &&
            !(firstExisting.from?.id === pageId || firstExisting.from_admin) &&
            lastOlder.from?.id === firstExisting.from?.id
        ) {
            // firstExisting is no longer the head of its group — but we
            // already render avatar only on the tail, so no DOM change
            // needed for it. The tail-rule already covered this.
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = parts.join('');
        // Remove the existing "load older" indicator (we'll re-insert at top
        // afterward if more remain).
        const oldIndicator = document.getElementById('msgLoadOlder');
        if (oldIndicator) oldIndicator.remove();

        const frag = document.createDocumentFragment();
        while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
        threadEl.insertBefore(frag, threadEl.firstChild);
        if (NO._chatState.hasMore) {
            threadEl.insertAdjacentHTML('afterbegin', NO._loadOlderIndicatorHtml());
        }
        // Restore scroll so the previously-visible bubble stays where the
        // user's eye was.
        requestAnimationFrame(() => {
            threadEl.scrollTop = threadEl.scrollHeight - prevScrollHeight + prevScrollTop;
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    NO._scrollRafPending = false;

    NO._attachScrollLoader = function _attachScrollLoader() {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !NO._chatState) return;
        threadEl.addEventListener('scroll', NO._onScrollRaw, { passive: true });
    };

    /**
     * Cheap pre-fetch skeleton. Renders 5 alternating-side placeholder
     * bubbles with the shimmer animation already defined on `.w2-chat-
     * skeleton-bubble`. Keeps the same flex column layout as the real
     * thread so swapping in the real messages doesn't reflow the modal.
     */
    NO._skeletonThreadHtml = function _skeletonThreadHtml() {
        const rows = [
            { side: 'in', w: '62%' },
            { side: 'out', w: '48%' },
            { side: 'in', w: '75%' },
            { side: 'out', w: '40%' },
            { side: 'in', w: '55%' },
        ];
        return rows
            .map((r) => {
                const align = r.side === 'in' ? 'flex-start' : 'flex-end';
                const radius = r.side === 'in' ? '14px 14px 14px 4px' : '14px 14px 4px 14px';
                return `<div style="display:flex;justify-content:${align};margin:2px 0;">
                    <div class="w2-chat-skeleton-bubble" style="width:${r.w};max-width:80%;height:32px;border-radius:${radius};"></div>
                </div>`;
            })
            .join('');
    };

    NO._onScrollRaw = function _onScrollRaw() {
        if (NO._scrollRafPending) return;
        NO._scrollRafPending = true;
        requestAnimationFrame(() => {
            NO._scrollRafPending = false;
            NO._onChatScroll();
        });
    };

    NO._onChatScroll = function _onChatScroll() {
        const threadEl = document.getElementById('msgThread');
        if (!threadEl || !NO._chatState) return;
        if (threadEl.scrollTop < 80 && NO._chatState.hasMore && !NO._chatState.loadingOlder) {
            NO._loadOlderMessages();
        }
        const nearBottom = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight < 40;
        const jump = document.getElementById('msgJumpBottom');
        if (jump && nearBottom && jump.style.display !== 'none') {
            jump.style.display = 'none';
            NO._chatState.missedSince = 0;
        }
    };

    NO._loadOlderMessages = async function _loadOlderMessages() {
        if (!NO._chatState || NO._chatState.loadingOlder) return;
        NO._chatState.loadingOlder = true;
        const indicator = document.getElementById('msgLoadOlder');
        if (indicator)
            indicator.innerHTML = `<span style="color:#0068ff;">⏳ Đang tải tin cũ…</span>`;
        try {
            const cursor = NO._chatState.cursor || NO._chatState.msgs.length;
            const r = await window.Web2Chat.fetchMessages(
                NO._chatState.pageId,
                NO._chatState.convId,
                NO._chatState.customerId,
                { currentCount: cursor }
            );
            if (!r.ok) {
                NO._chatState.hasMore = false;
                indicator?.remove();
                return;
            }
            const incoming = r.messages || [];
            const fresh = incoming.filter((m) => m.id && !NO._chatState.msgIds.has(m.id));
            if (!fresh.length) {
                NO._chatState.hasMore = false;
                indicator?.remove();
                return;
            }
            for (const m of fresh) NO._chatState.msgIds.add(m.id);
            NO._chatState.msgs = [...fresh, ...NO._chatState.msgs];
            NO._chatState.cursor = cursor + fresh.length;
            // Incremental DOM prepend — keeps the existing 25-55 bubbles
            // untouched (no reflow), inserts only the N new ones.
            NO._prependBubblesDom(fresh);
        } catch (e) {
            console.warn('[NativeOrders] loadOlder failed:', e.message);
        } finally {
            NO._chatState.loadingOlder = false;
        }
    };
})();
