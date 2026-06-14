# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-120756-d26f54b`
**Session file**: [`./20260614-120756-d26f54b.md`](../20260614-120756-d26f54b.md)
**Commit**: `d26f54b` — docs(dev-log): C verified live (dashboard so-order KPI 14/13/28)
**Last updated**: 2026-06-14 12:07:56 +07
**Summary**: docs(dev-log): C verified live (dashboard so-order KPI 14/13/28)

## Files changed in this commit (`web2/`)

- `web2/dashboard/index.html`

## Last 5 commits touching `web2/`

- `5eaba56fa` feat(web2): Hướng C — KPI 'Sổ Order/NCC' lên dashboard (kết nối B+E) _(2026-06-14)_
- `8bdfc3fc8` feat(web2): Hướng D — dọn nốt Firestore Web 2.0 → Postgres _(2026-06-14)_
- `4a8d6aba3` feat(web2): cross-page deep-linking — NCC công nợ↔ví↔sổ order + so-order→Kho SP _(2026-06-14)_
- `f1f3f89cc` feat(web2): UX đợt C — modal Esc/Enter + autofocus + mobile + empty-state + silent-catch + a11y (~21 trang) _(2026-06-14)_
- `78e4ed358` feat(web2): UX đợt B — skeleton loading + error+retry + mobile + keyboard/empty-state (17 trang) _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-120756-d26f54b` cho Claude walk chain theo CLAUDE.md protocol.
