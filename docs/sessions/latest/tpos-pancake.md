# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-135303-c27b4de`
**Session file**: [`./20260523-135303-c27b4de.md`](../20260523-135303-c27b4de.md)
**Commit**: `c27b4de` — fix(snap): defensive parse comment time + warn on missing
**Last updated**: 2026-05-23 13:53:03 +07
**Summary**: fix(snap): defensive parse comment time + warn on missing

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `c27b4de95` fix(snap): defensive parse comment time + warn on missing _(2026-05-23)_
- `2a57e7031` perf(snap): inline SVG + scoped observer + idle-defer refresh _(2026-05-23)_
- `42fe43a33` fix(snap): offset*seconds dùng commentTime, không phải Date.now() *(2026-05-23)\_
- `276216563` fix(snap refresh-thumbnail): resolve TPOS thumbnail.url thay vì FB Graph 400 _(2026-05-23)_
- `278311c29` fix(snap vanity): _isVanitySlug check — Facebook_UserName là display name không phải vanity _(2026-05-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-135303-c27b4de` cho Claude walk chain theo CLAUDE.md protocol.
