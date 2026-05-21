# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-190137-04b8c75`
**Session file**: [`./20260521-190137-04b8c75.md`](../20260521-190137-04b8c75.md)
**Commit**: `04b8c75` — perf(web2-products): in-place row update — hết giật + SP edit không nhảy lên đầu
**Last updated**: 2026-05-21 19:01:37 +07
**Summary**: perf(web2-products): in-place row update — hết giật + SP edit không nhảy lên đầu

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `04b8c7599` perf(web2-products): in-place row update — hết giật + SP edit không nhảy lên đầu _(2026-05-21)_
- `65fd9d777` chore(cache-bust): bump asset version v=20260521b → v=20260521c _(2026-05-21)_
- `2afef5fd8` feat(web2): SSE realtime cho products + PBH page (không cần F5) _(2026-05-21)_
- `02ef68780` feat(fast-sale-orders): simplify 2-state model (Hoàn thành + Đã hủy) _(2026-05-21)_
- `3f1cb9a1c` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-190137-04b8c75` cho Claude walk chain theo CLAUDE.md protocol.
