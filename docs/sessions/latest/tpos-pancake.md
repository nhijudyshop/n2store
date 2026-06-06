# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-105450-7faea80`
**Session file**: [`./20260606-105450-7faea80.md`](../20260606-105450-7faea80.md)
**Commit**: `7faea80` — docs(dev-log): ghi 3 fix tpos-pancake (jank, nút thumbnail, iframe dọc)
**Last updated**: 2026-06-06 10:54:50 +07
**Summary**: docs(dev-log): ghi 3 fix tpos-pancake (jank, nút thumbnail, iframe dọc)

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/js/tpos/tpos-comment-list.js`
- `tpos-pancake/js/tpos/tpos-init.js`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `d2858aa73` fix(tpos-pancake): nút Lấy thumbnail không ăn — chuyển sang event delegation (listener trực tiếp chết khi list re-render), verified extract-frame fired _(2026-06-06)_
- `24921cddf` fix(tpos-pancake): preview livestream PiP đổi sang dọc 9:16 — hết đen 2 bên với FB live dọc (capture crop theo getBoundingClientRect tự khớp) _(2026-06-06)_
- `c4ae0516a` perf(tpos-pancake): cap render 200 newest + infinite scroll (IntersectionObserver) + setTimeout scheduler — hết giật khi chọn nhiều campaign (840ms→76ms, DOM 843→200) _(2026-06-06)_
- `029988458` perf(tpos-pancake): fix giật khi chọn nhiều campaign — chunked render (rIC) + per-row sig-skip + debounce campaign change + serialize render (840ms→372ms block) _(2026-06-06)_
- `1e314eee5` auto: session update _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-105450-7faea80` cho Claude walk chain theo CLAUDE.md protocol.
