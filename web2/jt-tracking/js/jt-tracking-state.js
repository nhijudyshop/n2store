// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// J&T Tracking — shared mutable state: list/kpi/filters, tagged-phone set (localStorage + DB),
// nhóm convId sidecar, Lottie registry (lazy + destroy). NGUỒN DUY NHẤT cho state.
(function () {
    'use strict';

    const { LOTTIE_DIR, $, icons } = window.JtTrackingConst;
    const { api } = window.JtTrackingApi;

    const state = { list: [], kpi: {}, status: 'all', search: '' };

    // ── Lottie (lazy + registry để destroy) ─────────────────────────
    const _anims = new Map();
    function playLottie(elId, name, loop) {
        const el = $(elId);
        if (!el || !window.lottie || !name) return;
        try {
            const a = lottie.loadAnimation({
                container: el,
                renderer: 'svg',
                loop: loop !== false,
                autoplay: true,
                path: `${LOTTIE_DIR}/${name}.json`,
            });
            _anims.set(elId, a);
        } catch (e) {
            /* graceful: bỏ qua nếu lottie lỗi */
        }
    }
    function destroyLottie(elId) {
        const a = _anims.get(elId);
        if (a) {
            try {
                a.destroy();
            } catch {}
            _anims.delete(elId);
        }
    }

    // Nhớ SĐT đã gắn thẻ "XỬ LÝ BC" (hiển thị nút đã-gắn qua nhiều lần load).
    const TAGGED_KEY = 'jt_tagged_phones';
    function loadTagged() {
        try {
            return new Set(JSON.parse(localStorage.getItem(TAGGED_KEY) || '[]'));
        } catch {
            return new Set();
        }
    }
    const _taggedPhones = loadTagged();
    let _jtGroupConvId = null; // conv id nhóm J&T (suy từ row có sẵn) → nút chat cho mọi row
    function getGroupConvId() {
        return _jtGroupConvId;
    }
    function setGroupConvId(v) {
        _jtGroupConvId = v;
    }
    function _saveTagged() {
        try {
            localStorage.setItem(TAGGED_KEY, JSON.stringify([..._taggedPhones]));
        } catch {}
    }
    // persist=true (mặc định) → ghi DB để đồng bộ đa máy; false khi đang nạp TỪ DB (tránh vòng).
    function _persistTag(phone, tagged) {
        api('/bc-tag', { method: 'POST', body: { phone, tagged } }).catch(() => {});
    }
    function markTagged(phone, persist) {
        if (!phone) return;
        const changed = !_taggedPhones.has(phone);
        _taggedPhones.add(phone);
        _saveTagged();
        if (changed && persist !== false) _persistTag(phone, true);
    }
    function unmarkTagged(phone, persist) {
        if (!phone) return;
        const changed = _taggedPhones.delete(phone);
        _saveTagged();
        if (changed && persist !== false) _persistTag(phone, false);
    }
    // Nạp tập SĐT đã gắn thẻ TỪ DB (nguồn đồng bộ đa máy) → cập nhật _taggedPhones + cache.
    async function loadBcTags() {
        try {
            const j = await api('/bc-tags');
            const set = new Set(j.phones || []);
            _taggedPhones.clear();
            set.forEach((p) => _taggedPhones.add(p));
            _saveTagged();
        } catch (e) {
            /* offline → giữ cache localStorage */
        }
    }
    // Cập nhật mọi nút tag cùng SĐT → trạng thái đã-gắn / chưa-gắn.
    function setTagButtons(phone, tagged) {
        document
            .querySelectorAll(`[data-act="tag"][data-phone="${CSS.escape(phone)}"]`)
            .forEach((b) => {
                b.classList.toggle('is-tagged', tagged);
                b.title = tagged
                    ? 'Khách đã gắn thẻ XỬ LÝ BC (bấm để GỠ)'
                    : 'Gắn thẻ Pancake: XỬ LÝ BC';
                // ⚠ Lucide đã thay <i data-lucide> bằng <svg> sau lần render đầu → đổi
                // data-lucide trên <i> cũ KHÔNG vẽ lại (querySelector('i') còn trả null).
                // Thay HẲN icon con bằng <i data-lucide> mới rồi cho lucide vẽ lại → đổi
                // ngay tag↔badge-check không cần refresh.
                b.innerHTML = `<i data-lucide="${tagged ? 'badge-check' : 'tag'}"></i>`;
            });
        icons();
    }

    window.JtTrackingState = {
        state,
        // Lottie registry
        playLottie,
        destroyLottie,
        // tagged-phone set
        taggedPhones: _taggedPhones,
        markTagged,
        unmarkTagged,
        loadBcTags,
        setTagButtons,
        // nhóm convId sidecar
        getGroupConvId,
        setGroupConvId,
    };
})();
