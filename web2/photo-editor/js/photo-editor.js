// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Editor — trang launcher cho module dùng chung Web2ImageEditor (Filerobot).
 * Chọn ảnh (tải máy / dán / kho SP) → mở trình chỉnh sửa → nhận ảnh đã chỉnh →
 * xem trước + Tải PNG / Copy / Chỉnh tiếp. Logic editor nằm ở shared module.
 */
(function (global) {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const notify = (m, t) => global.notificationManager?.show?.(m, t || 'info');
    let _lastSrc = null;
    let _result = null;

    function esc(s) {
        if (global.Web2Escape?.escapeHtml) return global.Web2Escape.escapeHtml(s);
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    async function edit(src, name) {
        if (!src) return;
        _lastSrc = src;
        if (!global.Web2ImageEditor?.open) return notify('Chưa tải được trình chỉnh sửa', 'error');
        try {
            const out = await global.Web2ImageEditor.open(src, { name: name || 'anh' });
            if (out) showResult(out);
        } catch (e) {
            console.error('[photo-editor]', e);
            notify('Lỗi mở trình chỉnh sửa: ' + (e.message || e), 'error');
        }
    }

    function showResult(dataUrl) {
        _result = dataUrl;
        $('#peResultImg').src = dataUrl;
        $('#peResult').hidden = false;
        $('#peResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        notify('Đã lưu ảnh chỉnh sửa', 'success');
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
                        if (p.imageUrl) edit(p.imageUrl, p.name);
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
            if (f) edit(await fileToDataUrl(f), f.name);
            e.target.value = '';
        });
        global.addEventListener('paste', async (e) => {
            const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            if (it) edit(await fileToDataUrl(it.getAsFile()), 'paste');
        });
        $('#peEditAgain')?.addEventListener('click', () => edit(_result || _lastSrc, 'anh'));
        $('#peDownload')?.addEventListener('click', download);
        $('#peCopy')?.addEventListener('click', copy);
        wirePicker();
        global.Web2ProductsCache?.init?.().catch(() => {});
    }

    global.PhotoEditorPage = { init, edit };
})(window);
