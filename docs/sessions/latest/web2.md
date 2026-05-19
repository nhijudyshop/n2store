# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-151510-a713327`
**Session file**: [`./20260519-151510-a713327.md`](../20260519-151510-a713327.md)
**Commit**: `a713327` — feat(web2/reconcile): Phase 1 MVP — Đối soát đóng gói PBH (scan + pack + ship + deliver)
**Last updated**: 2026-05-19 15:15:10 +07
**Summary**: feat(web2/reconcile): Phase 1 MVP — Đối soát đóng gói PBH (scan + pack + ship + deliver)

## Files changed in this commit (`web2/`)

- `web2/reconcile/css/reconcile.css`
- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-app.js`
- `web2/shared/tpos-sidebar.js`

## Last 5 commits touching `web2/`

- `a7133271` feat(web2/reconcile): Phase 1 MVP — Đối soát đóng gói PBH (scan + pack + ship + deliver) _(2026-05-19)_
- `9f628163` feat(native-orders): tách nút 'Gộp đơn' riêng + redesign bill 80mm đẹp hơn _(2026-05-19)_
- `928278da` feat(native-orders): move gộp đơn + in bill từ PBH page sang đúng chỗ (Đơn Web) _(2026-05-19)_
- `37d678e7` feat(web2/PBH): web2-bill-service + gộp đơn (merge STT '1 + 2') + bulk-print 80mm _(2026-05-19)_
- `9e553251` feat(web2): cross-page SSE wiring Phase A+B — liên kết realtime giữa các page _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-151510-a713327` cho Claude walk chain theo CLAUDE.md protocol.
