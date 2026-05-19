# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-103918-32c2437`
**Session file**: [`./20260519-103918-32c2437.md`](../20260519-103918-32c2437.md)
**Commit**: `32c2437` — feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền
**Last updated**: 2026-05-19 10:39:18 +07
**Summary**: feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `32c2437e` feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền _(2026-05-19)_
- `b63655dd` chore(session): RESUME:20260519-103127-8769fce _(2026-05-19)_
- `8769fced` feat(web2): SSE notify cho 3 routes còn lại (variants/users/PBH) + cache SSE for variants _(2026-05-19)_
- `277ef3d9` chore(session): RESUME:20260519-102628-391e058 _(2026-05-19)_
- `54cc66d6` feat(purchase-orders): hover x5 zoom + click lightbox cho ảnh trong form Tạo đơn đặt hàng _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-103918-32c2437` cho Claude walk chain theo CLAUDE.md protocol.
