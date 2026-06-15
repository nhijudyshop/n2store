# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-193935-283422b`
**Session file**: [`./20260615-193935-283422b.md`](../20260615-193935-283422b.md)
**Commit**: `283422b` — feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2_customers + SSE đồng bộ
**Last updated**: 2026-06-15 19:39:35 +07
**Summary**: feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2_customers + SSE đồng bộ

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_
- `18b5e0769` feat(orders-report,render): cột TIN NHẮN nhận biết tin mới khi mở lại (quét list unread Pancake) _(2026-06-15)_
- `054332f5e` fix(web2-jt): siết _parsePasteDate dòng dán (chống typo/ngày cũ/ghi chú) _(2026-06-15)\_
- `f598b3c2d` chore(session): RESUME:20260615-192720-2423acb _(2026-06-15)_
- `95cf07aa3` chore(session): RESUME:20260615-191814-ffa5d60 _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-193935-283422b` cho Claude walk chain theo CLAUDE.md protocol.
