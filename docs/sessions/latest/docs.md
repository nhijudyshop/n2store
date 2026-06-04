# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-134116-be9ccff`
**Session file**: [`./20260604-134116-be9ccff.md`](../20260604-134116-be9ccff.md)
**Commit**: `be9ccff` — perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều)
**Last updated**: 2026-06-04 13:41:16 +07
**Summary**: perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `be9ccfff5` perf(web2): photo-studio — AI nhanh nâng cấp MediaPipe Tasks Vision ImageSegmenter (GPU, nhanh hơn nhiều) _(2026-06-04)_
- `f7209a5e4` chore(session): RESUME:20260604-133826-b387ff5 _(2026-06-04)_
- `f6c1aca3f` fix(product-warehouse): search theo mã+tên đúng tức thì — route Render DB khi cache chưa warm + warm cache song song _(2026-06-04)_
- `5a90fedcb` chore(session): RESUME:20260604-133604-a220409 _(2026-06-04)_
- `2c7be37d7` chore(session): RESUME:20260604-132244-99f8cb7 _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-134116-be9ccff` cho Claude walk chain theo CLAUDE.md protocol.
