# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-152609-e9cf97b`
**Session file**: [`./20260607-152609-e9cf97b.md`](../20260607-152609-e9cf97b.md)
**Commit**: `e9cf97b` — auto: session update
**Last updated**: 2026-06-07 15:26:09 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/plans/web2-customer-warehouse.md`

## Last 5 commits touching `docs/`

- `e9cf97b76` auto: session update _(2026-06-07)_
- `0cd117a4e` docs(plan): kho KH Web 2.0 warehouse + tách config deliveryzone/printer (đề xuất + consumer map) _(2026-06-07)_
- `778f7d9c3` chore(session): RESUME:20260607-151837-5c77fce _(2026-06-07)_
- `5c77fce83` feat(web2/chat): Feature 3 — nhận diện SĐT/địa chỉ trong chat + Thêm vào KH (fill đơn + upsert web2*customers); test OK *(2026-06-07)\_
- `eda42761c` chore(session): RESUME:20260607-151603-d9ae566 _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-152609-e9cf97b` cho Claude walk chain theo CLAUDE.md protocol.
