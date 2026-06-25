# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-194528-308ce60`
**Session file**: [`./20260625-194528-308ce60.md`](../20260625-194528-308ce60.md)
**Commit**: `308ce60` — fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware
**Last updated**: 2026-06-25 19:45:28 +07
**Summary**: Audit unique-theo-mã 8 surface (7/8 sạch) + fix triệt để: default by:code, modal+supplier-wallet variant-aware

## Files changed in this commit (`web2/`)

- `web2/live-control/index.html`
- `web2/live-tv/index.html`
- `web2/shared/web2-variant-group.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-actions.js`

## Last 5 commits touching `web2/`

- `308ce60ba` fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware _(2026-06-25)_
- `05649cde5` fix(web2/live-control,live-tv): SP unique theo MÃ — bỏ gom theo tên _(2026-06-25)_
- `3d1161297` auto: session update _(2026-06-25)_
- `927c3e8a3` fix(web2/zalo): focus-lease phiên Zalo — hết spam 'Đổi thiết bị' trên chat.zalo.me _(2026-06-25)_
- `a75e147fd` feat(web2/customer-chat): realtime như live-chat — subscribe SSE web2:messages _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-194528-308ce60` cho Claude walk chain theo CLAUDE.md protocol.
