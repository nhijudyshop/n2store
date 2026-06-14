// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 shared.
/**
 * LiveStatus — chuẩn hoá "trạng thái KH" lấy từ KHO web2_customers (cột status)
 * → nhãn tiếng Việt + key màu. Dùng chung live-chat desktop + comments-mobile.
 *
 * web2_customers.status mặc định import = "Normal" → hiển thị "Bình thường".
 * KH được gắn cờ có thể là "Bom hàng"/"VIP"/"Thân thiết"/"Khách sỉ"/… → giữ
 * đúng nhãn. Giá trị lạ → hiển thị nguyên văn (không nuốt thông tin).
 */
(function (global) {
    'use strict';
    if (global.LiveStatus) return;

    function normalize(raw) {
        var s = String(raw == null ? '' : raw)
            .trim()
            .toLowerCase();
        if (!s || s === 'normal' || s === 'bình thường' || s === 'binh thuong')
            return { label: 'Bình thường', key: 'normal' };
        if (s.indexOf('bom') >= 0) return { label: 'Bom hàng', key: 'bom' };
        if (s.indexOf('vip') >= 0) return { label: 'VIP', key: 'vip' };
        if (s.indexOf('thân') >= 0 || s.indexOf('than') >= 0 || s.indexOf('thiết') >= 0)
            return { label: 'Thân thiết', key: 'than' };
        if (s.indexOf('sỉ') >= 0 || s === 'si' || s.indexOf('wholesale') >= 0)
            return { label: 'Khách sỉ', key: 'si' };
        if (s.indexOf('nguy') >= 0 || s.indexOf('danger') >= 0)
            return { label: 'Nguy hiểm', key: 'danger' };
        if (s.indexOf('cảnh') >= 0 || s.indexOf('canh') >= 0 || s.indexOf('warn') >= 0)
            return { label: 'Cảnh báo', key: 'warn' };
        return { label: String(raw).trim(), key: 'other' }; // giữ nguyên giá trị lạ
    }

    global.LiveStatus = { normalize: normalize };
})(typeof window !== 'undefined' ? window : this);
