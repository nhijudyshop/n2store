# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-135148-37d678e`
**Session file**: [`./20260519-135148-37d678e.md`](../20260519-135148-37d678e.md)
**Commit**: `37d678e` — feat(web2/PBH): web2-bill-service + gộp đơn (merge STT '1 + 2') + bulk-print 80mm
**Last updated**: 2026-05-19 13:51:48 +07
**Summary**: feat(web2/PBH): web2-bill-service + gộp đơn (merge STT '1 + 2') + bulk-print 80mm

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `37d678e7` feat(web2/PBH): web2-bill-service + gộp đơn (merge STT '1 + 2') + bulk-print 80mm _(2026-05-19)_
- `9e553251` feat(web2): cross-page SSE wiring Phase A+B — liên kết realtime giữa các page _(2026-05-19)_
- `d4512fc9` auto: session update _(2026-05-19)_
- `a1a7829b` chore(web2): đồng nhất title - WEB 2.0 cho 79 pages còn lại (tổng 92/92) _(2026-05-19)_
- `24c24b0d` fix(web2/balance-history): opt out legacy navigation-modern.js auth redirect _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-135148-37d678e` cho Claude walk chain theo CLAUDE.md protocol.
