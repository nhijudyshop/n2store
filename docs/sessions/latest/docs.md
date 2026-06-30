# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-163230-662ee11`
**Session file**: [`./20260630-163230-662ee11.md`](../20260630-163230-662ee11.md)
**Commit**: `662ee11` — refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET_HANG; cross-link công thức chờ hàng (audit #2,#3)
**Last updated**: 2026-06-30 16:32:30 +07
**Summary**: refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET_HANG; cross-link công thức chờ...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `662ee1163` refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET*HANG; cross-link công thức chờ hàng (audit #2,#3) *(2026-06-30)\_
- `a45bb6d50` refactor(order-tags): gộp tag 'Âm mã' → 'Chờ hàng' (over-sell = chờ hàng = cần đặt NCC, 1 khái niệm) _(2026-06-30)_
- `d8e2b31ec` chore(session): RESUME:20260630-155440-d05cef2 _(2026-06-30)_
- `d05cef27f` fix(admin-wipe): chừa web2*order_tags + web2_payment_qr_codes khỏi web2-wipe-9pages (config, không wipe) *(2026-06-30)\_
- `6776d8c16` chore(session): RESUME:20260630-145550-5081f02 _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-163230-662ee11` cho Claude walk chain theo CLAUDE.md protocol.
