// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài FB: media picker (URL / upload imgbb / Kho SP).
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    let _media = []; // [{type:'photo'|'video', url}]
    let _gridEl = null;

    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }

    function getMedia() {
        return _media.slice();
    }
    function setMedia(arr) {
        _media = Array.isArray(arr) ? arr.slice() : [];
        render();
    }
    function clear() {
        _media = [];
        render();
    }
    function add(item) {
        if (!item || !item.url) return;
        if (_media.some((m) => m.url === item.url)) return;
        _media.push({ type: item.type || 'photo', url: item.url });
        render();
    }
    function removeAt(i) {
        _media.splice(i, 1);
        render();
    }

    function render() {
        if (!_gridEl) return;
        if (!_media.length) {
            _gridEl.innerHTML =
                '<div style="grid-column:1/-1;color:#94a3b8;font-size:.85rem">Chưa có ảnh/video. Thêm từ Kho SP, tải lên, hoặc dán URL.</div>';
            return;
        }
        _gridEl.innerHTML = _media
            .map(
                (m, i) => `
            <div class="fbp-media-item">
                ${
                    m.type === 'video'
                        ? `<video src="${esc(m.url)}" muted></video><span class="fbp-media-badge">VIDEO</span>`
                        : `<img src="${esc(m.url)}" alt="" loading="lazy" />`
                }
                <button class="fbp-media-x" data-i="${i}" title="Xoá">&times;</button>
            </div>`
            )
            .join('');
        _gridEl.querySelectorAll('.fbp-media-x').forEach((b) => {
            b.addEventListener('click', () => removeAt(Number(b.dataset.i)));
        });
    }

    // Tải nhiều ảnh local → imgbb → thêm vào media.
    async function handleFiles(fileList) {
        const files = Array.from(fileList || []);
        for (const f of files) {
            if (f.type.startsWith('video/')) {
                notify(
                    'Video local chưa hỗ trợ — dùng URL video (mp4). Ảnh thì tải lên OK.',
                    'warning'
                );
                continue;
            }
            try {
                notify(`Đang tải ${f.name}…`, 'info');
                const url = await Api().uploadImage(f);
                add({ type: 'photo', url });
            } catch (e) {
                notify(`Lỗi tải ${f.name}: ${e.message}`, 'error');
            }
        }
    }

    function promptUrl() {
        const url = window.prompt('Dán URL ảnh hoặc video (mp4):');
        if (!url || !/^https?:\/\//.test(url.trim())) {
            if (url) notify('URL không hợp lệ', 'warning');
            return;
        }
        const u = url.trim();
        const type = /\.(mp4|mov|webm)(\?|$)/i.test(u) ? 'video' : 'photo';
        if (type === 'video')
            notify(
                'Lưu ý: video có nhạc bản quyền có thể bị FB tắt tiếng/chặn ở một số nơi.',
                'warning'
            );
        add({ type, url: u });
    }

    // ── Picker từ Kho SP (Web2ProductsCache) ──────────────────────────────
    async function openProductPicker() {
        if (!window.Web2ProductsCache) {
            notify('Kho SP chưa sẵn sàng', 'warning');
            return;
        }
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;max-width:680px;width:100%;max-height:82vh;display:flex;flex-direction:column;overflow:hidden">
                <div style="padding:14px 16px;border-bottom:1px solid #eef2f7;display:flex;gap:10px;align-items:center">
                    <strong style="flex:1">Chọn ảnh từ Kho SP</strong>
                    <button id="fbpPpClose" class="fbp-btn ghost sm">Đóng</button>
                </div>
                <div style="padding:12px 16px"><input id="fbpPpSearch" class="fbp-input" placeholder="Tìm theo tên / mã SP…" /></div>
                <div id="fbpPpList" style="flex:1;overflow:auto;padding:0 16px 16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px"></div>
            </div>`;
        document.body.appendChild(overlay);
        const listEl = overlay.querySelector('#fbpPpList');
        overlay.querySelector('#fbpPpClose').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        try {
            await window.Web2ProductsCache.init();
        } catch (_) {}

        const imgOf = (p) =>
            p.image_url || p.imageUrl || (Array.isArray(p.images) && p.images[0]) || '';
        const draw = (q) => {
            let items = window.Web2ProductsCache.getAll() || [];
            if (q && q.trim()) {
                items = window.Web2ProductsCache.findByName
                    ? window.Web2ProductsCache.findByName(q, 60)
                    : items.filter((p) =>
                          `${p.name || ''} ${p.code || ''}`.toLowerCase().includes(q.toLowerCase())
                      );
            }
            items = items.filter(imgOf).slice(0, 60);
            if (!items.length) {
                listEl.innerHTML =
                    '<div style="grid-column:1/-1;color:#94a3b8;text-align:center;padding:20px">Không có SP có ảnh</div>';
                return;
            }
            listEl.innerHTML = items
                .map(
                    (p) =>
                        `<div class="fbp-media-item" style="cursor:pointer" data-url="${esc(imgOf(p))}" title="${esc(p.name || p.code || '')}">
                            <img src="${esc(imgOf(p))}" loading="lazy" alt="" />
                        </div>`
                )
                .join('');
            listEl.querySelectorAll('[data-url]').forEach((el) => {
                el.addEventListener('click', () => {
                    add({ type: 'photo', url: el.dataset.url });
                    notify('Đã thêm ảnh', 'success');
                });
            });
        };
        draw('');
        let t;
        overlay.querySelector('#fbpPpSearch').addEventListener('input', (e) => {
            clearTimeout(t);
            t = setTimeout(() => draw(e.target.value), 250);
        });
    }

    function mountGrid(gridEl, fileInput, btns) {
        _gridEl = gridEl;
        render();
        if (fileInput)
            fileInput.addEventListener('change', (e) => {
                handleFiles(e.target.files);
                e.target.value = '';
            });
        if (btns) {
            btns.url && btns.url.addEventListener('click', promptUrl);
            btns.product && btns.product.addEventListener('click', openProductPicker);
            btns.upload &&
                fileInput &&
                btns.upload.addEventListener('click', () => fileInput.click());
        }
    }

    window.FBPostsMedia = { mountGrid, getMedia, setMedia, clear, add, openProductPicker };
})();
