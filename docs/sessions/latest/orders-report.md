# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-114806-e5cd3a3`
**Session file**: [`./20260525-114806-e5cd3a3.md`](../20260525-114806-e5cd3a3.md)
**Commit**: `e5cd3a3` — feat(orders-report): gỡ permission gate cho toggle RT & Auto T
**Last updated**: 2026-05-25 11:48:06 +07
**Summary**: feat(orders-report): gỡ permission gate cho toggle RT & Auto T

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-processing-tags.js`
- `orders-report/js/tab1/tab1-tpos-realtime.js`
- `orders-report/tab1-orders.html`

## Last 5 commits touching `orders-report/`

- `e5cd3a34a` feat(orders-report): gỡ permission gate cho toggle RT & Auto T _(2026-05-25)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `5806ca3dd` feat(chat): khi gửi tin nhắn lỗi 24h/no-extension → modal hướng dẫn login FB Business _(2026-05-21)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `2291e2647` fix(orders/kpi-commission): confirm modal kiểm tra đơn hiển thị cho cả đơn chưa có phiếu bán hàng _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-114806-e5cd3a3` cho Claude walk chain theo CLAUDE.md protocol.
