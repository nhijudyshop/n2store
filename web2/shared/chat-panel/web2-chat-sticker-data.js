// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).
// =====================================================================
// Web2ChatStickers — danh sách sticker FB gửi được qua N2 Extension
// (REPLY_INBOX_PHOTO attachmentType=STICKER + sticker_id). KHÔNG cần GET_STICKERS
// (đang stub) — dùng các sticker_id FB CLASSIC ổn định. Picker hiển thị emoji đại
// diện + nhãn (không phụ thuộc URL ảnh sticker), KH nhận sticker FB thật.
//   Web2ChatStickers.list() -> [{ id, label, emoji }]
//
// ⚠ sticker_id phải là asset id FB hợp lệ. Bộ "Like" cổ điển (👍) ổn định nhiều năm.
//   Thêm sticker mới: lấy sticker_id từ DevTools Network khi gửi sticker trong FB
//   Business Suite (messaging/send/ → form field sticker_id).
// =====================================================================
(function (global) {
    const STICKERS = [
        { id: '369239263222822', label: 'Like', emoji: '👍' },
        { id: '369239343222814', label: 'Like to', emoji: '👍' },
        { id: '369239383222810', label: 'Like bự', emoji: '👍' },
    ];

    global.Web2ChatStickers = {
        list() {
            // Cho phép override/mở rộng qua localStorage (admin dán thêm sticker_id).
            try {
                const extra = JSON.parse(
                    localStorage.getItem('web2_chat_stickers_extra') || 'null'
                );
                if (Array.isArray(extra) && extra.length) return STICKERS.concat(extra);
            } catch (_) {}
            return STICKERS.slice();
        },
    };
})(window);
