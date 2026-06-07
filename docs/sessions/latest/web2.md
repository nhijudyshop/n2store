# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-185938-f7a6a56`
**Session file**: [`./20260607-185938-f7a6a56.md`](../20260607-185938-f7a6a56.md)
**Commit**: `f7a6a56` — feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback)
**Last updated**: 2026-06-07 18:59:38 +07
**Summary**: feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback)

## Files changed in this commit (`web2/`)

- `web2/live-campaign/index.html`
- `web2/live-campaign/js/live-campaign-api.js`

## Last 5 commits touching `web2/`

- `f7a6a56ff` feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback) _(2026-06-07)_
- `0e530bd04` feat(web2): cắt TPOS — picker FB Graph (flag) + live-campaign CRUD→web2*live_campaigns *(2026-06-07)\_
- `d8b59e44e` feat(web2/bill): PBH đổi Code128 → QR Code _(2026-06-07)_
- `65df914dd` feat(web2): Phase 3 — trang Kho Khách Hàng web2/customers (warehouse UI, KHÔNG TPOS) _(2026-06-07)_
- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-185938-f7a6a56` cho Claude walk chain theo CLAUDE.md protocol.
