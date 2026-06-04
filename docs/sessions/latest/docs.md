# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-192240-cb1654a`
**Session file**: [`./20260604-192240-cb1654a.md`](../20260604-192240-cb1654a.md)
**Commit**: `cb1654a` — fix(web2-bill): bo nen den invert tren bill (may in trang den) — dung size+dam thay the
**Last updated**: 2026-06-04 19:22:40 +07
**Summary**: fix(web2-bill): bo nen den invert tren bill (may in trang den) — dung size+dam thay the

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `cb1654a22` fix(web2-bill): bo nen den invert tren bill (may in trang den) — dung size+dam thay the _(2026-06-04)_
- `3744ff50f` feat(web2-bill): chuyen bill sang ReceiptLine SVG vector (in sac net, het mo nhiet) _(2026-06-04)_
- `11aea4669` chore(session): RESUME:20260604-191808-06a20a3 _(2026-06-04)_
- `a1bfa0540` chore(session): RESUME:20260604-190646-d1e981e _(2026-06-04)_
- `d1e981efc` fix(web2-sepay): trich xuat SDT 1 nguon (badge=matcher) + giu dash-GD _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-192240-cb1654a` cho Claude walk chain theo CLAUDE.md protocol.
