// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Cân nặng hàng khi về kiện.
(function () {
    'use strict';

    const API_BASE =
        window.API_CONFIG?.WORKER_URL ||
        window.WEB2_CONFIG?.WORKER_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const GW = API_BASE + '/api/web2-goods-weight';

    // ---- auth helpers (pattern canonical web2_auth = {token, expiresAt, user}) ----
    function _auth() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null');
        } catch (_) {
            return null;
        }
    }
    const token = () => _auth()?.token || '';
    const username = () =>
        (window.Web2Auth?.getStored && window.Web2Auth.getStored()?.user?.username) ||
        _auth()?.user?.username ||
        '';
    function isAdmin() {
        const u =
            (window.Web2Auth?.getStored && window.Web2Auth.getStored()?.user) || _auth()?.user;
        return !!(u && (u.role === 'admin' || u.isAdmin === true));
    }
    async function api(path, opts = {}) {
        const t = token();
        const res = await fetch(GW + path, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                ...(t ? { 'x-web2-token': t } : {}),
                ...(opts.headers || {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
    }

    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    function icons(root) {
        if (window.lucide?.createIcons)
            try {
                window.lucide.createIcons({
                    nameAttr: 'data-lucide',
                    ...(root ? { el: root } : {}),
                });
            } catch (_) {}
    }
    // GMT+7 (Asia/Ho_Chi_Minh) — quy ước hiển thị Web 2.0.
    const FMT = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    const fmtTime = (ms) => (ms ? FMT.format(new Date(Number(ms))) : '');

    let toastTimer = null;
    function toast(msg, kind) {
        let el = $('#gwToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'gwToast';
            el.className = 'gw-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.className = 'gw-toast show ' + (kind || '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (el.className = 'gw-toast'), 2600);
    }

    // ---- ảnh: nén canvas ≤1280px, jpeg 0.8 (giảm payload từ ~4MB cam → ~300KB) ----
    let pendingDataUrl = null;
    function compress(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const MAX = 1280;
                let { width: w, height: h } = img;
                if (w > MAX || h > MAX) {
                    const r = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * r);
                    h = Math.round(h * r);
                }
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cv.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Ảnh không đọc được'));
            };
            img.src = url;
        });
    }
    async function onPhoto(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            pendingDataUrl = await compress(file);
            $('#gwPreviewImg').src = pendingDataUrl;
            $('#gwPreview').hidden = false;
            $('#gwPhotoBtn').hidden = true;
        } catch (err) {
            toast('Lỗi ảnh: ' + err.message, 'err');
        }
    }
    function clearPhoto() {
        pendingDataUrl = null;
        $('#gwPreviewImg').src = '';
        $('#gwPreview').hidden = true;
        $('#gwPhotoBtn').hidden = false;
    }

    // ---- save ----
    async function save() {
        const kg = Number($('#gwKg').value);
        const bales = Math.round(Number($('#gwBales').value));
        const note = $('#gwNote').value.trim();
        if (!Number.isFinite(kg) || kg <= 0) return toast('Nhập số kg hợp lệ', 'err');
        if (!Number.isInteger(bales) || bales < 1) return toast('Nhập số kiện ≥ 1', 'err');
        if (!pendingDataUrl) return toast('Chụp ảnh mặt cân trước', 'err');
        const btn = $('#gwSave');
        btn.disabled = true;
        btn.classList.add('loading');
        try {
            await api('/', {
                method: 'POST',
                body: JSON.stringify({
                    weightKg: kg,
                    baleCount: bales,
                    note,
                    dataUrl: pendingDataUrl,
                }),
            });
            toast('✓ Đã lưu cân nặng', 'ok');
            $('#gwKg').value = '';
            $('#gwBales').value = '';
            $('#gwNote').value = '';
            clearPhoto();
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    // ---- list ----
    let DATA = { items: [], total: 0 };
    async function load() {
        try {
            DATA = await api('/list?limit=100');
            render();
        } catch (e) {
            $('#gwList').innerHTML = `<div class="gw-muted">Lỗi tải: ${esc(e.message)}</div>`;
        }
    }
    function render() {
        const admin = isAdmin();
        $('#gwCount').textContent = DATA.total ? `${DATA.total} bản ghi` : '';
        const items = DATA.items || [];
        if (!items.length) {
            $('#gwList').innerHTML = '<div class="gw-muted">Chưa có lần cân nào.</div>';
            return;
        }
        $('#gwList').innerHTML = items
            .map((it) => {
                const img = it.hasImage ? `${GW}/img/${esc(it.id)}` : '';
                return `<div class="gw-card">
                    ${
                        img
                            ? `<img class="gw-thumb" src="${img}" alt="Ảnh cân" data-img="${img}" loading="lazy" />`
                            : `<div class="gw-thumb gw-thumb-empty"><i data-lucide="image-off"></i></div>`
                    }
                    <div class="gw-card-body">
                        <div class="gw-card-top">
                            <span class="gw-kg">${esc(it.weightKg)} <small>kg</small></span>
                            <span class="gw-bales">${esc(it.baleCount)} kiện</span>
                        </div>
                        ${it.note ? `<div class="gw-note">${esc(it.note)}</div>` : ''}
                        <div class="gw-card-meta">
                            <span><i data-lucide="user"></i> ${esc(it.username || '—')}</span>
                            <span><i data-lucide="clock"></i> ${esc(fmtTime(it.createdAt))}</span>
                        </div>
                    </div>
                    ${
                        admin
                            ? `<button class="gw-del" data-del="${esc(it.id)}" title="Xoá"><i data-lucide="trash-2"></i></button>`
                            : ''
                    }
                </div>`;
            })
            .join('');
        $('#gwList')
            .querySelectorAll('[data-img]')
            .forEach((im) =>
                im.addEventListener('click', () => {
                    try {
                        if (window.Web2ImageLightbox?.open)
                            Web2ImageLightbox.open([im.dataset.img], 0);
                        else window.open(im.dataset.img, '_blank');
                    } catch (_) {
                        window.open(im.dataset.img, '_blank');
                    }
                })
            );
        $('#gwList')
            .querySelectorAll('[data-del]')
            .forEach((b) => b.addEventListener('click', () => del(b.dataset.del)));
        icons($('#gwList'));
    }
    async function del(id) {
        if (!isAdmin()) return toast('Chỉ admin được xoá', 'err');
        const ok = window.Popup?.confirm
            ? await window.Popup.confirm('Xoá bản ghi cân này?')
            : confirm('Xoá bản ghi cân này?');
        if (!ok) return;
        try {
            await api('/' + encodeURIComponent(id), { method: 'DELETE' });
            toast('✓ Đã xoá', 'ok');
            load();
        } catch (e) {
            toast('Lỗi: ' + e.message, 'err');
        }
    }

    // ---- clock (GMT+7 live) ----
    function tickClock() {
        const el = $('#gwClock')?.querySelector('b');
        if (el) el.textContent = FMT.format(new Date());
    }

    // ---- SSE realtime (đa máy/đa tab tự cập nhật) ----
    let sseDebounce = null;
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        Web2SSE.subscribe('web2:goods-weight', () => {
            clearTimeout(sseDebounce);
            sseDebounce = setTimeout(load, 500);
        });
    }

    function boot() {
        // Mobile-native (học unit-scan): KHÔNG mount desktop sidebar — header riêng.
        $('#gwUserName').textContent = username() || '—';
        $('#gwPhotoBtn').addEventListener('click', () => $('#gwPhoto').click());
        $('#gwPhoto').addEventListener('change', onPhoto);
        $('#gwPreviewX').addEventListener('click', clearPhoto);
        $('#gwSave').addEventListener('click', save);
        $('#gwRefresh').addEventListener('click', load);
        tickClock();
        setInterval(tickClock, 1000 * 30);
        icons();
        load();
        setupSSE();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
