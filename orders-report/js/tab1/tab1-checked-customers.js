// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   CHECKED CUSTOMERS — đánh dấu KH "đã kiểm tra / đã bán" theo CHIẾN DỊCH
   → loại khỏi thanh "Khách chưa trả lời" (kể cả khi có tin mới).
   Đồng bộ mọi máy: lưu server (table checked_customers) + SSE topic
   'checked_customers'. Scope theo window.campaignManager.activeCampaignId.

   API: window.CheckedCustomers
     - isChecked(psid) -> bool
     - check(psid, pageId) / uncheck(psid, pageId) / toggle(psid, pageId)
     - load() reload set chiến dịch hiện tại
   Phát event 'n2s:checkedCustomersChanged' mỗi khi set đổi (strip + inline
   editor nghe để re-render).
   ===================================================== */

(function () {
    'use strict';

    if (window.__checkedCustomersLoaded) return;
    window.__checkedCustomersLoaded = true;

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
    const WATCH_MS = 2000;

    let _set = new Set(); // psid (string) đã check trong chiến dịch hiện tại
    let _campaignKey = null;
    let _sse = null;
    let _lastSeenCampaign = null;

    function _getCampaign() {
        const cm = window.campaignManager;
        return cm && cm.activeCampaignId ? String(cm.activeCampaignId) : null;
    }

    function _checkedBy() {
        try {
            const a = window.authManager && window.authManager.getAuthState
                ? window.authManager.getAuthState()
                : null;
            return (a && (a.displayName || a.username || a.userId || a.uid)) || null;
        } catch (e) {
            return null;
        }
    }

    function _emit() {
        try {
            window.dispatchEvent(new CustomEvent('n2s:checkedCustomersChanged'));
        } catch (e) {}
    }

    function isChecked(psid) {
        return !!psid && _set.has(String(psid));
    }

    async function load() {
        const campaign = _getCampaign();
        _campaignKey = campaign;
        if (!campaign) {
            if (_set.size) {
                _set = new Set();
                _emit();
            }
            return;
        }
        try {
            const resp = await fetch(
                `${API_BASE}/checked-customers?campaign=${encodeURIComponent(campaign)}`
            );
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data || !data.success) return;
            // Chỉ áp nếu campaign chưa đổi giữa chừng
            if (_getCampaign() !== campaign) return;
            _set = new Set((data.psids || []).map((p) => String(p)));
            _emit();
        } catch (e) {
            console.warn('[CheckedCustomers] load failed:', e && e.message);
        }
    }

    async function check(psid, pageId) {
        const campaign = _getCampaign();
        if (!campaign || !psid) return;
        const key = String(psid);
        if (_set.has(key)) return;
        _set.add(key); // optimistic
        _emit();
        try {
            const resp = await fetch(`${API_BASE}/checked-customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign,
                    psid: key,
                    page_id: pageId || null,
                    checked_by: _checkedBy(),
                }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
        } catch (e) {
            // Chỉ rollback nếu vẫn đúng chiến dịch (tránh xoá nhầm set của chiến dịch mới).
            if (_getCampaign() === campaign) {
                _set.delete(key);
                _emit();
            }
            console.warn('[CheckedCustomers] check failed:', e && e.message);
        }
    }

    async function uncheck(psid, pageId) {
        const campaign = _getCampaign();
        if (!campaign || !psid) return;
        const key = String(psid);
        if (!_set.has(key)) return;
        _set.delete(key); // optimistic
        _emit();
        try {
            const resp = await fetch(`${API_BASE}/checked-customers`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaign, psid: key }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
        } catch (e) {
            if (_getCampaign() === campaign) {
                _set.add(key); // rollback
                _emit();
            }
            console.warn('[CheckedCustomers] uncheck failed:', e && e.message);
        }
    }

    function toggle(psid, pageId) {
        if (isChecked(psid)) uncheck(psid, pageId);
        else check(psid, pageId);
    }

    function _subscribeSSE() {
        if (typeof EventSource === 'undefined' || _sse) return;
        try {
            _sse = new EventSource(`${API_BASE}/sse?keys=checked_customers`);
            const onEvt = (ev) => {
                try {
                    const payload = JSON.parse(ev.data);
                    const body = payload.data || payload;
                    if (!body || !body.psid) return;
                    if (String(body.campaign) !== String(_campaignKey)) return; // khác chiến dịch
                    const key = String(body.psid);
                    if (body.action === 'uncheck') {
                        if (_set.delete(key)) _emit();
                    } else {
                        if (!_set.has(key)) {
                            _set.add(key);
                            _emit();
                        }
                    }
                } catch (e) {}
            };
            _sse.addEventListener('update', onEvt);
            _sse.onerror = () => {}; // EventSource tự reconnect
        } catch (e) {
            console.warn('[CheckedCustomers] SSE failed:', e && e.message);
        }
    }

    function _watchCampaign() {
        _lastSeenCampaign = _getCampaign();
        setInterval(() => {
            const cur = _getCampaign();
            if (cur !== _lastSeenCampaign) {
                _lastSeenCampaign = cur;
                load();
            }
        }, WATCH_MS);
    }

    function init() {
        window.CheckedCustomers = { isChecked, check, uncheck, toggle, load, getCampaign: _getCampaign };
        load();
        _subscribeSSE();
        _watchCampaign();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
