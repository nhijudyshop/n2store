# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-104726-96291b8`
**Session file**: [`./20260608-104726-96291b8.md`](../20260608-104726-96291b8.md)
**Commit**: `96291b8` — fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span
**Last updated**: 2026-06-08 10:47:26 +07
**Summary**: fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span

## Files changed in this commit (`web2/`)

- `web2/customers/index.html`
- `web2/customers/js/customers-app.js`

## Last 5 commits touching `web2/`

- `96291b813` fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span _(2026-06-08)_
- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_
- `74ead861c` refactor(web2): bỏ partner-customer (TPOS live) + repoint balance-history/customer-wallet sang warehouse _(2026-06-08)_
- `c4d375b7e` refactor(web2): bỏ field tpos: (deep-link TPOS) khỏi web2-sidebar + alertSoon _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-104726-96291b8` cho Claude walk chain theo CLAUDE.md protocol.
