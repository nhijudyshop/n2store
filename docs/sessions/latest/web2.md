# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-122440-6e100ed`
**Session file**: [`./20260614-122440-6e100ed.md`](../20260614-122440-6e100ed.md)
**Commit**: `6e100ed` — auto: session update
**Last updated**: 2026-06-14 12:24:40 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/supplier-debt/index.html`
- `web2/supplier-debt/js/supplier-debt-app.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`

## Last 5 commits touching `web2/`

- `f526a7a8a` fix(web2): NFC-normalize deep-link match in supplier-wallet + supplier-debt _(2026-06-14)_
- `5eaba56fa` feat(web2): Hướng C — KPI 'Sổ Order/NCC' lên dashboard (kết nối B+E) _(2026-06-14)_
- `8bdfc3fc8` feat(web2): Hướng D — dọn nốt Firestore Web 2.0 → Postgres _(2026-06-14)_
- `4a8d6aba3` feat(web2): cross-page deep-linking — NCC công nợ↔ví↔sổ order + so-order→Kho SP _(2026-06-14)_
- `f1f3f89cc` feat(web2): UX đợt C — modal Esc/Enter + autofocus + mobile + empty-state + silent-catch + a11y (~21 trang) _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-122440-6e100ed` cho Claude walk chain theo CLAUDE.md protocol.
