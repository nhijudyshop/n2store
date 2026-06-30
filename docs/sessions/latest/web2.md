# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-104701-34f23fe`
**Session file**: [`./20260630-104701-34f23fe.md`](../20260630-104701-34f23fe.md)
**Commit**: `34f23fe` — fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI)
**Last updated**: 2026-06-30 10:47:01 +07
**Summary**: fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không l...

## Files changed in this commit (`web2/`)

- `web2/live-control/index.html`

## Last 5 commits touching `web2/`

- `34f23fef2` fix(live-control): đổi nhãn dropdown 'MỚI theo' → 'Cho VƯỢT theo' (đúng chức năng pre-order, không lọc cột MỚI) _(2026-06-30)_
- `79afb759a` fix(soan-hang): tách toggle IN khỏi is*active → cột print_enabled (tag VẪN hiện khi tắt in) *(2026-06-30)\_
- `a45eb07b8` feat(unit-scan): modal chi tiết ghi rõ SP nào đang chờ hàng (pill ⏳ từ cho*hang.detail) *(2026-06-30)\_
- `e69f96129` feat(unit-scan): bấm ô sơ đồ kệ → mở modal chi tiết đơn (thay vì cuộn xuống) _(2026-06-30)_
- `c26539902` feat(unit-scan): hiện tag đơn ngay trên ô sơ đồ kệ (pill trắng đọc rõ trên ô cam/xanh) _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-104701-34f23fe` cho Claude walk chain theo CLAUDE.md protocol.
