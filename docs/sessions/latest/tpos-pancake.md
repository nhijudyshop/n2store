# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-102316-ade7b08`
**Session file**: [`./20260523-102316-ade7b08.md`](../20260523-102316-ade7b08.md)
**Commit**: `ade7b08` — fix(snap URL): strip {pageId}_ prefix + vanity username + locale=vi_VN
**Last updated**: 2026-05-23 10:23:16 +07
**Summary**: fix(snap URL): strip {pageId}_ prefix + vanity username + locale=vi_VN

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `ade7b0896` fix(snap URL): strip {pageId}_ prefix + vanity username + locale=vi_VN _(2026-05-23)\_
- `328ed2788` feat(snap): tutorial modal 3 bước trước khi mở getDisplayMedia picker _(2026-05-23)_
- `f9995fbd2` fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block _(2026-05-23)_
- `bbab64083` fix(snap): button không nhấp nháy + chip floating fallback mount _(2026-05-23)_
- `8a51caf59` feat(snap): 2 modes named — 🎬 Chụp Live (default) vs ⏱️ Lưu Time _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-102316-ade7b08` cho Claude walk chain theo CLAUDE.md protocol.
