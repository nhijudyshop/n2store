# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-103918-32c2437`
**Session file**: [`./20260519-103918-32c2437.md`](../20260519-103918-32c2437.md)
**Commit**: `32c2437` — feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền
**Last updated**: 2026-05-19 10:39:18 +07
**Summary**: feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`

## Last 5 commits touching `web2/`

- `32c2437e` feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền _(2026-05-19)_
- `8769fced` feat(web2): SSE notify cho 3 routes còn lại (variants/users/PBH) + cache SSE for variants _(2026-05-19)_
- `07841fb8` feat(web2-generic + page-builder): SSE realtime tự enable cho 78 generic CRUD pages _(2026-05-19)_
- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-103918-32c2437` cho Claude walk chain theo CLAUDE.md protocol.
