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

    function ensureStyles() {
        if (document.getElementById('w2ie-css')) return;
        const s = document.createElement('style');
        s.id = 'w2ie-css';
        s.textContent = `
.w2ie-back{position:fixed;inset:0;z-index:100001;background:#0b1220;display:flex}
.w2ie-host{flex:1;min-width:0;min-height:0}
.w2ie-host .SfxModal-Wrapper,.w2ie-host>div{height:100%}
`;
        document.head.appendChild(s);
    }

    global.Web2ImageEditor = { open, _load };
})(window);
