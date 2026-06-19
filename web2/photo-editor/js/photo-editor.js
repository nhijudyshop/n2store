// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Editor — launcher cho các module chỉnh ảnh DÙNG CHUNG Web 2.0:
 *   - Web2BeautyStudio  : làm đẹp nhanh kiểu Meitu (mịn da, mắt to, mũi thon,
 *                         mặt V-line, môi, kéo chân, màu da) — nhận diện mặt on-device.
 *   - Web2LogoEraser    : xoá logo/watermark vùng chọn.
 *   - Web2ImageEditor   : chỉnh nâng cao (Photopea Photoshop-grade / Filerobot cơ bản).
 *
 * Luồng: chọn ảnh (tải máy / dán / kho SP) → hiện ảnh nguồn + thanh công cụ →
 * bấm 1 công cụ → mở studio → nhận ảnh đã chỉnh → đặt LẠI làm ảnh nguồn (chỉnh
 * chồng) + hiện kết quả (Tải PNG / Copy / Chỉnh tiếp). Toàn bộ chạy trên máy.
 */
(function (global) {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const notify = (m, t) => global.notificationManager?.show?.(m, t || 'info');
    let _src = null; // ảnh nguồn hiện tại (dataURL/URL)
    let _name = 'anh';
    let _result = null;
    let _warmStarted = false; // chỉ preload model 1 lần

    function esc(s) {
        if (global.Web2Escape?.escapeHtml) return global.Web2Escape.escapeHtml(s);
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    // Đặt ảnh nguồn hiện tại → hiện preview + thanh công cụ làm đẹp.
    function setSource(src, name) {
        if (!src) return;
        _src = src;
        if (name) _name = name;
        // PRELOAD model nhận diện mặt ở nền NGAY khi có ảnh — để lúc bấm công cụ
        // làm đẹp mặt thì model đã sẵn sàng (ẩn độ trễ tải ~13MB engine MediaPipe).
        if (!_warmStarted && global.Web2BeautyFace?.warmup) {
            _warmStarted = true;
            global.Web2BeautyFace.warmup().catch(() => {});
        }
        const img = $('#peSourceImg');
        if (img) img.src = src;
        $('#peSource').hidden = false;
        const meta = $('#peSourceMeta');
        if (meta) {
            const probe = new Image();
            probe.onload = () =>
                (meta.textContent = `${probe.naturalWidth}×${probe.naturalHeight}`);
            probe.src = src;
        }
    }

    function showResult(dataUrl) {
        _result = dataUrl;
        $('#peResultImg').src = dataUrl;
        $('#peResult').hidden = false;
        $('#peResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Chạy 1 công cụ làm đẹp / xoá logo / chỉnh nâng cao trên ảnh nguồn.
    async function runTool(tool) {
        if (!_src) return notify('Hãy tải ảnh trước', 'warning');
        let out = null;
        try {
            if (tool === 'erase') {
                if (!global.Web2LogoEraser?.open)
                    return notify('Chưa tải được công cụ xoá logo', 'error');
                out = await global.Web2LogoEraser.open(_src);
            } else if (tool === 'advanced') {
                if (!global.Web2ImageEditor?.open)
                    return notify('Chưa tải được trình chỉnh sửa', 'error');
                const engine = $('#peAdv')?.checked ? 'photopea' : undefined;
                out = await global.Web2ImageEditor.open(_src, { name: _name, engine });
            } else {
                if (!global.Web2BeautyStudio?.open)
                    return notify('Chưa tải được Studio làm đẹp', 'error');
                out = await global.Web2BeautyStudio.open(_src, { tool, name: _name });
            }
        } catch (e) {
            console.error('[photo-editor] runTool', tool, e);
            return notify('Lỗi mở công cụ: ' + (e.message || e), 'error');
        }
        if (out) {
            setSource(out, _name); // chỉnh chồng tiếp được
            showResult(out);
            notify('Đã áp dụng — có thể bấm tiếp công cụ khác', 'success');
        }
    }

    function download() {
        if (!_result) return;
        const a = document.createElement('a');
        a.download = `anh-chinh-sua-${Date.now()}.png`;
        a.href = _result;
        a.click();
    }
    async function copy() {
        try {
            const blob = await (await fetch(_result)).blob();
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            notify('Đã copy ảnh', 'success');
        } catch {
            notify('Trình duyệt không hỗ trợ copy — dùng Tải PNG', 'warning');
        }
    }

    // ---- product picker (kho SP) ----
    let _t = null;
    function wirePicker() {
        const input = $('#peProdSearch');
        const drop = $('#peProdDrop');
        const close = () => {
            drop.hidden = true;
            drop.innerHTML = '';
        };
        input.addEventListener('input', () => {
            clearTimeout(_t);
            const q = input.value.trim();
            if (!q) return close();
            _t = setTimeout(() => {
                const rows = global.Web2ProductsCache?.findByName?.(q, 8) || [];
                if (!rows.length) {
                    drop.innerHTML = '<div class="pe-drop-empty">Không thấy SP có ảnh</div>';
                    drop.hidden = false;
                    return;
                }
                drop.innerHTML = rows
                    .map(
                        (p, i) =>
                            `<button type="button" class="pe-drop-row" data-i="${i}"><span>${esc(p.name || '')}</span><span class="pe-drop-code">${esc(p.code || '')}</span></button>`
                    )
                    .join('');
                drop.hidden = false;
                drop.querySelectorAll('.pe-drop-row').forEach((b) =>
                    b.addEventListener('click', () => {
                        const p = rows[Number(b.dataset.i)];
                        close();
                        input.value = p.name || '';
                        if (p.imageUrl) setSource(p.imageUrl, p.name);
                        else notify('SP này chưa có ảnh', 'warning');
                    })
                );
            }, 200);
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#peProdSearch') && !e.target.closest('#peProdDrop')) close();
        });
    }

    function fileToDataUrl(f) {
        return new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(f);
        });
    }

    function init() {
        $('#peUpload')?.addEventListener('change', async (e) => {
            const f = e.target.files?.[0];
            if (f) setSource(await fileToDataUrl(f), f.name);
            e.target.value = '';
        });
        global.addEventListener('paste', async (e) => {
            const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            if (it) setSource(await fileToDataUrl(it.getAsFile()), 'paste');
        });
        $('#peToolsGrid')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-tool]');
            if (b) runTool(b.dataset.tool);
        });
        $('#peEditAgain')?.addEventListener('click', () => runTool('advanced'));
        $('#peDownload')?.addEventListener('click', download);
        $('#peCopy')?.addEventListener('click', copy);
        wirePicker();
        global.Web2ProductsCache?.init?.().catch(() => {});
    }

    global.PhotoEditorPage = { init, edit: setSource };
})(window);
