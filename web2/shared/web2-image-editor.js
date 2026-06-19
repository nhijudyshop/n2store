// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================================
// Web2ImageEditor — TRÌNH CHỈNH SỬA ẢNH đầy đủ (Picsart-lite) DÙNG CHUNG mọi trang.
// Bọc Filerobot Image Editor (MIT, scaleflex) — vanilla, on-device (xử lý trong
// trình duyệt, không upload server). Lazy-load CDN khi mở lần đầu.
//
//   const dataUrl = await Web2ImageEditor.open(src, { name });
//     src     : dataURL | blobURL | URL | HTMLImageElement
//     return  : dataURL PNG ảnh đã chỉnh (bấm Lưu) | null (đóng/huỷ)
//
// Tabs: Cắt/xoay (Adjust) · Tinh chỉnh sáng-màu (Finetune) · Bộ lọc (Filters) ·
//       Chèn chữ/hình/vẽ (Annotate) · Watermark · Resize.
// Trang nào cần chỉnh ảnh → load file này rồi gọi Web2ImageEditor.open — ĐỪNG
// nhúng Filerobot riêng từng trang (1 nguồn dùng chung).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ImageEditor) return;

    const CDN = [
        'https://cdn.jsdelivr.net/npm/filerobot-image-editor@4/dist/filerobot-image-editor.min.js',
        'https://scaleflex.cloudimg.io/v7/plugins/filerobot-image-editor/latest/filerobot-image-editor.min.js',
    ];
    let _loadP = null;
    function _load() {
        if (global.FilerobotImageEditor) return Promise.resolve();
        if (_loadP) return _loadP;
        _loadP = new Promise((res, rej) => {
            let i = 0;
            const tryNext = () => {
                if (i >= CDN.length) {
                    _loadP = null;
                    return rej(new Error('Không tải được trình chỉnh sửa ảnh (CDN)'));
                }
                const s = document.createElement('script');
                s.src = CDN[i++];
                s.async = true;
                s.onload = () => (global.FilerobotImageEditor ? res() : tryNext());
                s.onerror = tryNext;
                document.head.appendChild(s);
            };
            tryNext();
        });
        return _loadP;
    }

    // Bản dịch nhãn tab/nút sang tiếng Việt (Filerobot nhận `translations`).
    const VI = {
        save: 'Lưu',
        cancel: 'Huỷ',
        apply: 'Áp dụng',
        download: 'Tải về',
        reset: 'Đặt lại',
        adjustTab: 'Cắt & Xoay',
        finetuneTab: 'Tinh chỉnh',
        filtersTab: 'Bộ lọc',
        watermarkTab: 'Watermark',
        annotateTab: 'Chèn',
        resizeTab: 'Kích thước',
        textTool: 'Chữ',
        rectangleTool: 'Khung',
        ellipseTool: 'Elip',
        penTool: 'Vẽ',
        lineTool: 'Đường',
        arrowTool: 'Mũi tên',
        cropTool: 'Cắt',
        rotateTool: 'Xoay',
        brightnessTool: 'Độ sáng',
        contrastTool: 'Tương phản',
        warmthTool: 'Tông ấm',
        blurTool: 'Làm mờ',
        saturationTool: 'Bão hoà',
    };

    async function open(src, opts = {}) {
        if (!src) return null;
        // Chế độ nâng cao = Photopea (ngang Photoshop, nhúng iframe, không cần login).
        if (opts.engine === 'photopea') return _openPhotopea(src);
        await _load();
        const FIE = global.FilerobotImageEditor;
        const TABS = FIE.TABS || {};
        const TOOLS = FIE.TOOLS || {};
        ensureStyles();
        return new Promise((resolve) => {
            const back = document.createElement('div');
            back.className = 'w2ie-back';
            const host = document.createElement('div');
            host.className = 'w2ie-host';
            back.appendChild(host);
            document.body.appendChild(back);

            let editor = null;
            let done = false;
            const cleanup = () => {
                try {
                    editor?.terminate?.();
                } catch {}
                back.remove();
            };
            const finish = (val) => {
                if (done) return;
                done = true;
                // defer để không terminate giữa callback của Filerobot
                setTimeout(() => {
                    cleanup();
                    resolve(val);
                }, 0);
            };

            const config = {
                source: src,
                defaultSavedImageName: (opts.name || 'anh-da-chinh').slice(0, 60),
                defaultSavedImageType: 'png',
                useBackendTranslations: false,
                language: 'vi',
                translations: VI,
                tabsIds: [
                    TABS.ADJUST,
                    TABS.FINETUNE,
                    TABS.FILTERS,
                    TABS.ANNOTATE,
                    TABS.WATERMARK,
                    TABS.RESIZE,
                ].filter((t) => t != null),
                defaultTabId: TABS.ADJUST,
                defaultToolId: TOOLS.CROP,
                savingPixelRatio: 1,
                previewPixelRatio: 1,
                // Lưu → lấy base64, đóng editor, resolve. KHÔNG tự tải file (caller quyết).
                onSave: (edited) => finish(edited?.imageBase64 || null),
                onClose: () => finish(null),
            };
            try {
                editor = new FIE(host, config);
                editor.render({ onClose: () => finish(null) });
            } catch (e) {
                console.error('[Web2ImageEditor] init lỗi:', e);
                cleanup();
                resolve(null);
            }
        });
    }

    // ---- Chế độ NÂNG CAO: Photopea (Photoshop-grade) qua iframe + postMessage API ----
    // Nhúng hợp lệ (Photopea có API công khai). Không login, xử lý client-side trong
    // iframe; chỉ tải ảnh vào + lấy ảnh ra qua postMessage (không upload server mình).
    function _openPhotopea(src) {
        return new Promise((resolve) => {
            ensureStyles();
            const back = document.createElement('div');
            back.className = 'w2ie-back w2ie-pp';
            const bar = document.createElement('div');
            bar.className = 'w2ie-ppbar';
            bar.innerHTML =
                '<b><i data-lucide="wand-2"></i> Chỉnh sửa nâng cao — Photopea</b>' +
                '<span style="flex:1"></span>' +
                '<button class="w2ie-ppbtn primary" data-pp="save">Lấy ảnh về</button>' +
                '<button class="w2ie-ppbtn" data-pp="close">Đóng</button>';
            const frame = document.createElement('iframe');
            frame.className = 'w2ie-ppframe';
            frame.allow = 'clipboard-read; clipboard-write';
            const cfg = { environment: { lang: 'vi' } };
            frame.src = 'https://www.photopea.com#' + encodeURIComponent(JSON.stringify(cfg));
            back.appendChild(bar);
            back.appendChild(frame);
            document.body.appendChild(back);
            global.lucide?.createIcons?.();

            let ready = false;
            let opened = false;
            let done = false;
            const finish = (val) => {
                if (done) return;
                done = true;
                global.removeEventListener('message', onMsg);
                back.remove();
                resolve(val);
            };
            const onMsg = (e) => {
                if (e.source !== frame.contentWindow) return;
                const d = e.data;
                // ArrayBuffer = kết quả saveToOE("png") → ảnh đã chỉnh.
                if (d instanceof ArrayBuffer) {
                    const blob = new Blob([d], { type: 'image/png' });
                    const fr = new FileReader();
                    fr.onload = () => finish(fr.result);
                    fr.onerror = () => finish(null);
                    fr.readAsDataURL(blob);
                    return;
                }
                // String đầu tiên = Photopea sẵn sàng → mở ảnh vào.
                if (typeof d === 'string' && !ready) {
                    ready = true;
                    if (!opened) {
                        opened = true;
                        try {
                            frame.contentWindow.postMessage(
                                'app.open(' + JSON.stringify(src) + ', null, false);',
                                '*'
                            );
                        } catch {}
                    }
                }
            };
            global.addEventListener('message', onMsg);
            bar.addEventListener('click', (e) => {
                const a = e.target.closest('[data-pp]')?.dataset.pp;
                if (a === 'close') finish(null);
                else if (a === 'save') {
                    try {
                        frame.contentWindow.postMessage('app.activeDocument.saveToOE("png");', '*');
                    } catch {
                        finish(null);
                    }
                }
            });
        });
    }

    function ensureStyles() {
        if (document.getElementById('w2ie-css')) return;
        const s = document.createElement('style');
        s.id = 'w2ie-css';
        s.textContent = `
.w2ie-back{position:fixed;inset:0;z-index:100001;background:#0b1220;display:flex}
.w2ie-host{flex:1;min-width:0;min-height:0}
.w2ie-host .SfxModal-Wrapper,.w2ie-host>div{height:100%}
.w2ie-pp{flex-direction:column}
.w2ie-ppbar{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#111827;color:#fff;font-size:14px}
.w2ie-ppbar i{width:17px;height:17px;vertical-align:-3px}
.w2ie-ppframe{flex:1;width:100%;border:0;min-height:0}
.w2ie-ppbtn{padding:8px 14px;border:1px solid #334155;background:#1f2937;color:#fff;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer}
.w2ie-ppbtn.primary{background:#0068ff;border-color:#0068ff}
.w2ie-ppbtn:hover{filter:brightness(1.08)}
`;
        document.head.appendChild(s);
    }

    global.Web2ImageEditor = { open, _load };
})(window);
