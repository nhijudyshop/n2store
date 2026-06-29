# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-181234-dc11a6b`
**Session file**: [`./20260629-181234-dc11a6b.md`](../20260629-181234-dc11a6b.md)
**Commit**: `dc11a6b` — feat(unit-scan): hiện mã tem theo từng STT (tem nào vào STT nào)
**Last updated**: 2026-06-29 18:12:34 +07
**Summary**: feat(unit-scan): hiện mã tem theo từng STT (tem nào vào STT nào)

## Files changed in this commit (`web2/`)

- `web2/unit-scan/css/unit-scan.css`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `dc11a6b70` feat(unit-scan): hiện mã tem theo từng STT (tem nào vào STT nào) _(2026-06-29)_
- `3b7d434b8` feat(goods-weight): admin xoá dữ liệu theo ngày trong báo cáo (DELETE /day, scope NV) _(2026-06-29)_
- `eaea28721` feat(unit-scan): bỏ 2 tab → 1 view + chi tiết SP theo từng STT trong kệ _(2026-06-29)_
- `f535f7c71` feat(goods-weight): bộ lọc 12 tháng (mặc định tháng hiện tại) cho báo cáo _(2026-06-29)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-181234-dc11a6b` cho Claude walk chain theo CLAUDE.md protocol.
