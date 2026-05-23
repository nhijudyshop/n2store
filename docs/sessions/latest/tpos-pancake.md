# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-103741-d39d7c7`
**Session file**: [`./20260523-103741-d39d7c7.md`](../20260523-103741-d39d7c7.md)
**Commit**: `d39d7c7` — feat(snap): offset chính xác via TPOS /facebook/livevideo channelCreatedTime
**Last updated**: 2026-05-23 10:37:41 +07
**Summary**: feat(snap): offset chính xác via TPOS /facebook/livevideo channelCreatedTime

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `d39d7c7a9` feat(snap): offset chính xác via TPOS /facebook/livevideo channelCreatedTime _(2026-05-23)_
- `69012efa3` feat(snap): detect & display offset 'giây thứ N của video livestream' _(2026-05-23)_
- `671a4be12` feat(snap): thêm vanity 'NhiJudyStore' cho pageId 270136663390370 _(2026-05-23)_
- `ade7b0896` fix(snap URL): strip {pageId}_ prefix + vanity username + locale=vi_VN _(2026-05-23)\_
- `328ed2788` feat(snap): tutorial modal 3 bước trước khi mở getDisplayMedia picker _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-103741-d39d7c7` cho Claude walk chain theo CLAUDE.md protocol.
