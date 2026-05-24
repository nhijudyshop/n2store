# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-102941-3203655`
**Session file**: [`./20260524-102941-3203655.md`](../20260524-102941-3203655.md)
**Commit**: `3203655` — fix(inventory): chi phí mirror per-(date,đợt) + table auto-refresh khi đổi CP/payment
**Last updated**: 2026-05-24 10:29:41 +07
**Summary**: fix(inventory): chi phí mirror per-(date,đợt) + table auto-refresh khi đổi CP/payment

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `bcf235f87` feat(snap-embed): Step B — dash.js raw stream + video.captureStream (no FB iframe, no share popup) _(2026-05-24)_
- `912f2e1b6` fix(snap-embed): Step A — defer iframe FB inject tới user click (fix lag máy) _(2026-05-24)_
- `72dc2242a` test(snap): expose debug accessors + bench-iframe-capture script _(2026-05-24)_
- `020b3c7b1` fix(snap-embed): full 16:9 video capture + skip FB header chrome _(2026-05-24)_
- `229cb71ff` feat(tpos-comments): archive fallback via SaleOnline*Order (post xóa khỏi FB vẫn có) *(2026-05-24)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-102941-3203655` cho Claude walk chain theo CLAUDE.md protocol.
