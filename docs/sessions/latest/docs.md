# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-224315-fddf008`
**Session file**: [`./20260619-224315-fddf008.md`](../20260619-224315-fddf008.md)
**Commit**: `fddf008` — docs(dev-log): FB reach deprecation pivot + shared FB client
**Last updated**: 2026-06-19 22:43:15 +07
**Summary**: FB Graph: read_insights thật (clicks/video views, reach FB đã khai tử), sửa caption, handoff Đăng lên FB, đăng ảnh bytes (bỏ imgbb), FB client → shared

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `fddf008f5` docs(dev-log): FB reach deprecation pivot + shared FB client _(2026-06-19)_
- `764f9a669` docs(web2): regenerate codemap — thêm shared web2-fb-client/web2-fb-share vào registry _(2026-06-19)_
- `92bff8518` chore(session): RESUME:20260619-223940-3d3b9a0 _(2026-06-19)_
- `94dfe5df4` feat(video-maker): tích hợp VieNeu-TTS clone giọng — server máy shop + tunnel + frontend Web2Vieneu _(2026-06-19)_
- `293341a12` chore(session): RESUME:20260619-223425-e53a1ef _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-224315-fddf008` cho Claude walk chain theo CLAUDE.md protocol.
