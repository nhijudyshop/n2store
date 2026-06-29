# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-103954-bc8640b`
**Session file**: [`./20260629-103954-bc8640b.md`](../20260629-103954-bc8640b.md)
**Commit**: `bc8640b` — feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin)
**Last updated**: 2026-06-29 10:39:54 +07
**Summary**: feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `bc8640b9f` feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin) _(2026-06-29)_
- `74f31a925` feat(clearance): hàng rớt xả theo CHIẾN DỊCH (da*doi_soat>70% + most-recent campaign + 1 ngày) *(2026-06-29)\_
- `23fa90378` chore(session): RESUME:20260629-101330-1a1adf6 _(2026-06-29)_
- `1a1adf6ea` docs(dev-log): cart auth hardening verified prod (no-token→401, token→full flow) _(2026-06-29)_
- `556566520` chore(session): RESUME:20260629-100917-8ac5249 _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-103954-bc8640b` cho Claude walk chain theo CLAUDE.md protocol.
