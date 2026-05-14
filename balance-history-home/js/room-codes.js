// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ROOM CODES - Placeholder
// Danh sách mã phòng cho dropdown trong bảng giao dịch.
// User sẽ bổ sung sau bằng cách thêm vào mảng ROOM_CODES.
// Sau này nếu cần CRUD, refactor sang fetch từ backend — chỉ touch file này.
// =====================================================

// Format: { code: 'P001', name: 'Phòng 1 - Tầng 1' }
window.ROOM_CODES = [
    // { code: 'P001', name: 'Phòng 1' },
    // { code: 'P002', name: 'Phòng 2' },
];

// Helper render <option> cho dropdown
window.renderRoomOptions = function (selectedCode = '') {
    const empty = `<option value="">(chưa gán)</option>`;
    const opts = (window.ROOM_CODES || []).map(r => {
        const isSelected = r.code === selectedCode ? ' selected' : '';
        return `<option value="${r.code}"${isSelected}>${r.code} — ${r.name}</option>`;
    }).join('');
    return empty + opts;
};
