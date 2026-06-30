# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-155440-d05cef2`
**Session file**: [`./20260630-155440-d05cef2.md`](../20260630-155440-d05cef2.md)
**Commit**: `d05cef2` — fix(admin-wipe): chừa web2_order_tags + web2_payment_qr_codes khỏi web2-wipe-9pages (config, không wipe)
**Last updated**: 2026-06-30 15:54:40 +07
**Summary**: fix web2-wipe-9pages: chừa web2_order_tags + web2_payment_qr_codes (config); + giả lập toàn bộ data Web 2.0 (wipe + seed 12 nhóm)

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-data-reset.js`

## Last 5 commits touching `render.com/`

- `d05cef27f` fix(admin-wipe): chừa web2*order_tags + web2_payment_qr_codes khỏi web2-wipe-9pages (config, không wipe) *(2026-06-30)\_
- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_
- `b218b0979` feat(web2-campaign-products): GIỎ scope theo phiên live (join post→chiến dịch, gate lũy tiến) [#1 bước 3] _(2026-06-30)_
- `0128f1a27` fix(live-control): sửa nhầm 'pre-order' — vùng CHỌN = CHO VƯỢT (hàng có sẵn), vùng KHÔNG chọn mới là pre-order _(2026-06-30)_
- `d707c5858` docs(soan-hang): desc thẻ rõ 🖨 = in giấy, tách is*active (ẩn/hiện tag); E2E verified ✅ *(2026-06-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-155440-d05cef2` cho Claude walk chain theo CLAUDE.md protocol.
