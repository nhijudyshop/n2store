# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-133602-ad01d13`
**Session file**: [`./20260613-133602-ad01d13.md`](../20260613-133602-ad01d13.md)
**Commit**: `ad01d13` — fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer
**Last updated**: 2026-06-13 13:36:02 +07
**Summary**: fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ad01d1395` fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer _(2026-06-13)_
- `81530cb68` chore(session): RESUME:20260613-132323-04c086b _(2026-06-13)_
- `04c086bb2` feat(live-chat): toggle ẩn/hiện SP hết hàng (stock=0) trong panel Kho SP _(2026-06-13)_
- `66ee28123` chore(session): RESUME:20260613-121005-b49de22 _(2026-06-13)_
- `b49de22a9` fix(chat): 'Khách chưa có SĐT' giả — gốc là pages Pancake không load (token 102) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-133602-ad01d13` cho Claude walk chain theo CLAUDE.md protocol.
