# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-130323-855cc5e`
**Session file**: [`./20260606-130323-855cc5e.md`](../20260606-130323-855cc5e.md)
**Commit**: `855cc5e` — auto: session update
**Last updated**: 2026-06-06 13:03:23 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `855cc5ec5` auto: session update _(2026-06-06)_
- `d2858aa73` fix(tpos-pancake): nút Lấy thumbnail không ăn — chuyển sang event delegation (listener trực tiếp chết khi list re-render), verified extract-frame fired _(2026-06-06)_
- `24921cddf` fix(tpos-pancake): preview livestream PiP đổi sang dọc 9:16 — hết đen 2 bên với FB live dọc (capture crop theo getBoundingClientRect tự khớp) _(2026-06-06)_
- `c4ae0516a` perf(tpos-pancake): cap render 200 newest + infinite scroll (IntersectionObserver) + setTimeout scheduler — hết giật khi chọn nhiều campaign (840ms→76ms, DOM 843→200) _(2026-06-06)_
- `029988458` perf(tpos-pancake): fix giật khi chọn nhiều campaign — chunked render (rIC) + per-row sig-skip + debounce campaign change + serialize render (840ms→372ms block) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-130323-855cc5e` cho Claude walk chain theo CLAUDE.md protocol.
