# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-192116-3e3021e`
**Session file**: [`./20260620-192116-3e3021e.md`](../20260620-192116-3e3021e.md)
**Commit**: `3e3021e` — feat(native-orders): Đơn Inbox 'Gán FB khác' — gán lại Facebook đúng nếu auto-dò nhầm
**Last updated**: 2026-06-20 19:21:16 +07
**Summary**: native-orders inbox: nut 'Gan FB khac' re-bind Facebook dung neu auto-do nham

## Files changed in this commit (`web2/`)

- `web2/shared/web2-base.css`

## Last 5 commits touching `web2/`

- `3e3021e45` feat(native-orders): Đơn Inbox 'Gán FB khác' — gán lại Facebook đúng nếu auto-dò nhầm _(2026-06-20)_
- `b16d82b83` auto: session update _(2026-06-20)_
- `784b6d0e7` fix(web2): cache tu nap Web2ProductsApi (shared) -> picker load SP khong can vao Kho SP truoc _(2026-06-20)_
- `3f8e516a5` auto: session update _(2026-06-20)_
- `7eef1e1be` fix(web2/reconcile): client gui x-web2-token (regression tu audit gate reconcile route) - sua 'thieu/sai token' _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-192116-3e3021e` cho Claude walk chain theo CLAUDE.md protocol.
