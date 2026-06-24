// #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — Web Worker xử lý lọc làm đẹp NỀN (không đứng UI).
/**
 * Chạy các lọc làm đẹp NẶNG (smoothSkin / adjustSkinTone / beautify / warp) trên
 * LUỒNG NỀN → main-thread KHÔNG bị "đứng/stuck", spinner mượt. Pixel buffer chuyển
 * bằng Transferable (ArrayBuffer) → không copy, nhanh.
 *
 * Web Worker = built-in trình duyệt, MIỄN PHÍ, không thư viện/dịch vụ.
 * Nhận: { id, op, buf, w, h, params }  → trả: { id, ok, buf, w, h } (buf transfer lại)
 * op: smooth | tone | beautify | warp | auto   (legs/stretch giữ ở main vì dùng canvas)
 */
/* global importScripts, Web2BeautyFilters, ImageData */
self.importScripts('./web2-beauty-filters.js');
const F = self.Web2BeautyFilters;

self.onmessage = (e) => {
    const { id, op, buf, w, h, params } = e.data || {};
    try {
        if (!F) throw new Error('thiếu Web2BeautyFilters trong worker');
        let imageData = new ImageData(new Uint8ClampedArray(buf), w, h);
        const p = params || {};
        if (op === 'smooth') {
            const m = F.buildSkinMask(imageData);
            F.smoothSkin(imageData, m, p);
        } else if (op === 'tone') {
            const m = F.buildSkinMask(imageData);
            F.adjustSkinTone(imageData, m, p);
        } else if (op === 'beautify') {
            F.beautify(imageData, p.strength);
        } else if (op === 'warp') {
            imageData = F.warp(imageData, p.brushes || []);
        } else if (op === 'auto') {
            F.beautify(imageData, p.strength);
            if (p.brushes && p.brushes.length) imageData = F.warp(imageData, p.brushes);
        } else {
            throw new Error('op không hỗ trợ: ' + op);
        }
        const outBuf = imageData.data.buffer;
        self.postMessage({ id, ok: true, buf: outBuf, w: imageData.width, h: imageData.height }, [
            outBuf,
        ]);
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};
