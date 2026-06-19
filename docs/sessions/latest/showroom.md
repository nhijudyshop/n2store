# Latest Snapshot — `showroom/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-142720-1940a8e`
**Session file**: [`./20260619-142720-1940a8e.md`](../20260619-142720-1940a8e.md)
**Commit**: `1940a8e` — auto: session update
**Last updated**: 2026-06-19 14:27:20 +07
**Summary**: auto: session update

## Files changed in this commit (`showroom/`)

- `showroom/index.html`

## Last 5 commits touching `showroom/`

- `1940a8e00` auto: session update _(2026-06-19)_
- `acdd723bb` Add files via upload _(2026-06-10)_
- `3d8c63841` feat(showroom): viewer order tuy chinh 1->0->2->3->4 (mo o anh 1, anh 0 xem qua next) _(2026-05-20)_
- `3ffd16bc6` fix(showroom): viewer bat dau tu anh 0.jpg, total = tong anh (incl 0.jpg) _(2026-05-20)_
- `bc5737eb6` feat(showroom): 6 album that voi viewer prev/next (ESC, arrow keys, touch swipe) - tat ca vao tab QUAN _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-142720-1940a8e` cho Claude walk chain theo CLAUDE.md protocol.
