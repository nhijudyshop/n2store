# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-112707-035960e`
**Session file**: [`./20260628-112707-035960e.md`](../20260628-112707-035960e.md)
**Commit**: `035960e` — docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause
**Last updated**: 2026-06-28 11:27:07 +07
**Summary**: docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `035960e2f` docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause _(2026-06-28)_
- `c6ab47a8d` chore(session): RESUME:20260628-112155-73195ac _(2026-06-28)_
- `6e114a234` docs(dev-log): ai-widget redesign + fix data-quá-lớn im lặng _(2026-06-28)_
- `b62c9e665` chore(session): RESUME:20260628-110222-86484a2 _(2026-06-28)_
- `86484a24a` docs(dev-log): audit AI widget registry — expose state 12 trang _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-112707-035960e` cho Claude walk chain theo CLAUDE.md protocol.
