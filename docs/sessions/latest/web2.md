# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-193157-8ddb60b`
**Session file**: [`./20260613-193157-8ddb60b.md`](../20260613-193157-8ddb60b.md)
**Commit**: `8ddb60b` — auto: session update
**Last updated**: 2026-06-13 19:31:57 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/shared/web2-products-cache.js`
- `web2/shared/web2-so-order-reader.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-app.js`

## Last 5 commits touching `web2/`

- `8ddb60bfa` auto: session update _(2026-06-13)_
- `d9bcc5030` fix(web2): C8 cross-page — consumers đọc so-order từ Postgres (không Firestore frozen) _(2026-06-13)_
- `fa8661c70` feat(web2-zalo): cau truc tin nhom dung - resolve ten+avatar nguoi gui (getGroupMembersInfo + cache web2*zalo_members), selfListen=true bat tin shop tu gui, bubble hien avatar+ten that nhom *(2026-06-13)\_
- `dd5e25c86` polish(web2): dedupe source-pill hide rule (gộp 3 block trùng → 1) _(2026-06-13)_
- `0c3188894` polish(web2): ẩn source-pill (tên bảng DB) — commit --only chống race _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-193157-8ddb60b` cho Claude walk chain theo CLAUDE.md protocol.
