# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-092404-1f41790`
**Session file**: [`./20260524-092404-1f41790.md`](../20260524-092404-1f41790.md)
**Commit**: `1f41790` — chore(tpos): cache-bust tpos-api.js v20260524a — load fallback Pancake Graph
**Last updated**: 2026-05-24 09:24:04 +07
**Summary**: chore(tpos): cache-bust tpos-api.js v20260524a — load fallback Pancake Graph

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-api.js`

## Last 5 commits touching `tpos-pancake/`

- `1f41790a7` chore(tpos): cache-bust tpos-api.js v20260524a — load fallback Pancake Graph _(2026-05-24)_
- `c6c247bfa` fix(tpos-comments): fail-fast 2.5s + live*filter param + Pancake Graph fallback *(2026-05-24)\_
- `0922c9681` fix(snap): revert click-trap → 1 nút BẬT to rõ ràng trên iframe _(2026-05-23)_
- `d7ca511c9` feat(snap): 1-click embedded FB live capture (no tab switch, no popup) _(2026-05-23)_
- `22fc7d074` feat(snap-extract): detect live*active stream + auto-retry cron mỗi giờ *(2026-05-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-092404-1f41790` cho Claude walk chain theo CLAUDE.md protocol.
