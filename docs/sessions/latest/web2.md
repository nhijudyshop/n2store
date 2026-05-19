# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-135927-928278d`
**Session file**: [`./20260519-135927-928278d.md`](../20260519-135927-928278d.md)
**Commit**: `928278d` — feat(native-orders): move gộp đơn + in bill từ PBH page sang đúng chỗ (Đơn Web)
**Last updated**: 2026-05-19 13:59:27 +07
**Summary**: feat(native-orders): move gộp đơn + in bill từ PBH page sang đúng chỗ (Đơn Web)

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`

## Last 5 commits touching `web2/`

- `928278da` feat(native-orders): move gộp đơn + in bill từ PBH page sang đúng chỗ (Đơn Web) _(2026-05-19)_
- `37d678e7` feat(web2/PBH): web2-bill-service + gộp đơn (merge STT '1 + 2') + bulk-print 80mm _(2026-05-19)_
- `9e553251` feat(web2): cross-page SSE wiring Phase A+B — liên kết realtime giữa các page _(2026-05-19)_
- `d4512fc9` auto: session update _(2026-05-19)_
- `a1a7829b` chore(web2): đồng nhất title - WEB 2.0 cho 79 pages còn lại (tổng 92/92) _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-135927-928278d` cho Claude walk chain theo CLAUDE.md protocol.
