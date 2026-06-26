# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-110623-a8d6ef7`
**Session file**: [`./20260626-110623-a8d6ef7.md`](../20260626-110623-a8d6ef7.md)
**Commit**: `a8d6ef7` — feat(purchase-orders↔so-order): xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2)
**Last updated**: 2026-06-26 11:06:23 +07
**Summary**: Cầu nối xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2), tách layer

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a8d6ef7c6` feat(purchase-orders↔so-order): xuất bảng PO (Web1) → mã base64 → nhập Sổ Order (Web2) _(2026-06-26)_
- `4b557edca` chore(session): RESUME:20260626-105748-cc7cb0d _(2026-06-26)_
- `21ef9d2e3` fix(web2/cham-cong): hôm nay chưa tan ca = 'đang làm', không tính chấm thiếu/đối soát (đến work*end+grace mới tính) *(2026-06-26)\_
- `b80748cc2` chore(session): RESUME:20260626-104850-523991a _(2026-06-26)_
- `523991aa3` feat(web2/cham-cong): NV chưa gán user không cần chấm công (ẩn khỏi Bảng công/Hôm nay/đối soát, giữ Bảng lương) _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-110623-a8d6ef7` cho Claude walk chain theo CLAUDE.md protocol.
