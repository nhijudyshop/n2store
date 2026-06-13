# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-135004-96cbe70`
**Session file**: [`./20260613-135004-96cbe70.md`](../20260613-135004-96cbe70.md)
**Commit**: `96cbe70` — feat(so-order,web2): prefix mã SP lấy theo TAB Sổ Order, không chọn → KHO
**Last updated**: 2026-06-13 13:50:04 +07
**Summary**: feat(so-order,web2): prefix mã SP lấy theo TAB Sổ Order, không chọn → KHO

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `96cbe70ca` feat(so-order,web2): prefix mã SP lấy theo TAB Sổ Order, không chọn → KHO _(2026-06-13)_
- `35bde2df6` chore(session): RESUME:20260613-134924-29141d8 _(2026-06-13)_
- `29141d8e0` fix(web2-customers): lookup KH theo SĐT phụ (alt*phones) — TC-cụm ĐÓNG *(2026-06-13)\_
- `79a9a71a0` chore(session): RESUME:20260613-133602-ad01d13 _(2026-06-13)_
- `ad01d1395` fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-135004-96cbe70` cho Claude walk chain theo CLAUDE.md protocol.
