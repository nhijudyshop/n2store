# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-170354-bc77504`
**Session file**: [`./20260621-170354-bc77504.md`](../20260621-170354-bc77504.md)
**Commit**: `bc77504` — docs(web2): sửa số trigger 22->21 trong dev-log (order tags)
**Last updated**: 2026-06-21 17:03:54 +07
**Summary**: docs(web2): sửa số trigger 22->21 trong dev-log (order tags)

## Files changed in this commit (`web2/`)

- `web2/order-tags/js/order-tags-app.js`

## Last 5 commits touching `web2/`

- `bb78c4806` fix(web2): 1 trigger = 1 tag — chặn tạo thẻ trùng trigger + dedupe engine + ẩn trigger đã dùng trong picker _(2026-06-21)_
- `31ae0603e` feat(video-maker): thêm thẻ cảm xúc VieNeu (cười/thở dài/hắng giọng) _(2026-06-21)_
- `6aed6fc0b` auto: session update _(2026-06-21)_
- `3906f4cf5` auto: session update _(2026-06-21)_
- `e7a767d77` feat(web2): TAG đơn hàng auto theo trigger + chặn PBH khi có SP chờ hàng _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-170354-bc77504` cho Claude walk chain theo CLAUDE.md protocol.
