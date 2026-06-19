// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoSceneEditor — UI CHỈNH CHI TIẾT từng cảnh của video-maker:
 * chuyển động (Ken Burns), hiệu ứng vào, bộ lọc màu, vị trí chữ, khung hình + màu nền.
 * Tách riêng để video-maker gọn. Render-only engine ở Web2VideoRender.
 *
 *   Web2VideoSceneEditor.applyDefaults(scene)   → điền field mặc định còn thiếu
 *   Web2VideoSceneEditor.detailHtml(scene, esc) → HTML khối "chi tiết" của 1 cảnh
 *   Web2VideoSceneEditor.OPTIONS                → { motion, transition, filter, textPos, fit }
 */
(function (global) {
    'use strict';

    const R = global.Web2VideoRender || {};
    const OPTIONS = {
        transition: R.TRANSITIONS || [{ id: 'fade', label: 'Mờ dần' }],
        motion: R.MOTIONS || [{ id: 'zoomin', label: 'Phóng to' }],
        filter: R.FILTERS || [{ id: 'none', label: 'Gốc' }],
        textPos: R.TEXT_POS || [{ id: 'bottom', label: 'Dưới' }],
        fit: R.FITS || [{ id: 'cover', label: 'Lấp đầy' }],
    };
    const DEFAULTS = {
        transition: 'fade',
        motion: 'zoomin',
        filter: 'none',
        textPos: 'bottom',
        fit: 'cover',
        bg: '#000000',
    };

    function applyDefaults(scene) {
        for (const k in DEFAULTS) if (scene[k] == null) scene[k] = DEFAULTS[k];
        return scene;
    }

    function _sel(label, key, value, esc) {
        const opts = OPTIONS[key]
            .map(
                (o) =>
                    `<option value="${o.id}"${o.id === value ? ' selected' : ''}>${esc(o.label)}</option>`
            )
            .join('');
        return (
            `<label class="vm-d"><span>${esc(label)}</span>` +
            `<select class="vm-dsel" data-k="${key}">${opts}</select></label>`
        );
    }

    function detailHtml(scene, esc) {
        applyDefaults(scene);
        return (
            `<div class="vm-scene-detail">` +
            _sel('Hiệu ứng vào', 'transition', scene.transition, esc) +
            _sel('Chuyển động', 'motion', scene.motion, esc) +
            _sel('Bộ lọc', 'filter', scene.filter, esc) +
            _sel('Vị trí chữ', 'textPos', scene.textPos, esc) +
            _sel('Khung hình', 'fit', scene.fit, esc) +
            `<label class="vm-d vm-d-bg"><span>Màu nền</span>` +
            `<input type="color" class="vm-dcolor" data-k="bg" value="${esc(scene.bg || '#000000')}"></label>` +
            `</div>`
        );
    }

    global.Web2VideoSceneEditor = { applyDefaults, detailHtml, OPTIONS, DEFAULTS };
})(window);
