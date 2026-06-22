# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-160121-f1e4262`
**Session file**: [`./20260622-160121-f1e4262.md`](../20260622-160121-f1e4262.md)
**Commit**: `f1e4262` — auto: session update
**Last updated**: 2026-06-22 16:01:21 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `50de1c1ec` feat(web2-video-maker): frontend "Giọng AI Pro" engine + tab kho giọng (mặc định Adam 3, giấu nhà cung cấp) _(2026-06-22)_
- `8b64a0a5b` feat(web2-video-maker): backend "Giọng AI Pro" TTS proxy (tên trung tính, giấu nhà cung cấp) _(2026-06-22)_
- `6def4be63` chore(session): RESUME:20260622-152946-d31980e _(2026-06-22)_
- `d31980e44` docs(dev-log): table unify → canonical .data-table (Step 6, verified) _(2026-06-22)_
- `8788fdb78` chore(session): RESUME:20260622-152657-664f1b7 _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-160121-f1e4262` cho Claude walk chain theo CLAUDE.md protocol.
