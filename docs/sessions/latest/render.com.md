# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-101621-3a1eeb2`
**Session file**: [`./20260608-101621-3a1eeb2.md`](../20260608-101621-3a1eeb2.md)
**Commit**: `3a1eeb2` — auto: session update
**Last updated**: 2026-06-08 10:16:21 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-live-campaigns.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_
- `6d4176db9` feat(web2): admin endpoint import KH TPOS Partner → warehouse web2*customers (dedupe phone) *(2026-06-08)\_
- `74ead861c` refactor(web2): bỏ partner-customer (TPOS live) + repoint balance-history/customer-wallet sang warehouse _(2026-06-08)_
- `395016ee9` refactor(web2): bỏ TPOS API khỏi native-orders + xóa web2-customer-tpos route _(2026-06-08)_
- `293e4e45c` chore(web2): xóa web2-fb-live.js (unused — live-chat đi thẳng pages.fm) + worker route _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-101621-3a1eeb2` cho Claude walk chain theo CLAUDE.md protocol.
