# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-200245-2a4021b`
**Session file**: [`./20260612-200245-2a4021b.md`](../20260612-200245-2a4021b.md)
**Commit**: `2a4021b` — fix(orders-report): gộp đơn trùng SĐT — hết miss tag "ĐÃ GỘP KHÔNG CHỐT" theo máy + progress UI trong modal
**Last updated**: 2026-06-12 20:02:45 +07
**Summary**: fix(orders-report): gộp đơn trùng SĐT — hết miss tag ĐÃ GỘP KHÔNG CHỐT theo máy (silent-skip _isLoaded + reload clobber) + progress UI modal từng cụm

## Files changed in this commit (`native-orders/`)
- `native-orders/index.html`

## Last 5 commits touching `native-orders/`
- `248532b73` feat(web2): ENFORCE-PREP — wire x-web2-token toàn bộ client gọi route soft-gated _(2026-06-12)_
- `59738a0e1` auto: session update _(2026-06-12)_
- `7bb139d21` auto: session update _(2026-06-12)_
- `c719b9de4` refactor(web2): gỡ hẳn crm_team_id/crm_team_name — di tích TPOS (DROP COLUMN native_orders + fast_sale_orders, client ngừng gửi, getPartnerInfo bỏ tham số chết) _(2026-06-12)_
- `16d3f32c9` feat(native-orders): Thêm đơn Inbox — tìm kho KH trước, fallback Pancake; chọn kho KH thì dò page nền theo SĐT _(2026-06-09)_

---
**Để tiếp tục context trong session mới:**
1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-200245-2a4021b` cho Claude walk chain theo CLAUDE.md protocol.
