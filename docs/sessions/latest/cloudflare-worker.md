# Latest Snapshot — `cloudflare-worker/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-104010-4b318b3`
**Session file**: [`./20260615-104010-4b318b3.md`](../20260615-104010-4b318b3.md)
**Commit**: `4b318b3` — feat(worker): route /api/web2-jt-tracking/_ → web2-api (Customer360 proxy)
**Last updated**: 2026-06-15 10:40:10 +07
**Summary**: feat(worker): route /api/web2-jt-tracking/_ → web2-api (Customer360 proxy)

## Files changed in this commit (`cloudflare-worker/`)

- `cloudflare-worker/modules/config/routes.js`
- `cloudflare-worker/worker.js`

## Last 5 commits touching `cloudflare-worker/`

- `4b318b322` feat(worker): route /api/web2-jt-tracking/\* → web2-api (Customer360 proxy) _(2026-06-15)_
- `805a08866` fix(web2-split): route delivery-invoices/refunds to web2-api + repoint hardcoded web2→fallback URLs _(2026-06-14)_
- `d04b01c53` feat(worker): route Web 2.0 paths → web2-api (tách khỏi n2store-fallback) _(2026-06-14)_
- `8bdfc3fc8` feat(web2): Hướng D — dọn nốt Firestore Web 2.0 → Postgres _(2026-06-14)_
- `038554748` feat(worker): route /api/web2-so-order/\* → Render (C8 so-order server storage) _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-104010-4b318b3` cho Claude walk chain theo CLAUDE.md protocol.
