# TposCommentList — action handlers (bổ sung Phase 8)

Những method sau đây được reference trong template `renderConversationItem()` nhưng chưa implement ở [03-tpos-column.md](03-tpos-column.md). Paste vào `TposCommentList` object.

```javascript
// ========== RENDERING HELPERS ==========

renderComments() {
    const state = window.TposState;
    const list = document.getElementById('tposCommentList');
    if (!list) return;

    if (state.comments.length === 0) {
        list.innerHTML = `
            <div class="tpos-empty">
                <i data-lucide="message-square"></i>
                <span>${state.selectedCampaignIds?.length ? 'Chưa có comment' : 'Chọn campaign để bắt đầu'}</span>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    list.innerHTML = state.comments.map((c) => this.renderConversationItem(c)).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    this.updateLoadMoreIndicator();
},

renderCampaignOptions() {
    const state = window.TposState;
    const list = document.getElementById('tposCampaignList');
    const btnText = document.getElementById('tposCampaignBtnText');
    if (!list) return;

    // Only campaigns with Facebook_LiveId (live campaigns)
    const campaigns = state.liveCampaigns;
    list.innerHTML = campaigns.map((c) => {
        const checked = state.selectedCampaignIds?.includes(c.Id);
        const title = `${c.Facebook_UserName || ''} · ${c.Facebook_LiveName || c.Id}`;
        return `
            <label style="display:flex;align-items:center;padding:6px 10px;cursor:pointer;font-size:12px;gap:6px;">
                <input type="checkbox" value="${c.Id}" ${checked ? 'checked' : ''}>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${SharedUtils.escapeHtml(title)}</span>
                <span style="color:var(--gray-400);font-size:10px;">${SharedUtils.formatTime(c.CreatedTime)}</span>
            </label>`;
    }).join('');

    // Update button text
    if (btnText) {
        const count = state.selectedCampaignIds?.length || 0;
        btnText.textContent = count === 0 ? 'Chọn Campaign...' : `${count} campaign`;
    }

    // Enable campaign select button
    document.getElementById('tposCampaignBtn')?.removeAttribute('disabled');

    // Wire change events
    list.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.onchange = () => {
            const selectedIds = Array.from(list.querySelectorAll('input:checked')).map((i) => i.value);
            state.selectedCampaignIds = selectedIds;
            window.eventBus.emit('tpos:campaignsChanged', selectedIds);
            if (btnText) btnText.textContent = selectedIds.length ? `${selectedIds.length} campaign` : 'Chọn Campaign...';
        };
    });
},

toggleCampaignDropdown() {
    const dd = document.getElementById('tposCampaignDropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
},

selectTodayCampaigns() {
    const state = window.TposState;
    const list = document.getElementById('tposCampaignList');
    const today = new Date().toDateString();
    const todayIds = state.liveCampaigns
        .filter((c) => new Date(c.CreatedTime).toDateString() === today)
        .map((c) => c.Id);
    list?.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.checked = todayIds.includes(cb.value);
    });
    list?.querySelector('input')?.dispatchEvent(new Event('change'));
},

clearCampaignSelection() {
    const list = document.getElementById('tposCampaignList');
    list?.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.checked = false; });
    list?.querySelector('input')?.dispatchEvent(new Event('change'));
},

// ========== ACTION HANDLERS ==========

selectComment(commentId) {
    // Mark selected, emit to other column
    document.querySelectorAll('.tpos-conversation-item.selected').forEach((el) => el.classList.remove('selected'));
    const item = document.querySelector(`.tpos-conversation-item[data-comment-id="${commentId}"]`);
    item?.classList.add('selected');
    const state = window.TposState;
    const comment = state.comments.find((c) => c.id === commentId);
    if (comment) {
        window.eventBus.emit('tpos:commentSelected', { userId: comment.from?.id, comment });
    }
},

showPancakeCustomerInfo(fromId, name, pageId) {
    // Bridge to Pancake column — highlight conversation if exists
    window.PancakeConversationList?.highlightByUserId(fromId);
},

showOrderDetail(fromId) {
    const state = window.TposState;
    const info = state.sessionIndexMap.get(fromId);
    if (!info) return;
    if (info.source === 'NATIVE_WEB') {
        // Open native order detail modal (or just open panel)
        window.NativeOrdersApi.getByUser(fromId).then((order) => {
            alert('Native order: ' + JSON.stringify(order, null, 2));
        });
    } else {
        alert('TPOS order: ' + info.code);
    }
},

async saveInlinePhone(fromId, inputId) {
    const val = document.getElementById(inputId)?.value.trim();
    if (!val) return;
    const normalized = SharedUtils.normalizePhone(val);
    // 1. Update partner cache locally for immediate UI feedback
    const state = window.TposState;
    const pageObj = state.selectedPage;
    const key = `${pageObj?.Id || ''}_${fromId}`;
    const partner = state.partnerCache.get(key) || {};
    partner.Phone = normalized;
    state.partnerCache.set(key, partner);
    // 2. Load debt for new phone
    await window.sharedDebtManager.loadSingle(normalized);
    // 3. Re-render this row
    this.renderComments();
    // 4. TODO: POST to TPOS CreateUpdatePartner if needed (xem bản gốc tpos-api.js)
    window.notificationManager?.show('Đã lưu SĐT', 'success');
},

async saveInlineAddress(fromId, inputId) {
    const val = document.getElementById(inputId)?.value.trim();
    if (!val) return;
    const state = window.TposState;
    const pageObj = state.selectedPage;
    const key = `${pageObj?.Id || ''}_${fromId}`;
    const partner = state.partnerCache.get(key) || {};
    partner.Street = val;
    state.partnerCache.set(key, partner);
    window.notificationManager?.show('Đã lưu địa chỉ', 'success');
},

showReplyInput(commentId, fromId) {
    // Simple inline prompt (bản gốc dùng modal — đây là đơn giản hoá)
    const msg = prompt('Trả lời comment:');
    if (!msg?.trim()) return;
    const state = window.TposState;
    const comment = state.comments.find((c) => c.id === commentId);
    const pageId = comment?._pageObj?.Facebook_PageId;
    if (!pageId) return;
    window.TposApi.replyToComment(pageId, commentId, msg.trim()).then((res) => {
        window.notificationManager?.show(res ? 'Đã gửi trả lời' : 'Lỗi gửi', res ? 'success' : 'error');
    });
},

// ========== STATUS DROPDOWN ==========

getStatusOptions() {
    // Static list — bản gốc load từ TPOS API; simplified here.
    return [
        { value: 'normal',   text: 'Bình thường', color: '#10b981' },
        { value: 'warning',  text: 'Cảnh báo',     color: '#f59e0b' },
        { value: 'bomb',     text: 'Bom hàng',     color: '#dc2626' },
        { value: 'dangerous',text: 'Nguy hiểm',    color: '#ef4444' },
        { value: 'hidden',   text: 'Ẩn',           color: '#6b7280' },
    ];
},

toggleInlineStatusDropdown(fromId) {
    const dd = document.getElementById(`status-dropdown-${fromId}`);
    if (!dd) return;
    const options = this.getStatusOptions();
    if (!dd.innerHTML) {
        dd.innerHTML = options.map((o) => `
            <div class="inline-status-option" style="padding:6px 10px;cursor:pointer;font-size:11px;color:${o.color};font-weight:600;"
                 onclick="event.stopPropagation();TposCommentList.selectInlineStatus('${fromId}','${o.value}','${o.text}')">
                ${o.text}
            </div>`).join('');
    }
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
},

selectInlineStatus(fromId, value, text) {
    const state = window.TposState;
    const pageObj = state.selectedPage;
    const key = `${pageObj?.Id || ''}_${fromId}`;
    const partner = state.partnerCache.get(key) || {};
    partner.Status = { Name: text, Value: value };
    state.partnerCache.set(key, partner);
    document.getElementById(`status-text-${fromId}`).textContent = text;
    document.getElementById(`status-dropdown-${fromId}`).style.display = 'none';
    window.notificationManager?.show(`Trạng thái: ${text}`, 'info');
},

// ========== DEBT BADGE REFRESH ==========

updateDebtBadges() { this.renderComments(); },

updateLoadMoreIndicator() {
    const state = window.TposState;
    const el = document.getElementById('tposLoadMore');
    if (!el) return;
    el.style.display = state.isLoading || state.hasMore ? 'flex' : 'none';
},
```

## `setupEventHandlers()` bổ sung

```javascript
setupEventHandlers() {
    // CRM Team select
    const crmSelect = document.getElementById('tposCrmTeamSelect');
    crmSelect?.addEventListener('change', (e) => {
        window.eventBus.emit('tpos:crmTeamChanged', e.target.value);
    });

    // Campaign button toggle dropdown
    document.getElementById('tposCampaignBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCampaignDropdown();
    });
    document.getElementById('tposCampaignSelectAll')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectTodayCampaigns();
    });
    document.getElementById('tposCampaignClearAll')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearCampaignSelection();
    });
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dd = document.getElementById('tposCampaignDropdown');
        if (dd && dd.style.display !== 'none' && !e.target.closest('.tpos-campaign-multi')) {
            dd.style.display = 'none';
        }
        // Also close any inline status dropdown
        document.querySelectorAll('.tpos-status-dropdown').forEach((el) => {
            if (!e.target.closest('.inline-status-container')) el.style.display = 'none';
        });
    });

    // Scroll infinite load
    document.getElementById('tposCommentList')?.addEventListener('scroll', (e) => this.handleScroll(e.target));

    // Refresh button
    document.getElementById('btnTposRefresh')?.addEventListener('click', () => {
        window.eventBus.emit('tpos:refreshRequested');
    });
},

handleScroll(container) {
    const state = window.TposState;
    const bottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (bottom < 100 && state.hasMore && !state.isLoading) {
        window.eventBus.emit('tpos:loadMoreRequested');
    }
},
```

## `renderCrmTeamOptions()` đầy đủ

```javascript
renderCrmTeamOptions() {
    const state = window.TposState;
    const select = document.getElementById('tposCrmTeamSelect');
    if (!select) return;

    let opts = '<option value="">Chọn Page...</option>';
    if (state.allPages.length > 1) {
        opts += `<option value="all">📋 Tất cả Pages (${state.allPages.length})</option>`;
    }
    state.crmTeams.forEach((team) => {
        const pages = (team.Childs || []).filter((p) => p.Facebook_PageId && p.Facebook_TypeId === 'Page');
        if (pages.length === 0) return;
        opts += `<optgroup label="${SharedUtils.escapeHtml(team.Name)}">`;
        pages.forEach((p) => {
            opts += `<option value="${team.Id}:${p.Id}" data-page-id="${p.Facebook_PageId}">
                ${SharedUtils.escapeHtml(p.Facebook_PageName || p.Name)}
            </option>`;
        });
        opts += '</optgroup>';
    });
    select.innerHTML = opts;
    select.removeAttribute('disabled');
},
```
