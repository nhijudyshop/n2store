# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-175034-23bc4f1`
**Session file**: [`./20260621-175034-23bc4f1.md`](../20260621-175034-23bc4f1.md)
**Commit**: `23bc4f1` — feat(video-maker): giọng đọc theo từng cảnh (multi-narrator)
**Last updated**: 2026-06-21 17:50:34 +07
**Summary**: video-maker: kho giọng Piper+ElevenLabs, import video lồng tiếng, giọng theo cảnh, thẻ cảm xúc

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `23bc4f13e` feat(video-maker): giọng đọc theo từng cảnh (multi-narrator) _(2026-06-21)_
- `4ad4df0ed` chore(session): RESUME:20260621-174906-65333d6 _(2026-06-21)_
- `00ef32976` chore(session): RESUME:20260621-174322-61fba73 _(2026-06-21)_
- `a0236bba9` feat(web2): popup lý do tag hiện ẢNH sản phẩm (catalog image*url + fallback snapshot) *(2026-06-21)\_
- `23080242e` chore(session): RESUME:20260621-173150-81eb667 _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-175034-23bc4f1` cho Claude walk chain theo CLAUDE.md protocol.
