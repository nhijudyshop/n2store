# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-105334-07b759a`
**Session file**: [`./20260616-105334-07b759a.md`](../20260616-105334-07b759a.md)
**Commit**: `07b759a` — feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src_message vào /list search)
**Last updated**: 2026-06-16 10:53:34 +07
**Summary**: feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src_message vào /list search)

## Files changed in this commit (`web2/`)

- `web2/jt-tracking/index.html`

## Last 5 commits touching `web2/`

- `07b759ab7` feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src*message vào /list search) *(2026-06-16)\_
- `79afdb96a` auto: session update _(2026-06-16)_
- `043bf7763` auto: session update _(2026-06-16)_
- `c4052b90f` auto: session update _(2026-06-16)_
- `6aaa49f8f` feat(web2-realtime): proxy-only — bỏ direct WS pancake.vn (hết log đỏ 1006) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-105334-07b759a` cho Claude walk chain theo CLAUDE.md protocol.
