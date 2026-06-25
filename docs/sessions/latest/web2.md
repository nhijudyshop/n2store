# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-122844-956472c`
**Session file**: [`./20260625-122844-956472c.md`](../20260625-122844-956472c.md)
**Commit**: `956472c` — docs(web2): hướng dẫn lập trình Chat Zalo full-stack
**Last updated**: 2026-06-25 12:28:44 UTC
**Summary**: docs: hướng dẫn lập trình Chat Zalo full-stack (web2)

## Files changed in this commit (`web2/`)
- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-customer-chat-modal.js`
- `web2/shared/web2-customer-chat.js`

## Last 5 commits touching `web2/`
- `a75e147` feat(web2/customer-chat): realtime như live-chat — subscribe SSE web2:messages _(2026-06-25)_
- `03107ca` fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce _(2026-06-25)_
- `c9495a3` auto: session update _(2026-06-25)_
- `9591e8c` feat(web2/ai-hub): Ghép đồ — dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo _(2026-06-25)_
- `ac6f6ce` fix(web2/products): SSE realtime hiện SP mới từ so-order (không cần F5) + region-derive prefix mã _(2026-06-25)_

---
**Để tiếp tục context trong session mới:**
1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-122844-956472c` cho Claude walk chain theo CLAUDE.md protocol.
