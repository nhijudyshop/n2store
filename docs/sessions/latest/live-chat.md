# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-122649-e512f88`
**Session file**: [`./20260608-122649-e512f88.md`](../20260608-122649-e512f88.md)
**Commit**: `e512f88` — refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)
**Last updated**: 2026-06-08 12:26:49 +07
**Summary**: refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-init.js`

## Last 5 commits touching `live-chat/`

- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `6922ce2c6` feat(web2): backfill fb*id↔phone từ Web1 customers → warehouse + live-chat enrich SĐT/địa chỉ *(2026-06-08)\_
- `0298b6f38` perf(live-chat): cache Pancake accounts vào localStorage → boot nhanh (~2s vs ~13s) _(2026-06-08)_
- `97b2338b2` fix(live-chat): campaign load được ngay lần đầu vào (không phải chọn lại page) _(2026-06-08)_
- `1161a3b1b` auto: session update _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-122649-e512f88` cho Claude walk chain theo CLAUDE.md protocol.
