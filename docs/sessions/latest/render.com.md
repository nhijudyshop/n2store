# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-185212-4c06d93`
**Session file**: [`./20260606-185212-4c06d93.md`](../20260606-185212-4c06d93.md)
**Commit**: `4c06d93` — merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)
**Last updated**: 2026-06-06 18:52:12 +07
**Summary**: merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)

## Files changed in this commit (`render.com/`)

- `render.com/migrations/074_create_kpi_final_snapshot.sql`
- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/realtime-db.js`
- `render.com/routes/sepay-webhook-core.js`
- `render.com/routes/v2/web2-balance-history.js`
- `render.com/run-migration-074.js`

## Last 5 commits touching `render.com/`

- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `5346a521d` feat(web2): CK cộng ví → tự trừ vào PBH chưa trả của SĐT (đơn đã thanh toán) _(2026-06-06)_
- `b99877c8f` fix(orders/KPI): tính NET theo ĐƠN THẬT TPOS (final − BASE), hết lệch do audit log drift _(2026-06-06)_
- `214bc43ee` feat(web2-reconcile): ẩn lịch sử mặc định (toggle) + ưu tiên list SP + scan lỗi liệt kê mã _(2026-06-06)_
- `c4c0a573a` feat(snap): force extract + nút Lấy thumbnail chuyển CLIENT-SIDE (seek iframe VOD + capture) — fix FB chặn backend yt-dlp/Graph; verified 14/14✓ thumbnail thật _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-185212-4c06d93` cho Claude walk chain theo CLAUDE.md protocol.
