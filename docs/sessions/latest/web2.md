# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-135145-16efac2`
**Session file**: [`./20260604-135145-16efac2.md`](../20260604-135145-16efac2.md)
**Commit**: `16efac2` — auto: session update
**Last updated**: 2026-06-04 13:51:45 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.js`

## Last 5 commits touching `web2/`

- `26fdf6d43` feat(web2): photo-studio — Cloud HD = withoutbg (free 50/tháng, full HD, no watermark) _(2026-06-04)_
- `dce18bb44` feat(web2): localize anh SP (data URL webp) + hover zoom reconcile _(2026-06-04)_
- `be9ccfff5` perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều) _(2026-06-04)_
- `b387ff51a` auto: session update _(2026-06-04)_
- `67c028c1d` refactor(web2): bo nut In PBH per-row (trung In bill) + sweep HD/NW->NJ _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-135145-16efac2` cho Claude walk chain theo CLAUDE.md protocol.
