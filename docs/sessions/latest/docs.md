# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-155440-d05cef2`
**Session file**: [`./20260630-155440-d05cef2.md`](../20260630-155440-d05cef2.md)
**Commit**: `d05cef2` — fix(admin-wipe): chừa web2_order_tags + web2_payment_qr_codes khỏi web2-wipe-9pages (config, không wipe)
**Last updated**: 2026-06-30 15:54:40 +07
**Summary**: fix web2-wipe-9pages: chừa web2_order_tags + web2_payment_qr_codes (config); + giả lập toàn bộ data Web 2.0 (wipe + seed 12 nhóm)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `d05cef27f` fix(admin-wipe): chừa web2*order_tags + web2_payment_qr_codes khỏi web2-wipe-9pages (config, không wipe) *(2026-06-30)\_
- `6776d8c16` chore(session): RESUME:20260630-145550-5081f02 _(2026-06-30)_
- `5081f02ae` refactor(shared): gỡ compat ncc/vuot khỏi khConModel/cardState (không consumer nào đọc) [sau #2] _(2026-06-30)_
- `2eea324fd` chore(session): RESUME:20260630-145032-7d5d7b2 _(2026-06-30)_
- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-155440-d05cef2` cho Claude walk chain theo CLAUDE.md protocol.
