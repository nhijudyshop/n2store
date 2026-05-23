# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-200123-0922c96`
**Session file**: [`./20260523-200123-0922c96.md`](../20260523-200123-0922c96.md)
**Commit**: `0922c96` — fix(snap): revert click-trap → 1 nút BẬT to rõ ràng trên iframe
**Last updated**: 2026-05-23 20:01:23 +07
**Summary**: fix(snap): revert click-trap → 1 nút BẬT to rõ ràng trên iframe

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `0922c9681` fix(snap): revert click-trap → 1 nút BẬT to rõ ràng trên iframe _(2026-05-23)_
- `d7ca511c9` feat(snap): 1-click embedded FB live capture (no tab switch, no popup) _(2026-05-23)_
- `22fc7d074` feat(snap-extract): detect live*active stream + auto-retry cron mỗi giờ *(2026-05-23)\_
- `cc7133e64` feat(snap): visible toast auto-snap + auto-trigger backend extract + /extract-diag _(2026-05-23)_
- `7f510eb91` fix(snap): cleanup frontend refresh-thumbnail call + E2E updates _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-200123-0922c96` cho Claude walk chain theo CLAUDE.md protocol.
