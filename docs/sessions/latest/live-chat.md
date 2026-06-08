# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-101234-c66f0f0`
**Session file**: [`./20260608-101234-c66f0f0.md`](../20260608-101234-c66f0f0.md)
**Commit**: `c66f0f0` — feat(live-chat): dropdown chiến dịch xen kẽ Store/House mới nhất lên đầu + mặc định chọn newest mỗi page
**Last updated**: 2026-06-08 10:12:34 +07
**Summary**: feat(live-chat): dropdown chiến dịch xen kẽ Store/House mới nhất lên đầu + mặc định chọn newest ...

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-init.js`
- `live-chat/js/live/live-source.js`

## Last 5 commits touching `live-chat/`

- `c66f0f041` feat(live-chat): dropdown chiến dịch xen kẽ Store/House mới nhất lên đầu + mặc định chọn newest mỗi page _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_
- `f1f0b7690` refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-101234-c66f0f0` cho Claude walk chain theo CLAUDE.md protocol.
