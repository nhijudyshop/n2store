# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-131713-4383e15`
**Session file**: [`./20260628-131713-4383e15.md`](../20260628-131713-4383e15.md)
**Commit**: `4383e15` — feat(ai-widget): full-data theo cache browser (Web2SmartCache/IDB) + freshness gate + nút nạp
**Last updated**: 2026-06-28 13:17:13 +07
**Summary**: feat(ai-widget): full-data theo cache browser (Web2SmartCache/IDB) + freshness gate + nút nạp

## Files changed in this commit (`web2/`)

- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `4383e15d2` feat(ai-widget): full-data theo cache browser (Web2SmartCache/IDB) + freshness gate + nút nạp _(2026-06-28)_
- `e1c137b99` feat(web2/system): tab 'Gợi ý AI' — quản lý gợi ý + accessor widget AI theo từng trang _(2026-06-28)_
- `d2b9c0b6b` auto: session update _(2026-06-28)_
- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_
- `267709da5` feat(web2/system): theo dõi hóa đơn SePay + QR thanh toán (creds Render env) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-131713-4383e15` cho Claude walk chain theo CLAUDE.md protocol.
