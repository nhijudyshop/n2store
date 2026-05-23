// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Livestream Snapshot UI cho tpos-pancake
//
// Flow:
//   1. User chọn "Snap page" từ chip header (Store / House, default Store, lưu localStorage)
//   2. Click 📸 button trên comment row → POST /api/livestream/snapshot
//      Tự resolve liveCampaignId + liveVideoId từ TposState theo Snap page
//   3. Sau snap, badge counter trên row update + toast confirm
//   4. Click badge → popover list snapshots → mỗi entry có thumbnail + thời gian + "Xem live" deep-link
//
// SSE topic: web2:livestream-snapshots — multi-tab sync.
// =====================================================

(function () {
    'use strict';
    const global = window;
    if (global.TposLivestreamSnap) return;

    const API = global.SHOP_CONFIG?.RENDER_API_URL || 'https://n2store-fallback.onrender.com';
    const LS_KEY_SNAP_PAGE = 'tpos_snap_live_page'; // 'store' | 'house'
    const STATE = {
        counts: {}, // customerFbUserId → count
        cacheList: new Map(), // customerFbUserId → snapshots[]
        popoverOpen: null, // customerFbUserId
    };

    function _getSnapPagePref() {
        return localStorage.getItem(LS_KEY_SNAP_PAGE) || 'store';
    }
    function _setSnapPagePref(v) {
        localStorage.setItem(LS_KEY_SNAP_PAGE, v);
        renderHeaderChip();
    }

    // Resolve page object từ allPages dựa trên snap page preference.
    function _resolvePageObj() {
        const st = global.TposState;
        if (!st?.allPages) return null;
        const pref = _getSnapPagePref();
        return (
            st.allPages.find((p) => {
                const n = (p.Name || '').toLowerCase();
                if (pref === 'house') return n.includes('house');
                return n.includes('store');
            }) || st.selectedPage
        );
    }

    // Resolve active live campaign cho page đã chọn.
    function _resolveActiveCampaign(pageObj) {
        const st = global.TposState;
        if (!st?.liveCampaigns?.length || !pageObj) return null;
        // Lấy campaign mới nhất (selectedCampaign nếu cùng page, else đầu list)
        const sel = st.selectedCampaign;
        if (sel && sel._pageObj?.Facebook_PageId === pageObj.Facebook_PageId) return sel;
        return st.liveCampaigns[0] || null;
    }

    function _user() {
        const u = global.AuthManager?.getCurrentUser?.() || {};
        return { id: u.uid || u.email || null, name: u.displayName || u.email || null };
    }

    function _toast(msg, type = 'ok') {
        if (global.notificationManager?.show) {
            global.notificationManager.show(msg, type === 'err' ? 'error' : 'success');
        } else {
            console.log('[snap-toast]', type, msg);
        }
    }

    function _esc(s) {
        return String(s || '').replace(
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

    // -----------------------------------------------------
    // Header chip — Snap page selector
    // -----------------------------------------------------
    function ensureHeaderChip() {
        let chip = document.getElementById('tpos-snap-page-chip');
        if (chip) return chip;
        // Try mount in TPOS header area
        const host =
            document.querySelector('.tpos-header-bar') ||
            document.querySelector('.tpos-toolbar') ||
            document.querySelector('#tposCommentHeader') ||
            document.querySelector('#tposContent');
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-page-chip';
        chip.className = 'tpos-snap-page-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:14px;font-size:12px;font-weight:600;color:#92400e;cursor:pointer;margin-left:8px;user-select:none;';
        chip.addEventListener('click', () => {
            const next = _getSnapPagePref() === 'store' ? 'house' : 'store';
            _setSnapPagePref(next);
            _toast(`📡 Snap live: ${next === 'house' ? 'Nhi Judy House' : 'NhiJudy Store'}`, 'ok');
        });
        host.appendChild(chip);
        renderHeaderChip();
        return chip;
    }
    function renderHeaderChip() {
        const chip = document.getElementById('tpos-snap-page-chip');
        if (!chip) return;
        const pref = _getSnapPagePref();
        const label = pref === 'house' ? 'House' : 'Store';
        chip.innerHTML = `📡 Snap live: <strong>${label}</strong> <span style="opacity:0.6;font-size:10px;">▼</span>`;
        chip.title = `Click để đổi (current: ${pref}). Snap button sẽ chụp từ live của page này.`;
    }

    // -----------------------------------------------------
    // Snap action — POST /api/livestream/snapshot
    // -----------------------------------------------------
    async function snap(customerFbUserId, customerName, commentId, sourceBtn) {
        const pageObj = _resolvePageObj();
        if (!pageObj) {
            _toast('Chưa chọn page — vào TPOS chọn page trước', 'err');
            return;
        }
        const camp = _resolveActiveCampaign(pageObj);
        if (!camp) {
            _toast(`Page "${pageObj.Name}" chưa có live campaign active`, 'err');
            return;
        }
        const liveVideoId = camp.Facebook_LiveId || null;
        const liveCampaignId = camp.Id ? String(camp.Id) : null;
        const startedTime = camp.StartedTime || camp.StartedDate || camp.Started_At || null;
        const startMs = startedTime ? new Date(startedTime).getTime() : null;
        const now = Date.now();
        const offsetSec = startMs && now > startMs ? Math.floor((now - startMs) / 1000) : null;

        // Optimistic: increment badge count NGAY
        STATE.counts[customerFbUserId] = (STATE.counts[customerFbUserId] || 0) + 1;
        _renderBadgeFor(customerFbUserId);
        // Visual feedback button
        if (sourceBtn) {
            sourceBtn.classList.add('snap-flash');
            setTimeout(() => sourceBtn.classList.remove('snap-flash'), 400);
        }

        try {
            const r = await fetch(API + '/api/livestream/snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    commentId,
                    customerFbUserId,
                    customerName,
                    pageId: pageObj.Facebook_PageId,
                    pageName: pageObj.Name,
                    liveCampaignId,
                    liveVideoId,
                    capturedAt: now,
                    offsetSeconds: offsetSec,
                    user: _user(),
                }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'snap failed');
            const t = new Date(now).toLocaleTimeString('vi-VN', { hour12: false });
            _toast(`📸 Đã chụp lúc ${t}${offsetSec ? ' (offset ' + offsetSec + 's)' : ''}`);
            // Invalidate cached list nếu đang mở popover
            STATE.cacheList.delete(customerFbUserId);
            if (STATE.popoverOpen === customerFbUserId) {
                _refreshPopoverContent(customerFbUserId);
            }
        } catch (e) {
            // Rollback optimistic
            STATE.counts[customerFbUserId] = Math.max(0, (STATE.counts[customerFbUserId] || 1) - 1);
            _renderBadgeFor(customerFbUserId);
            _toast('Lỗi snap: ' + e.message, 'err');
        }
    }

    // -----------------------------------------------------
    // Badge counter
    // -----------------------------------------------------
    function _renderBadgeFor(customerFbUserId) {
        // Find ALL snap buttons for this customer (multiple comments cùng customer)
        const btns = document.querySelectorAll(
            `.tpos-snap-btn[data-customer-id="${CSS.escape(customerFbUserId)}"]`
        );
        const n = STATE.counts[customerFbUserId] || 0;
        btns.forEach((btn) => {
            let badge = btn.querySelector('.tpos-snap-count');
            if (n > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'tpos-snap-count';
                    badge.style.cssText =
                        'background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:8px;margin-left:3px;min-width:14px;text-align:center;display:inline-block;';
                    btn.appendChild(badge);
                }
                badge.textContent = n;
            } else if (badge) {
                badge.remove();
            }
        });
    }

    async function refreshCounts(customerIds) {
        try {
            const ids =
                customerIds && customerIds.length
                    ? customerIds
                    : Array.from(
                          new Set(
                              Array.from(
                                  document.querySelectorAll('.tpos-snap-btn[data-customer-id]')
                              )
                                  .map((b) => b.dataset.customerId)
                                  .filter(Boolean)
                          )
                      );
            if (!ids.length) return;
            const r = await fetch(
                API +
                    '/api/livestream/snapshots/batch-counts?customerIds=' +
                    encodeURIComponent(ids.join(',')),
                { credentials: 'include' }
            );
            const d = await r.json();
            const counts = d.counts || {};
            for (const id of ids) STATE.counts[id] = counts[id] || 0;
            ids.forEach(_renderBadgeFor);
        } catch (e) {
            console.warn('[snap] refreshCounts fail:', e.message);
        }
    }

    // -----------------------------------------------------
    // Popover — list snapshots
    // -----------------------------------------------------
    async function togglePopover(customerFbUserId, customerName, anchor) {
        const existing = document.querySelector('.tpos-snap-popover');
        if (existing && STATE.popoverOpen === customerFbUserId) {
            existing.remove();
            STATE.popoverOpen = null;
            return;
        }
        if (existing) existing.remove();
        STATE.popoverOpen = customerFbUserId;

        const pop = document.createElement('div');
        pop.className = 'tpos-snap-popover';
        pop.style.cssText =
            'position:absolute;z-index:9999;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:10px;min-width:280px;max-width:340px;max-height:420px;overflow-y:auto;font-family:Inter,system-ui,sans-serif;';
        pop.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;">
                <span style="font-size:12px;font-weight:600;color:#111;">📸 Snapshots — ${_esc(customerName || '?')}</span>
                <button type="button" class="snap-pop-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <div class="snap-pop-body" style="font-size:12px;color:#475569;">Đang tải…</div>
        `;
        document.body.appendChild(pop);
        // Position near anchor
        const rect = anchor.getBoundingClientRect();
        pop.style.top = `${window.scrollY + rect.bottom + 6}px`;
        pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, rect.left))}px`;
        // Close handlers
        pop.querySelector('.snap-pop-close').onclick = () => {
            pop.remove();
            STATE.popoverOpen = null;
        };
        setTimeout(() => {
            const closeOutside = (e) => {
                if (!pop.contains(e.target) && !anchor.contains(e.target)) {
                    pop.remove();
                    STATE.popoverOpen = null;
                    document.removeEventListener('click', closeOutside);
                }
            };
            document.addEventListener('click', closeOutside);
        }, 0);

        await _refreshPopoverContent(customerFbUserId);
    }

    async function _refreshPopoverContent(customerFbUserId) {
        const pop = document.querySelector('.tpos-snap-popover');
        if (!pop) return;
        const body = pop.querySelector('.snap-pop-body');
        try {
            const r = await fetch(
                API +
                    '/api/livestream/snapshots?customerFbUserId=' +
                    encodeURIComponent(customerFbUserId) +
                    '&limit=30',
                { credentials: 'include' }
            );
            const d = await r.json();
            const list = d.snapshots || [];
            STATE.cacheList.set(customerFbUserId, list);
            if (!list.length) {
                body.innerHTML = `<div style="color:#94a3b8;font-style:italic;text-align:center;padding:14px 0;">Chưa có snapshot nào.<br>Bấm 📸 trên comment để bắt đầu.</div>`;
                return;
            }
            body.innerHTML = list
                .map((s) => {
                    const t = new Date(s.capturedAt).toLocaleString('vi-VN', { hour12: false });
                    const url = s.livestreamUrl || '#';
                    const thumb = s.thumbnailUrl
                        ? `<img src="${_esc(s.thumbnailUrl)}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:6px;background:#f1f5f9;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" /><span style="display:none;width:54px;height:54px;border-radius:6px;background:#f1f5f9;align-items:center;justify-content:center;font-size:18px;">📷</span>`
                        : `<span style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#f1f5f9;align-items:center;justify-content:center;font-size:18px;">📷</span>`;
                    const pageBadge = s.pageName
                        ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:6px;font-weight:600;">${_esc(s.pageName.replace(/^Nhi Judy /, '').replace(/^NhiJudy /, ''))}</span>`
                        : '';
                    const offsetTxt = s.offsetSeconds
                        ? ` <span style="color:#64748b;font-size:10px;">+${s.offsetSeconds}s</span>`
                        : '';
                    return `
                        <div class="snap-pop-row" data-id="${s.id}" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;align-items:center;">
                            ${thumb}
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:11px;color:#0f172a;font-weight:600;">${_esc(t)}${offsetTxt}</div>
                                <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;gap:4px;align-items:center;">${pageBadge}${s.note ? ' · ' + _esc(s.note) : ''}</div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:3px;">
                                <a href="${_esc(url)}" target="_blank" rel="noopener" title="Mở FB live tại thời điểm chụp" style="font-size:10px;color:#fff;background:#1877f2;padding:3px 8px;border-radius:5px;text-decoration:none;font-weight:600;text-align:center;">▶ Xem</a>
                                <button type="button" class="snap-pop-del" data-id="${s.id}" title="Xóa snapshot" style="font-size:10px;color:#dc2626;background:#fee2e2;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">Xóa</button>
                            </div>
                        </div>`;
                })
                .join('');
            body.querySelectorAll('.snap-pop-del').forEach((btn) => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    if (!confirm('Xóa snapshot này?')) return;
                    try {
                        const r = await fetch(API + '/api/livestream/snapshot/' + id, {
                            method: 'DELETE',
                            credentials: 'include',
                        });
                        const d = await r.json();
                        if (!d.success) throw new Error(d.error);
                        STATE.cacheList.delete(customerFbUserId);
                        STATE.counts[customerFbUserId] = Math.max(
                            0,
                            (STATE.counts[customerFbUserId] || 1) - 1
                        );
                        _renderBadgeFor(customerFbUserId);
                        _refreshPopoverContent(customerFbUserId);
                    } catch (err) {
                        _toast('Xóa fail: ' + err.message, 'err');
                    }
                };
            });
        } catch (e) {
            body.innerHTML = `<div style="color:#dc2626;">Lỗi tải: ${_esc(e.message)}</div>`;
        }
    }

    // -----------------------------------------------------
    // Inject snap button vào mỗi comment row.
    // Gọi sau khi TposCommentList render xong.
    // -----------------------------------------------------
    function injectSnapButtonsAll() {
        document.querySelectorAll('.tpos-conversation-item').forEach((row) => {
            injectSnapButton(row);
        });
    }
    function injectSnapButton(row) {
        if (!row || row.querySelector('.tpos-snap-btn')) return;
        const commentId = row.dataset.commentId;
        if (!commentId) return;
        const st = global.TposState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) return;
        const customerFbUserId = c.from.id;
        const customerName = c.from.name || '?';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tpos-action-btn tpos-snap-btn';
        btn.dataset.customerId = customerFbUserId;
        btn.title = `Snap livestream cho KH ${customerName} (click giữ Shift để xem list)`;
        btn.innerHTML = `<i data-lucide="camera" style="width:13px;height:13px;"></i>`;
        btn.style.cssText = 'color:#dc2626;position:relative;';
        btn.onclick = (e) => {
            e.stopPropagation();
            if (e.shiftKey) {
                togglePopover(customerFbUserId, customerName, btn);
            } else {
                snap(customerFbUserId, customerName, commentId, btn);
            }
        };
        // Right-click → show popover
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePopover(customerFbUserId, customerName, btn);
        };

        // Mount: sau nút create-order nếu có, fallback action-buttons container
        const actions =
            row.querySelector('.tpos-action-buttons') ||
            row.querySelector('.tpos-actions') ||
            row.querySelector('[class*="action"]');
        if (actions) actions.appendChild(btn);
        else row.appendChild(btn);

        if (global.lucide) global.lucide.createIcons();
        _renderBadgeFor(customerFbUserId);
    }

    // -----------------------------------------------------
    // Observer — auto-inject khi comment list update
    // -----------------------------------------------------
    function setupObserver() {
        const target = document.body;
        const obs = new MutationObserver((muts) => {
            let dirty = false;
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (
                        n.matches?.('.tpos-conversation-item') ||
                        n.querySelector?.('.tpos-conversation-item')
                    ) {
                        dirty = true;
                    }
                }
            }
            if (dirty) {
                clearTimeout(setupObserver._t);
                setupObserver._t = setTimeout(() => {
                    injectSnapButtonsAll();
                    refreshCounts();
                }, 250);
            }
        });
        obs.observe(target, { childList: true, subtree: true });
    }

    // -----------------------------------------------------
    // SSE subscribe — multi-tab sync
    // -----------------------------------------------------
    function subscribeSSE() {
        if (!global.Web2SSE?.subscribe) return;
        global.Web2SSE.subscribe('web2:livestream-snapshots', (msg) => {
            const { customerFbUserId, action } = msg?.data || {};
            if (!customerFbUserId) return;
            // Invalidate cache + refetch count
            STATE.cacheList.delete(customerFbUserId);
            refreshCounts([customerFbUserId]);
            if (STATE.popoverOpen === customerFbUserId) {
                _refreshPopoverContent(customerFbUserId);
            }
        });
    }

    // -----------------------------------------------------
    // Init
    // -----------------------------------------------------
    function init() {
        ensureHeaderChip();
        setupObserver();
        subscribeSSE();
        // Initial inject + count fetch (delay để TPOS render trước)
        setTimeout(() => {
            injectSnapButtonsAll();
            refreshCounts();
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.TposLivestreamSnap = {
        snap,
        togglePopover,
        refreshCounts,
        injectSnapButtonsAll,
        _getSnapPagePref,
        _setSnapPagePref,
    };
})();
