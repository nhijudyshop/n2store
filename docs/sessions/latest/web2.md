# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-134116-be9ccff`
**Session file**: [`./20260604-134116-be9ccff.md`](../20260604-134116-be9ccff.md)
**Commit**: `be9ccff` — perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều)
**Last updated**: 2026-06-04 13:41:16 +07
**Summary**: perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều)

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.js`

## Last 5 commits touching `web2/`

- `be9ccfff5` perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều) _(2026-06-04)_
- `b387ff51a` auto: session update _(2026-06-04)_
- `67c028c1d` refactor(web2): bo nut In PBH per-row (trung In bill) + sweep HD/NW->NJ _(2026-06-04)_
- `99f8cb7ab` auto: session update _(2026-06-04)_
- `8a627947c` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-134116-be9ccff` cho Claude walk chain theo CLAUDE.md protocol.
