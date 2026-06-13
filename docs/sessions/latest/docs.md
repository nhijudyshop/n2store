# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-134924-29141d8`
**Session file**: [`./20260613-134924-29141d8.md`](../20260613-134924-29141d8.md)
**Commit**: `29141d8` — fix(web2-customers): lookup KH theo SĐT phụ (alt_phones) — TC-cụm ĐÓNG
**Last updated**: 2026-06-13 13:49:24 +07
**Summary**: fix(web2-customers): lookup KH theo SĐT phụ (alt_phones) — TC-cụm ĐÓNG

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-PAGES-ANALYSIS.md`

## Last 5 commits touching `docs/`

- `29141d8e0` fix(web2-customers): lookup KH theo SĐT phụ (alt*phones) — TC-cụm ĐÓNG *(2026-06-13)\_
- `79a9a71a0` chore(session): RESUME:20260613-133602-ad01d13 _(2026-06-13)_
- `ad01d1395` fix(so-order): in tem dùng chung nguồn web2/products — load Web2QR + Web2Printer _(2026-06-13)_
- `81530cb68` chore(session): RESUME:20260613-132323-04c086b _(2026-06-13)_
- `04c086bb2` feat(live-chat): toggle ẩn/hiện SP hết hàng (stock=0) trong panel Kho SP _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-134924-29141d8` cho Claude walk chain theo CLAUDE.md protocol.
