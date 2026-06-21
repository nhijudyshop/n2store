# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-161338-b9f567b`
**Session file**: [`./20260621-161338-b9f567b.md`](../20260621-161338-b9f567b.md)
**Commit**: `b9f567b` — fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race)
**Last updated**: 2026-06-21 16:13:38 +07
**Summary**: audit-d money-path: 9 confirmed bugs fixed (over-refund regression + PBH/wallet/sepay)

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/data-loader.js`
- `inventory-tracking/js/modal-image-manager.js`

## Last 5 commits touching `inventory-tracking/`

- `b9f567be7` fix(web2) audit-d: 9 money-path bugs (over-refund regression, PBH oversell/drift, wallet double-credit, sepay race) _(2026-06-21)_
- `dd8e94867` perf(inventory-tracking): chỉ lưu đợt thay đổi + bỏ trả/đẩy full-table trong Quản Lý Ảnh _(2026-06-21)_
- `5b8e24255` auto: session update _(2026-06-21)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `4199e3b5f` feat(inventory-tracking): nút "Cập nhật từ TPOS" per-row trong modal Tạo đơn đặt hàng _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-161338-b9f567b` cho Claude walk chain theo CLAUDE.md protocol.
