# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-183953-0e530bd`
**Session file**: [`./20260607-183953-0e530bd.md`](../20260607-183953-0e530bd.md)
**Commit**: `0e530bd` — feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2_live_campaigns
**Last updated**: 2026-06-07 18:39:53 +07
**Summary**: feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2_live_campaigns

## Files changed in this commit (`web2/`)

- `web2/live-campaign/index.html`
- `web2/live-campaign/js/live-campaign-api.js`

## Last 5 commits touching `web2/`

- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `d8b59e44e` feat(web2/bill): PBH đổi Code128 → QR Code _(2026-06-07)_
- `65df914dd` feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS) _(2026-06-07)_
- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `2b1a72bb8` feat(web2/chat): Feature 2 sticker-send (built-in pack qua REPLY*INBOX_PHOTO STICKER, không cần sửa extension); test OK *(2026-06-07)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-183953-0e530bd` cho Claude walk chain theo CLAUDE.md protocol.
