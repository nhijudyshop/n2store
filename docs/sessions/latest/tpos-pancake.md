# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-122214-2ead903`
**Session file**: [`./20260524-122214-2ead903.md`](../20260524-122214-2ead903.md)
**Commit**: `2ead903` — fix(snap): DB dedup — UNIQUE INDEX (comment_id) + ON CONFLICT + client cache skip
**Last updated**: 2026-05-24 12:22:14 +07
**Summary**: fix(snap): DB dedup — UNIQUE INDEX (comment_id) + ON CONFLICT + client cache skip

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `2ead90364` fix(snap): DB dedup — UNIQUE INDEX (comment*id) + ON CONFLICT + client cache skip *(2026-05-24)\_
- `9e0657e38` fix(snap): live-capture fallback khi buffer empty/stale (ext mode) _(2026-05-24)_
- `7374bf2d9` fix(snap): đợi iframe load event + 7s buffer trước khi start capture _(2026-05-24)_
- `f134e609c` feat(snap): ẩn badge popover + ẩn Chụp button + thumbnail hover zoom _(2026-05-24)_
- `afe3be118` feat(snap): click badge 📸 chỉ hiện snapshot của comment đó _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-122214-2ead903` cho Claude walk chain theo CLAUDE.md protocol.
