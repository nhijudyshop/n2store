// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2CanvasUtils — 1 NGUỒN tiện ích canvas/ảnh thuần cho Web 2.0.
//
// Lý do (dedup, 2026-06-19): imgToCanvas / canvasToBlob / loadImage /
// fileToImage / blobToImage rải ở photo-studio-canvas.js, các trang upload
// ảnh (purchase-orders, products-print, aikol). Gom Promise-based helpers
// chuyển đổi ảnh↔canvas↔blob↔dataURL để mọi trang tái dùng.
//
// KHÔNG auto-load (feature-specific) — trang cần ảnh load file này tường minh.
//
// API:
//   Web2CanvasUtils.sizeCanvas(canvas, w, h)              → canvas (đặt kích thước)
//   Web2CanvasUtils.canvasToBlob(canvas, type, quality)  → Promise<Blob>
//   Web2CanvasUtils.imgToCanvas(img, maxW, maxH)         → canvas (giữ tỉ lệ)
//   Web2CanvasUtils.blobToBase64(blob)                   → Promise<dataURL>
//   Web2CanvasUtils.base64ToBlob(dataUrl)                → Blob
//   Web2CanvasUtils.fileToDataUrl(file)                  → Promise<dataURL>
//   Web2CanvasUtils.loadImage(src)                       → Promise<HTMLImageElement>
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2CanvasUtils) return;

    function sizeCanvas(canvas, w, h) {
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        return canvas;
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(function (resolve, reject) {
            try {
                canvas.toBlob(
                    function (blob) {
                        if (blob) resolve(blob);
                        else reject(new Error('canvas.toBlob trả null'));
                    },
                    type || 'image/png',
                    quality
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    // Vẽ ảnh vào canvas mới, scale-down để vừa maxW×maxH (giữ tỉ lệ). Không
    // truyền maxW/maxH → dùng kích thước gốc. Revoke blob: URL của img nếu có.
    function imgToCanvas(img, maxW, maxH) {
        var iw = img.naturalWidth || img.width || 1;
        var ih = img.naturalHeight || img.height || 1;
        var w = iw;
        var h = ih;
        if (maxW || maxH) {
            var scale = Math.min(maxW ? maxW / iw : 1, maxH ? maxH / ih : 1, 1);
            w = Math.round(iw * scale);
            h = Math.round(ih * scale);
        }
        var cv = document.createElement('canvas');
        sizeCanvas(cv, w, h);
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        if (img.src && String(img.src).startsWith('blob:')) {
            try {
                URL.revokeObjectURL(img.src);
            } catch {}
        }
        return cv;
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () {
                resolve(fr.result);
            };
            fr.onerror = function () {
                reject(fr.error || new Error('FileReader lỗi'));
            };
            fr.readAsDataURL(blob);
        });
    }

    // Parse data URL "data:<mime>;base64,<data>" → Blob.
    function base64ToBlob(dataUrl) {
        var s = String(dataUrl || '');
        var m = s.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
        if (!m) throw new Error('dataURL không hợp lệ');
        var mime = m[1] || 'application/octet-stream';
        var isB64 = !!m[2];
        var data = m[3] || '';
        var bytes;
        if (isB64) {
            var binary = atob(data);
            bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } else {
            var decoded = decodeURIComponent(data);
            bytes = new Uint8Array(decoded.length);
            for (var j = 0; j < decoded.length; j++) bytes[j] = decoded.charCodeAt(j);
        }
        return new Blob([bytes], { type: mime });
    }

    function fileToDataUrl(file) {
        return blobToBase64(file);
    }

    // Load ảnh từ src (URL / blob: / data:). crossOrigin anonymous để canvas
    // không bị "tainted" khi export blob (ảnh remote cùng CORS allow).
    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            if (!String(src || '').startsWith('data:')) {
                try {
                    img.crossOrigin = 'anonymous';
                } catch {}
            }
            img.onload = function () {
                resolve(img);
            };
            img.onerror = function () {
                reject(new Error('Không tải được ảnh: ' + String(src).slice(0, 80)));
            };
            img.src = src;
        });
    }

    global.Web2CanvasUtils = {
        sizeCanvas: sizeCanvas,
        canvasToBlob: canvasToBlob,
        imgToCanvas: imgToCanvas,
        blobToBase64: blobToBase64,
        base64ToBlob: base64ToBlob,
        fileToDataUrl: fileToDataUrl,
        loadImage: loadImage,
    };
})(typeof window !== 'undefined' ? window : globalThis);
