# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-151825-95a53db`
**Session file**: [`./20260602-151825-95a53db.md`](../20260602-151825-95a53db.md)
**Commit**: `95a53db` — auto: session update
**Last updated**: 2026-06-02 15:18:25 +07
**Summary**: auto: session update

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/index.html`
- `issue-tracking/js/tpos-fastsale-tab.js`

## Last 5 commits touching `issue-tracking/`

- `95a53db47` auto: session update _(2026-06-02)_
- `b109620ae` feat(issue-tracking,render): realtime sync hủy phiếu cross-tab/máy qua SSE topic fast*sale_orders *(2026-06-02)\_
- `87156f503` feat(issue-tracking): BÁN HÀNG — nút Hủy phiếu (ActionCancel) + Lịch sử (AuditLog) như TPOS _(2026-06-02)_
- `397da92e5` feat(virtual-credit): hạn cấp công nợ ảo 15 → 30 ngày (chỉ phiếu mới) + finalize refund per-line discount _(2026-06-01)_
- `bac281d4c` feat(issue-tracking): nút Ẩn hiện cột — default ẩn Kênh (BÁN HÀNG) + Kênh & PBH gốc (TRẢ HÀNG) _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-151825-95a53db` cho Claude walk chain theo CLAUDE.md protocol.
