# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-101112-f9995fb`
**Session file**: [`./20260523-101112-f9995fb.md`](../20260523-101112-f9995fb.md)
**Commit**: `f9995fb` — fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block
**Last updated**: 2026-05-23 10:11:12 +07
**Summary**: fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `f9995fbd2` fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block _(2026-05-23)_
- `bbab64083` fix(snap): button không nhấp nháy + chip floating fallback mount _(2026-05-23)_
- `8a51caf59` feat(snap): 2 modes named — 🎬 Chụp Live (default) vs ⏱️ Lưu Time _(2026-05-23)_
- `35d7cc558` feat(snap): di chuyển 📸 button kế bên badge 'Ẩn' trong .tpos-conv-header _(2026-05-23)_
- `056ae57aa` refactor(livestream-snap): default = lazy fetch tại view-time, manual freeze via 🔄 _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-101112-f9995fb` cho Claude walk chain theo CLAUDE.md protocol.
