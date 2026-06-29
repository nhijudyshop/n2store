# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-192554-159831f`
**Session file**: [`./20260629-192554-159831f.md`](../20260629-192554-159831f.md)
**Commit**: `159831f` — auto: session update
**Last updated**: 2026-06-29 19:25:54 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `159831fc6` auto: session update _(2026-06-29)_
- `dc11a6b70` feat(unit-scan): hiện mã tem theo từng STT (tem nào vào STT nào) _(2026-06-29)_
- `3b7d434b8` feat(goods-weight): admin xoá dữ liệu theo ngày trong báo cáo (DELETE /day, scope NV) _(2026-06-29)_
- `eaea28721` feat(unit-scan): bỏ 2 tab → 1 view + chi tiết SP theo từng STT trong kệ _(2026-06-29)_
- `f535f7c71` feat(goods-weight): bộ lọc 12 tháng (mặc định tháng hiện tại) cho báo cáo _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-192554-159831f` cho Claude walk chain theo CLAUDE.md protocol.
