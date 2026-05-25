# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-140829-e6f1745`
**Session file**: [`./20260525-140829-e6f1745.md`](../20260525-140829-e6f1745.md)
**Commit**: `e6f1745` — feat(delivery-report/tra-soat): phát đúng sound TOMATO / THÀNH PHỐ / NAP khi quét
**Last updated**: 2026-05-25 14:08:29 +07
**Summary**: feat(delivery-report/tra-soat): phát đúng sound TOMATO / THÀNH PHỐ / NAP khi quét

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-fast-sale-workflow.js`
- `orders-report/js/tab1/tab1-processing-tags.js`

## Last 5 commits touching `orders-report/`

- `150a4b2dd` fix(orders-report): chặn auto-flip XL → ĐÃ RA ĐƠN cho đơn ÂM MÃ _(2026-05-25)_
- `e5cd3a34a` feat(orders-report): gỡ permission gate cho toggle RT & Auto T _(2026-05-25)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `5806ca3dd` feat(chat): khi gửi tin nhắn lỗi 24h/no-extension → modal hướng dẫn login FB Business _(2026-05-21)_
- `411482c33` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-140829-e6f1745` cho Claude walk chain theo CLAUDE.md protocol.
