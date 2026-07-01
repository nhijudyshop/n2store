// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================
// Web2CampaignPicker — BỘ CHỌN/LỌC CHIẾN DỊCH dùng chung (1 NGUỒN cho MỌI trang).
//
// Gom về 1 nguồn thay cho các dropdown chiến dịch fork rời rạc (native-orders có
// 2 dropdown cha+con; các trang khác chưa có). Mọi trang cần "lọc theo chiến dịch
// livestream" chỉ cần mount component này — KHÔNG tự dựng dropdown riêng.
//
// Chiến dịch = chiến dịch CHA (web2_live_parent_campaigns) qua Web2Campaign.
// Chọn 1 chiến dịch → onChange trả { campaignId, campaign, postIds } để trang tự lọc
// data (native_orders lọc theo fb_post_id ∈ postIds; trang khác tuỳ nghiệp vụ).
//
//   const picker = Web2CampaignPicker.mount('#campaignFilter', {
//       storageKey: 'so-order',        // khoá lưu lựa chọn riêng trang (localStorage)
//       label: 'Chiến dịch',           // nhãn nút (mặc định 'Chiến dịch')
//       includeAll: true,              // có option "Tất cả" (mặc định true)
//       autoResolvePosts: true,        // tự resolve postIds khi chọn (mặc định true)
//       onChange({ campaignId, campaign, postIds }) { ... },  // gọi khi đổi + lúc mount (restore)
//   });
//   picker.getSelection() → { campaignId, campaign, postIds }
//   picker.setCampaign(id)      // set tay
//   picker.refresh()            // tải lại danh sách chiến dịch
//   picker.destroy()
//
// Realtime: tự subscribe Web2Campaign SSE → danh sách chiến dịch cập nhật khi
// tạo/xoá/gán ở nơi khác (không cần refresh trang).
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2CampaignPicker) return; // 1 nguồn

    const LS_PREFIX = 'web2_campaign_pick:';

    function ensureStyles() {
        if (document.getElementById('web2-campaign-picker-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-campaign-picker-css';
        st.textContent = `
        .w2cp{position:relative;display:inline-flex;font-size:13px;font-family:inherit}
        .w2cp-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;
            border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#111827;cursor:pointer;
            font-size:13px;line-height:1;white-space:nowrap;transition:border-color .15s,box-shadow .15s}
        .w2cp-btn:hover{border-color:#0068ff}
        .w2cp-btn:focus-visible{outline:none;border-color:#0068ff;box-shadow:0 0 0 3px rgba(0,104,255,.15)}
        .w2cp-btn.is-active{border-color:#0068ff;background:#eef4ff;color:#0059db;font-weight:600}
        .w2cp-ico{width:15px;height:15px;flex:0 0 auto;opacity:.7}
        .w2cp-cur{max-width:180px;overflow:hidden;text-overflow:ellipsis}
        .w2cp-caret{width:14px;height:14px;flex:0 0 auto;opacity:.6;transition:transform .15s}
        .w2cp.is-open .w2cp-caret{transform:rotate(180deg)}
        .w2cp-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:1200;min-width:240px;max-width:340px;
            background:#fff;border:1px solid #e5e7eb;border-radius:10px;
            box-shadow:0 8px 24px rgba(0,0,0,.12);padding:6px;display:none;max-height:min(60vh,420px);
            overflow:auto;overscroll-behavior:contain}
        .w2cp.is-open .w2cp-pop{display:block}
        .w2cp-search{width:100%;height:32px;padding:0 10px;margin-bottom:6px;border:1px solid #e5e7eb;
            border-radius:7px;font-size:13px;box-sizing:border-box}
        .w2cp-search:focus{outline:none;border-color:#0068ff}
        .w2cp-opt{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:7px;cursor:pointer}
        .w2cp-opt:hover{background:#f3f6ff}
        .w2cp-opt.is-sel{background:#eef4ff}
        .w2cp-opt-nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .w2cp-opt-ct{color:#9ca3af;font-size:11px;flex:0 0 auto}
        .w2cp-opt-check{width:15px;height:15px;flex:0 0 auto;color:#0068ff;visibility:hidden}
        .w2cp-opt.is-sel .w2cp-opt-check{visibility:visible}
        .w2cp-empty{padding:12px 10px;color:#9ca3af;font-size:12px;text-align:center}
        @media (max-width:560px){.w2cp-pop{position:fixed;left:8px;right:8px;min-width:0;max-width:none;width:auto}}
        `;
        document.head.appendChild(st);
    }

    const ICO_TAG =
        '<svg class="w2cp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>';
    const ICO_CARET =
        '<svg class="w2cp-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    const ICO_CHECK =
        '<svg class="w2cp-opt-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function mount(target, opts) {
        opts = opts || {};
        const host = typeof target === 'string' ? document.querySelector(target) : target;
        if (!host) {
            console.warn('[Web2CampaignPicker] target không tồn tại:', target);
            return null;
        }
        ensureStyles();

        const storageKey = LS_PREFIX + (opts.storageKey || 'default');
        const includeAll = opts.includeAll !== false;
        const autoResolvePosts = opts.autoResolvePosts !== false;
        const label = opts.label || 'Chiến dịch';
        const onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

        let campaigns = [];
        let selectedId = readSaved();
        let unsub = null;
        let destroyed = false;

        function readSaved() {
            try {
                const v = localStorage.getItem(storageKey);
                return v ? v : null;
            } catch (e) {
                return null;
            }
        }
        function saveSel() {
            try {
                if (selectedId == null || selectedId === '') localStorage.removeItem(storageKey);
                else localStorage.setItem(storageKey, String(selectedId));
            } catch (e) {
                /* quota */
            }
        }

        const root = document.createElement('div');
        root.className = 'w2cp';
        root.innerHTML =
            '<button type="button" class="w2cp-btn" aria-haspopup="listbox" aria-expanded="false">' +
            ICO_TAG +
            '<span class="w2cp-cur"></span>' +
            ICO_CARET +
            '</button>' +
            '<div class="w2cp-pop" role="listbox">' +
            '<input type="text" class="w2cp-search" placeholder="Tìm chiến dịch…" />' +
            '<div class="w2cp-list"></div>' +
            '</div>';
        host.appendChild(root);

        const btn = root.querySelector('.w2cp-btn');
        const pop = root.querySelector('.w2cp-pop');
        const curEl = root.querySelector('.w2cp-cur');
        const searchEl = root.querySelector('.w2cp-search');
        const listEl = root.querySelector('.w2cp-list');

        function currentCampaign() {
            return campaigns.find((c) => String(c.id) === String(selectedId)) || null;
        }

        function renderButton() {
            const c = currentCampaign();
            if (c) {
                curEl.textContent = c.name;
                btn.classList.add('is-active');
            } else {
                curEl.textContent = label + ': Tất cả';
                btn.classList.remove('is-active');
            }
        }

        function renderList(filter) {
            const q = (filter || '').trim().toLowerCase();
            const rows = [];
            if (includeAll) {
                const sel = !selectedId ? ' is-sel' : '';
                rows.push(
                    '<div class="w2cp-opt' +
                        sel +
                        '" data-id="" role="option">' +
                        ICO_CHECK +
                        '<span class="w2cp-opt-nm">Tất cả chiến dịch</span></div>'
                );
            }
            const list = campaigns.filter(
                (c) =>
                    !q ||
                    String(c.name || '')
                        .toLowerCase()
                        .includes(q)
            );
            for (const c of list) {
                const sel = String(c.id) === String(selectedId) ? ' is-sel' : '';
                rows.push(
                    '<div class="w2cp-opt' +
                        sel +
                        '" data-id="' +
                        esc(c.id) +
                        '" role="option">' +
                        ICO_CHECK +
                        '<span class="w2cp-opt-nm">' +
                        esc(c.name) +
                        '</span>' +
                        '<span class="w2cp-opt-ct">' +
                        (c.post_count || 0) +
                        ' bài</span></div>'
                );
            }
            if (!rows.length) rows.push('<div class="w2cp-empty">Chưa có chiến dịch nào</div>');
            listEl.innerHTML = rows.join('');
        }

        async function emitChange() {
            const c = currentCampaign();
            let postIds = [];
            if (selectedId && autoResolvePosts && global.Web2Campaign) {
                try {
                    postIds = await global.Web2Campaign.postsForCampaign(selectedId);
                } catch (e) {
                    /* deploy gap / lỗi → postIds rỗng, trang tự xử */
                }
            }
            if (!destroyed) onChange({ campaignId: selectedId || null, campaign: c, postIds });
        }

        function open() {
            root.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
            renderList(searchEl.value);
            setTimeout(() => searchEl.focus(), 0);
            document.addEventListener('mousedown', onDocDown, true);
        }
        function close() {
            root.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
            document.removeEventListener('mousedown', onDocDown, true);
        }
        function onDocDown(e) {
            if (!root.contains(e.target)) close();
        }

        btn.addEventListener('click', () =>
            root.classList.contains('is-open') ? close() : open()
        );
        searchEl.addEventListener('input', () => renderList(searchEl.value));
        listEl.addEventListener('click', (e) => {
            const opt = e.target.closest('.w2cp-opt');
            if (!opt) return;
            const id = opt.getAttribute('data-id') || '';
            selectedId = id || null;
            saveSel();
            renderButton();
            close();
            emitChange();
        });

        async function refresh() {
            try {
                campaigns = (global.Web2Campaign ? await global.Web2Campaign.list() : []) || [];
            } catch (e) {
                console.warn('[Web2CampaignPicker] tải chiến dịch lỗi:', e.message);
                campaigns = [];
            }
            // Dọn lựa chọn không còn tồn tại (chiến dịch đã xoá) → về Tất cả.
            if (selectedId && !campaigns.some((c) => String(c.id) === String(selectedId))) {
                selectedId = null;
                saveSel();
            }
            renderButton();
            if (root.classList.contains('is-open')) renderList(searchEl.value);
        }

        // Realtime: chiến dịch tạo/xoá/gán ở nơi khác → cập nhật danh sách (không đổi lựa chọn).
        if (global.Web2Campaign && global.Web2Campaign.subscribe) {
            let t = null;
            unsub = global.Web2Campaign.subscribe(function (msg) {
                if (msg && msg.topic === 'web2:live-comments') {
                    clearTimeout(t);
                    t = setTimeout(refresh, 500);
                }
            });
        }

        renderButton();
        // Tải danh sách + phát lựa chọn đã lưu (restore) khi mount.
        refresh().then(emitChange);

        const api = {
            getSelection() {
                return { campaignId: selectedId || null, campaign: currentCampaign(), postIds: [] };
            },
            setCampaign(id) {
                selectedId = id || null;
                saveSel();
                renderButton();
                emitChange();
            },
            refresh,
            destroy() {
                destroyed = true;
                try {
                    unsub && unsub();
                } catch (e) {}
                document.removeEventListener('mousedown', onDocDown, true);
                root.remove();
            },
        };
        return api;
    }

    global.Web2CampaignPicker = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
