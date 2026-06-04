# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-134618-1394393`
**Session file**: [`./20260604-134618-1394393.md`](../20260604-134618-1394393.md)
**Commit**: `1394393` — fix(web2-reconcile): hien anh SP theo kho hien tai (web2_products) thay snapshot
**Last updated**: 2026-06-04 13:46:18 +07
**Summary**: fix(web2-reconcile): hien anh SP theo kho hien tai (web2_products) thay snapshot

## Files changed in this commit (`web2/`)

- `web2/reconcile/css/reconcile.css`
- `web2/reconcile/index.html`

## Last 5 commits touching `web2/`

- `dce18bb44` feat(web2): localize anh SP (data URL webp) + hover zoom reconcile _(2026-06-04)_
- `be9ccfff5` perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều) _(2026-06-04)_
- `b387ff51a` auto: session update _(2026-06-04)_
- `67c028c1d` refactor(web2): bo nut In PBH per-row (trung In bill) + sweep HD/NW->NJ _(2026-06-04)_
- `99f8cb7ab` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-134618-1394393` cho Claude walk chain theo CLAUDE.md protocol.
